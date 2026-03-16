import { randomUUID } from 'node:crypto';
import { debug } from '@zubridge/core';
import type { AnyState, StateManager, WrapperOrWebContents } from '@zubridge/types';
import type { WebContents } from 'electron';
import { IpcChannel } from '../../constants.js';
import { DeltaCalculator } from '../../deltas/DeltaCalculator.js';
import type { Delta } from '../../deltas/types.js';
import { getDeltaConfig } from '../../deltas/types.js';
import { getPartialState, SubscriptionManager } from '../../subscription/SubscriptionManager.js';
import { thunkManager } from '../../thunk/init.js';
import { deepGet } from '../../utils/deepGet.js';
import { sanitizeState } from '../../utils/serialization.js';
import {
  getWebContents,
  isDestroyed,
  safelySendToWindow,
  setupDestroyListener,
  type WebContentsTracker,
} from '../../utils/windows.js';
import type { ResourceManager } from '../resources/ResourceManager.js';

export class SubscriptionHandler<State extends AnyState> {
  private deltaCalculator: DeltaCalculator<State>;
  private deltaConfig: ReturnType<typeof getDeltaConfig>;
  private windowSeqs: Map<number, number> = new Map();

  constructor(
    private stateManager: StateManager<State>,
    private resourceManager: ResourceManager<State>,
    private windowTracker: WebContentsTracker,
    private serializationMaxDepth?: number,
    deltaOptions?: { enabled?: boolean },
  ) {
    this.deltaCalculator = new DeltaCalculator<State>();
    this.deltaConfig = getDeltaConfig(deltaOptions);
  }

  private nextSeq(windowId: number): number {
    const current = this.windowSeqs.get(windowId) ?? 0;
    const next = current + 1;
    this.windowSeqs.set(windowId, next);
    return next;
  }

