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
  private prevStates: Map<number, State> = new Map();

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
          this.prevStates.delete(webContents.id);
          // Clean up dead renderer from pending state updates to prevent hanging acknowledgments
          thunkManager.cleanupDeadRenderer(webContents.id);
        });
        this.resourceManager.addDestroyListener(webContents.id);
      }

      // Register a subscription for the keys with an actual callback that sends state updates
      const windowId = webContents.id;
      const unsubscribe = subManager.subscribe(
        keys,
        (state) => {
          debug('core', `Sending state update to window ${windowId}`);
          const serializationOptions: { maxDepth?: number } = {};
          if (this.serializationMaxDepth !== undefined) {
            serializationOptions.maxDepth = this.serializationMaxDepth;
          }

          // Calculate delta first to determine if an update should be sent
          const prevState = this.prevStates.get(windowId);
          if (this.deltaConfig.enabled && prevState !== undefined) {
            const delta = this.deltaCalculator.calculate(prevState, state as State, normalizedKeys);

            if (!delta) {
              // Nothing changed — skip sending an update entirely
              debug('core', `No changes detected for window ${windowId}, skipping update`);
              this.prevStates.set(windowId, state as State);
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

            const sanitizedDelta = this.sanitizeDelta(delta, serializationOptions);
            debug('core', `Sending delta update to window ${windowId}:`, delta);

            safelySendToWindow(webContents, IpcChannel.STATE_UPDATE, {
              updateId,
              delta: sanitizedDelta,
              thunkId: currentThunkId,
            });
          } else {
            // Full state for initial update or when deltas are disabled
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

            const sanitizedState = sanitizeState(state, serializationOptions);
            debug('core', `Sending full state update to window ${windowId}`);

            safelySendToWindow(webContents, IpcChannel.STATE_UPDATE, {
              updateId,
              state: sanitizedState,
              thunkId: currentThunkId,
            });
          }

          // Update previous state for next delta calculation
          this.prevStates.set(windowId, state as State);
        },
        windowId,
      );
      unsubs.push(unsubscribe);

      // Always send current state when subscribing (not just on first track)
      // This ensures the renderer gets the correct filtered state when resubscribing
      const serializationOptions: { maxDepth?: number } = {};
      if (this.serializationMaxDepth !== undefined) {
        serializationOptions.maxDepth = this.serializationMaxDepth;
      }
      const fullState = this.stateManager.getState();
      const partialState = getPartialState(fullState, keys);
      const currentState = sanitizeState(partialState, serializationOptions);

      // Generate update ID for current state
      const updateId = randomUUID();

      debug(
        'core',
        `Sending current state update ${updateId} to window ${webContents.id} (keys: ${keys ? keys.join(', ') : 'all'})`,
      );

      // Send current state with tracking information
      safelySendToWindow(webContents, IpcChannel.STATE_UPDATE, {
        updateId,
        state: currentState,
        thunkId: undefined, // Initial/current state is never from a thunk
      });

      // Seed prevStates so the first change can be sent as a delta
      this.prevStates.set(webContents.id, fullState as State);
    }

    return {
      unsubscribe: () => {
        unsubs.forEach((fn) => {
          fn();
        });
        subscribedWebContents.forEach((webContents) => {
          this.windowTracker.untrack(webContents);
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
        version: delta.version,
        fullState: delta.fullState
          ? (sanitizeState(delta.fullState as State, options) as Partial<State>)
          : undefined,
      };
    }

    return {
      type: 'delta',
      version: delta.version,
      changed: delta.changed
        ? (sanitizeState(delta.changed as State, options) as Record<string, unknown>)
        : undefined,
      removed: delta.removed,
    };
  }

  /**
   * Unsubscribe windows from state updates.
   */
  unsubscribe(windows?: WrapperOrWebContents[] | WrapperOrWebContents, keys?: string[]): void {
    // If windows is not provided, unsubscribe all windows
    if (!windows) {
      this.prevStates.clear();
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
          this.prevStates.delete(windowId);
        }
      }
      this.windowTracker.untrack(webContents);
    }
  }
}