  /**
   * Subscribe windows to state updates for specific keys.
   */
  selectiveSubscribe(
    windows: WrapperOrWebContents[] | WrapperOrWebContents,
    keys?: string[],
  ): { unsubscribe: () => void } {
    const wrappers = Array.isArray(windows) ? windows : [windows];
    const unsubs: Array<() => void> = [];
    const subscribedWebContents: WebContents[] = [];
    const normalizedKeys = this.deltaCalculator.normalizeKeys(keys);

    for (const wrapper of wrappers) {
      const webContents = getWebContents(wrapper);
      if (!webContents || isDestroyed(webContents)) continue;

      this.windowTracker.track(webContents);
      subscribedWebContents.push(webContents);

      let subManager = this.resourceManager.getSubscriptionManager(webContents.id);
      if (!subManager) {
        subManager = new SubscriptionManager<State>();
        this.resourceManager.addSubscriptionManager(webContents.id, subManager);
      }

      // Set up a destroy listener to clean up subscriptions when the window is closed
      if (!this.resourceManager.hasDestroyListener(webContents.id)) {
        setupDestroyListener(webContents, () => {
          debug(
            'thunk',
            `Window ${webContents.id} destroyed, cleaning up subscriptions and pending state updates`,
          );
          this.resourceManager.removeSubscriptionManager(webContents.id);
          this.windowSeqs.delete(webContents.id);
          // Clean up dead renderer from pending state updates to prevent hanging acknowledgments
          thunkManager.cleanupDeadRenderer(webContents.id);
        });
        this.resourceManager.addDestroyListener(webContents.id);
      }

      // Skip empty-key subscriptions before registering with the SubscriptionManager.
      // An empty-key subscription would create a dead entry (delta calculator iterates
      // zero keys, so no updates are ever sent) and waste CPU on every notify() call.
      if (Array.isArray(normalizedKeys) && normalizedKeys.length === 0) {
        continue;
      }

      // Register a subscription for the keys with an actual callback that sends state updates
      const windowId = webContents.id;
      // Per-subscription previous state to avoid corruption when multiple subscriptions
      // exist for the same window (each subscription tracks its own diff baseline)
      let subscriptionPrevState: State | undefined;
      const subscribeResult = subManager.subscribe(
        normalizedKeys === '*' ? undefined : normalizedKeys,
        (state) => {
          debug('core', `Sending state update to window ${windowId}`);
          const serializationOptions: { maxDepth?: number } = {};
          if (this.serializationMaxDepth !== undefined) {
            serializationOptions.maxDepth = this.serializationMaxDepth;
          }

          // Calculate delta first to determine if an update should be sent
          // subscriptionPrevState is always defined here — seeded synchronously
          // at subscription time before any notify() can fire.
          if (this.deltaConfig.enabled) {
            const delta = this.deltaCalculator.calculate(
              subscriptionPrevState ?? ({} as State),
              state as State,
              normalizedKeys,
            );

            if (!delta) {
              // Nothing changed — skip sending an update entirely
              debug('core', `No changes detected for window ${windowId}, skipping update`);
              subscriptionPrevState = state as State;
              return;
            }

            const sanitizedDelta = this.sanitizeDelta(delta, serializationOptions);

            // If sanitization stripped all content (e.g. all values were functions),
            // skip the send entirely. An empty delta would cause the renderer to
            // fall through to getState(), leaking the full store for selective subs.
            const hasContent =
              (sanitizedDelta.changed && Object.keys(sanitizedDelta.changed).length > 0) ||
              (sanitizedDelta.removed && sanitizedDelta.removed.length > 0) ||
              (sanitizedDelta.type === 'full' &&
                sanitizedDelta.fullState != null &&
                Object.keys(sanitizedDelta.fullState).length > 0);

            if (!hasContent) {
              debug(
                'core',
                `Delta fully stripped by sanitization for window ${windowId}, skipping send`,
              );
              subscriptionPrevState = state as State;
              return;
            }

            // Generate update ID and track thunk only when we will actually send
            const updateId = randomUUID();
            const currentThunkId = thunkManager.getCurrentThunkActionId();

            if (currentThunkId) {
              thunkManager.trackStateUpdateForThunk(currentThunkId, updateId, [windowId]);
              debug(
                'core',
                `Tracking state update ${updateId} for thunk ${currentThunkId} (thunk-generated)`,
              );
            } else {
              debug('core', `State update ${updateId} not tracked (not from thunk action)`);
            }

            debug('core', `Sending delta update to window ${windowId}:`, delta);

            safelySendToWindow(webContents, IpcChannel.STATE_UPDATE, {
              updateId,
              delta: sanitizedDelta,
              thunkId: currentThunkId,
              seq: this.nextSeq(windowId),
            });
          } else {
            // Deltas are disabled — send the full sanitised state on every update
            // Apply key-filtering so selective subscriptions don't leak the full store
            const partialState = getPartialState(
              state as State,
              normalizedKeys === '*' ? undefined : normalizedKeys,
            );
            const sanitizedState = sanitizeState(partialState, serializationOptions);

            // Detect removed keys for selective subscriptions — keys that existed
            // in the previous partial state but are now undefined in the new state.
            let removedKeys: string[] | undefined;
            if (Array.isArray(normalizedKeys) && subscriptionPrevState) {
              const removed: string[] = [];
              for (const key of normalizedKeys) {
                const prevValue = deepGet(subscriptionPrevState as Record<string, unknown>, key);
                const nextValue = deepGet(state as Record<string, unknown>, key);
                if (prevValue !== undefined && nextValue === undefined) {
                  removed.push(key);
                }
              }
              if (removed.length > 0) removedKeys = removed;
            }

            // Skip send if sanitized state is empty AND no keys were removed
            // (e.g. all values were non-serializable) — avoids tracking a thunk
            // that never gets ACKed
            const hasState = sanitizedState != null && Object.keys(sanitizedState).length > 0;
            if (!hasState && !removedKeys) {
              subscriptionPrevState = state as State;
              return;
            }

            const updateId = randomUUID();
            const currentThunkId = thunkManager.getCurrentThunkActionId();

            if (currentThunkId) {
              thunkManager.trackStateUpdateForThunk(currentThunkId, updateId, [windowId]);
              debug(
                'core',
                `Tracking state update ${updateId} for thunk ${currentThunkId} (thunk-generated)`,
              );
            } else {
              debug('core', `State update ${updateId} not tracked (not from thunk action)`);
            }

            if (normalizedKeys === '*') {
              // Full subscription — safe to replace entire state
              debug('core', `Sending full state update to window ${windowId}`);
              safelySendToWindow(webContents, IpcChannel.STATE_UPDATE, {
                updateId,
                delta: { type: 'full', fullState: sanitizedState },
                thunkId: currentThunkId,
                seq: this.nextSeq(windowId),
              });
            } else {
              // Selective subscription — send as delta so the renderer merges into
              // cachedState rather than replacing it, which would drop state from
              // other subscriptions on the same window
              debug('core', `Sending selective state update to window ${windowId}`);
              const deltaChanged = this.stateToDeltaKeys(
                sanitizedState as Partial<State>,
                normalizedKeys,
              );
              safelySendToWindow(webContents, IpcChannel.STATE_UPDATE, {
                updateId,
                delta: {
                  type: 'delta',
                  changed: Object.keys(deltaChanged).length > 0 ? deltaChanged : undefined,
                  removed: removedKeys,
                },
                thunkId: currentThunkId,
                seq: this.nextSeq(windowId),
              });
            }
          }

          // Update previous state for next delta calculation
          subscriptionPrevState = state as State;
        },
        windowId,
      );
      // When superseded by an existing '*' subscription, no callback was registered.
      // We still send the initial-state delta below so the component can initialize.
      if (subscribeResult.status === 'registered') {
        unsubs.push(subscribeResult.unsubscribe);
      }

      const fullState = this.stateManager.getState();
      const serializationOptions: { maxDepth?: number } = {};
      if (this.serializationMaxDepth !== undefined) {
        serializationOptions.maxDepth = this.serializationMaxDepth;
      }

      const partialState = getPartialState(
        fullState,
        normalizedKeys === '*' ? undefined : normalizedKeys,
      );
      const currentState = sanitizeState(partialState, serializationOptions);

      // Seed per-subscription prevState with the sanitized partial state — the
      // same form that notify() will deliver to the callback. Using raw full
      // state here would cause spurious diffs for values that differ between
      // raw and sanitized form (e.g. Dates, Buffers).
      subscriptionPrevState = currentState as State;

      // Generate update ID for current state
      const updateId = randomUUID();

      debug(
        'core',
        `Sending current state update ${updateId} to window ${webContents.id} (keys: ${keys ? keys.join(', ') : 'all'})`,
      );

      // Send initial state as a delta payload to properly handle overlapping subscriptions.
      // Using dot-path keys ensures multiple subscriptions with shared ancestors (e.g.
      // ['user.name'] and ['user.profile']) merge correctly instead of overwriting each other.
      const deltaChanged = this.stateToDeltaKeys(
        currentState as Partial<State>,
        normalizedKeys === '*' ? undefined : normalizedKeys,
      );

      // Skip send if all values were stripped by sanitization (e.g. all non-serializable).
      // An empty delta causes the renderer to fall back to getState(), leaking the full store.
      if (Object.keys(deltaChanged).length === 0) {
        subscriptionPrevState = currentState as State;
        continue;
      }

      safelySendToWindow(webContents, IpcChannel.STATE_UPDATE, {
        updateId,
        delta: {
          type: 'delta',
          changed: deltaChanged,
        },
        thunkId: undefined,
        seq: this.nextSeq(webContents.id),
      });
    }

    return {
      unsubscribe: () => {
        unsubs.forEach((fn) => {
          fn();
        });
        subscribedWebContents.forEach((webContents) => {
          // Only untrack the window if it has no remaining subscriptions.
          const subMgr = this.resourceManager.getSubscriptionManager(webContents.id);
          if (!subMgr || subMgr.getCurrentSubscriptionKeys(webContents.id).length === 0) {
            this.windowTracker.untrack(webContents);
          }
        });
      },
    };
  }

  /**
   * Subscribe windows to state updates.
   */
  subscribe(
    windows: WrapperOrWebContents[] | WrapperOrWebContents,
    keys?: string[],
  ): { unsubscribe: () => void } {
    debug(
      'core',
      `[subscribe] Called with windows and keys: ${keys ? JSON.stringify(keys) : 'undefined'}`,
    );

    // If windows is not provided, subscribe all windows to full state
    if (!windows) {
      const allWindows = this.windowTracker.getActiveWebContents();
      return this.selectiveSubscribe(allWindows);
    }

    // Pass keys as undefined (not []) when not specified to subscribe to all state
    // This ensures subscribe(windows) subscribes to all state
    return this.selectiveSubscribe(windows, keys);
  }

  private sanitizeDelta(delta: Delta<State>, options: { maxDepth?: number }): Delta<State> {
    if (delta.type === 'full') {
      return {
        type: 'full',
        fullState: delta.fullState
          ? (sanitizeState(delta.fullState as State, options) as Partial<State>)
          : undefined,
      };
    }

    // Sanitize each value individually rather than treating the whole changed record
    // as a State object. delta.changed uses dot-path keys (e.g. 'user.profile.theme')
    // which are flat top-level keys, not nested paths — passing them through sanitizeState
    // as-is works for primitives but the cast to State silently drops type safety.
    const sanitizedChanged = delta.changed
      ? Object.fromEntries(
          Object.entries(delta.changed)
            .map(([k, v]) => {
              // Functions, Symbols, and BigInts are not structured-clone serializable
              // and would cause DataCloneError over IPC — strip them.
              if (typeof v === 'function' || typeof v === 'symbol' || typeof v === 'bigint')
                return [k, undefined];
              // sanitizeState's internal serialize() handles both plain objects and
              // arrays (recursively stripping functions, Dates, etc.), so this works
              // for array-valued keys despite the State cast.
              if (v !== null && typeof v === 'object')
                return [k, sanitizeState(v as State, options)];
              return [k, v];
            })
            .filter(([, v]) => v !== undefined),
        )
      : undefined;

    return {
      type: 'delta',
      // If all values were stripped (e.g. all functions), return undefined rather
      // than an empty {} — an empty changed object would cause the renderer to
      // skip the merge branch and fall back to a full getState() round-trip.
      changed:
        sanitizedChanged && Object.keys(sanitizedChanged).length > 0 ? sanitizedChanged : undefined,
      removed: delta.removed,
    };
  }

  /** Extracts dot-path key→value pairs from partialState.
   *  All callers pass already-normalised keys (trimmed, deduped by DeltaCalculator). */
  private stateToDeltaKeys(partialState: Partial<State>, keys?: string[]): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    if (keys?.length === 0) {
      return {};
    }

    if (keys === undefined) {
      const stateObj = partialState as Record<string, unknown>;
      for (const key of Object.keys(stateObj)) {
        if (stateObj[key] !== undefined) {
          result[key] = stateObj[key];
        }
      }
      return result;
    }

    for (const key of keys) {
      const value = deepGet(partialState as Record<string, unknown>, key);
      if (value !== undefined) {
        result[key] = value;
      }
    }

    return result;
  }

  /**
   * Unsubscribe windows from state updates.
   */
  unsubscribe(windows?: WrapperOrWebContents[] | WrapperOrWebContents, keys?: string[]): void {
    // If windows is not provided, unsubscribe all windows
    if (!windows) {
      this.windowSeqs.clear();
      this.resourceManager.clearAll();
      this.windowTracker.cleanup();
      return;
    }

    const wrappers = Array.isArray(windows) ? windows : [windows];
    for (const wrapper of wrappers) {
      const webContents = getWebContents(wrapper);
      if (!webContents) continue;
      const windowId = webContents.id;
      const subManager = this.resourceManager.getSubscriptionManager(windowId);
      if (subManager) {
        subManager.unsubscribe(keys, () => {}, windowId);
        if (subManager.getCurrentSubscriptionKeys(windowId).length === 0) {
          this.resourceManager.removeSubscriptionManager(windowId);
          this.windowSeqs.delete(windowId);
          this.windowTracker.untrack(webContents);
        }
      } else {
        // No subscription manager means no subscriptions — safe to untrack
        this.windowTracker.untrack(webContents);
      }
    }
  }
}
