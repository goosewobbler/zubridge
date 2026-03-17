import { debug } from '@zubridge/core';
import type {
  Action,
  AnyState,
  DispatchOptions,
  FlushResult,
  Handlers,
  InternalThunk,
  Thunk,
} from '@zubridge/types';
import type { IpcRendererEvent } from 'electron';
import { contextBridge, ipcRenderer } from 'electron';
import { ActionBatcher, calculatePriority } from './batching/ActionBatcher.js';
import type { BatchAckPayload, BatchPayload, BatchStats } from './batching/types.js';
import { validateActionInRenderer } from './bridge/ipc/validation.js';
import { IpcChannel } from './constants.js';
import { DeltaMerger } from './deltas/DeltaMerger.js';
import type { Delta } from './deltas/types.js';
import { createIPCManager } from './renderer/preloadListeners.js';
import { RendererThunkProcessor } from './renderer/rendererThunkProcessor.js';
import type { PreloadOptions } from './types/preload.js';
import { setupRendererErrorHandlers } from './utils/globalErrorHandlers.js';
import { getBatchingConfig, getPreloadOptions } from './utils/preloadOptions.js';

// Use Web Crypto API for sandbox compatibility
// In sandbox mode, Node.js modules are not available, but Web Crypto API is
const uuidv4 = (): string => {
  // Web Crypto API is available in preload scripts even in sandbox mode
  return self.crypto.randomUUID();
};

// Sandbox-safe platform detection
function detectPlatform(): 'linux' | 'darwin' | 'win32' | 'unknown' {
  // In sandbox mode, PLATFORM is not available
  // Use navigator.userAgent as a fallback
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes('win')) return 'win32';
  if (ua.includes('mac')) return 'darwin';
  if (ua.includes('linux')) return 'linux';
  return 'unknown';
}

const PLATFORM = detectPlatform();

// Type for the subscription validator API that gets exposed to window
interface SubscriptionValidatorAPI {
  getWindowSubscriptions: () => Promise<string[]>;
  isSubscribedToKey: (key: string) => Promise<boolean>;
  validateStateAccess: (key: string) => Promise<boolean>;
  stateKeyExists: (state: unknown, key: string) => boolean;
}

// Extended window type for context isolation disabled mode
type WindowWithZubridgeValidator = Window & {
  __zubridge_subscriptionValidator: SubscriptionValidatorAPI;
};

// Return type for preload bridge function
export interface PreloadZustandBridgeReturn<S extends AnyState> {
  handlers: Handlers<S>;
  initialized: boolean;
  /** Returns current batch stats, or null if batching is disabled. */
  getBatchStats: () => BatchStats | null;
}

/**
 * Creates and returns handlers that the window.zubridge object will expose
 * This uses the Electron IPC bridge to communicate with the main process
 */
export const preloadBridge = <S extends AnyState>(
  options?: PreloadOptions,
): PreloadZustandBridgeReturn<S> => {
  // Setup global error handlers for the renderer process
  setupRendererErrorHandlers();

  const listeners = new Set<(state: S) => void>();
  const deltaMerger = new DeltaMerger<S>();
  let cachedState: S | null = null;
  let expectedSeq = 0;
  let initialized = false;

  // Resolve options once at the start
  const resolvedOptions = getPreloadOptions(options);

  // Get or create the thunk processor
  const getThunkProcessorWithConfig = (): RendererThunkProcessor => {
    debug(
      'core',
      `Creating thunk processor with timeout: ${resolvedOptions.actionCompletionTimeoutMs}ms, maxQueueSize: ${resolvedOptions.maxQueueSize} for platform ${PLATFORM}`,
    );
    return new RendererThunkProcessor(resolvedOptions);
  };

  // Get a properly configured thunk processor
  const thunkProcessor = getThunkProcessorWithConfig();

  // Create IPC manager for listener registration and cleanup
  const { ipcListeners, cleanupRegistry, registerIpcListener } = createIPCManager({ ipcRenderer });

  // Initialize action batcher if enabled
  let actionBatcher: ActionBatcher | null = null;
  const enableBatching = resolvedOptions.enableBatching !== false;
  const batchingConfig = getBatchingConfig(resolvedOptions.batching);

  if (enableBatching) {
    debug('batching', 'Initializing ActionBatcher with config:', batchingConfig);

    // Single persistent listener for all batch acks, keyed by batchId.
    // Avoids accumulating per-batch listeners that can trigger MaxListenersExceededWarning.
    const pendingBatches = new Map<
      string,
      {
        resolve: (ack: BatchAckPayload) => void;
        reject: (err: Error) => void;
        timeoutId: ReturnType<typeof setTimeout>;
      }
    >();

    registerIpcListener(IpcChannel.BATCH_ACK, (_event: IpcRendererEvent, payload: unknown) => {
      const ackPayload = payload as BatchAckPayload;
      if (!ackPayload?.batchId) return;

      const pending = pendingBatches.get(ackPayload.batchId);
      if (!pending) return;

      clearTimeout(pending.timeoutId);
      pendingBatches.delete(ackPayload.batchId);

      if (ackPayload.error) {
        pending.reject(new Error(ackPayload.error));
      } else {
        pending.resolve(ackPayload);
      }
    });

    const PENDING_BATCHES_LIMIT = 1000;

    actionBatcher = new ActionBatcher(batchingConfig, async (batch: BatchPayload) => {
      return new Promise<BatchAckPayload>((resolve, reject) => {
        // Evict oldest pending batch if at capacity to prevent unbounded growth
        if (pendingBatches.size >= PENDING_BATCHES_LIMIT) {
          const oldestKey = pendingBatches.keys().next().value as string;
          const oldest = pendingBatches.get(oldestKey);
          if (oldest) {
            clearTimeout(oldest.timeoutId);
            oldest.reject(new Error(`Batch ${oldestKey} evicted: pending batches limit reached`));
            pendingBatches.delete(oldestKey);
          }
          debug(
            'batching:error',
            `Pending batches at limit (${PENDING_BATCHES_LIMIT}), evicted oldest batch ${oldestKey}`,
          );
        }

        const timeoutMs = batchingConfig.ackTimeoutMs;
        const timeoutId = setTimeout(() => {
          pendingBatches.delete(batch.batchId);
          reject(new Error(`Timeout waiting for batch acknowledgment ${batch.batchId}`));
        }, timeoutMs);

        pendingBatches.set(batch.batchId, { resolve, reject, timeoutId });
        ipcRenderer.send(IpcChannel.BATCH_DISPATCH, batch);
      });
    });
  }

  // Map to track pending thunk registration promises
  const pendingThunkRegistrations = new Map<
    string,
    { resolve: () => void; reject: (err: unknown) => void }
  >();

  // Helper function to track action dispatch
  const trackActionDispatch = (action: Action) => {
    // Send a message to the main process to track this action dispatch
    try {
      if (action.__id) {
        debug('middleware', `Tracking dispatch of action ${action.__id} (${action.type})`);
        ipcRenderer.send(IpcChannel.TRACK_ACTION_DISPATCH, { action });
      }
    } catch (error) {
      debug('middleware:error', 'Error tracking action dispatch:', error);
    }
  };

  // Define the handlers object with subscribe, getState, and dispatch methods
  const handlers: Handlers<S> = {
    // Subscribe to state changes
    subscribe(callback: (state: S) => void) {
      listeners.add(callback);
      debug('ipc', 'Subscribing to state changes');

      // Set up subscription IPC channel if not already done
      if (listeners.size === 1) {
        debug('ipc', 'First subscriber - setting up state update listener');

        // Set up state update tracking listener (now handles ALL state updates)
        registerIpcListener(IpcChannel.STATE_UPDATE, async (_event, payload) => {
          const { updateId, delta, thunkId, seq } = payload as {
            updateId: string;
            delta?: Delta<S>;
            thunkId?: string;
            seq?: number;
          };
          debug('ipc', `Received state update ${updateId} for thunk ${thunkId || 'none'}`);

          // Initialized to cachedState as a safe default — all branches below reassign it,
          // but this prevents "used before assignment" under strict TS control-flow analysis
          // across await boundaries.
          let newState: S = cachedState ?? ({} as S);
          let didUpdate = true;

          // Detect sequence gaps — if we missed updates, the cached state is stale
          // and deltas cannot be safely applied.
          // No expectedSeq > 0 guard: for seq=1 arriving with expectedSeq=0,
          // 1 > 0+1 || 1 < 0 is false (no spurious gap). But if seq=1 is dropped
          // and seq=2 arrives first, 2 > 0+1 is true — gap correctly detected.
          // After a full unsubscribe + resubscribe, the main process resets
          // windowSeqs (restarts at seq=1) while the renderer may still have
          // expectedSeq=N. The backward-jump check (seq < expectedSeq) fires
          // correctly, triggering a getState() resync to refresh cachedState.
          const hasSeqGap = seq !== undefined && (seq > expectedSeq + 1 || seq < expectedSeq);
          // Detect exact retransmits — skip reprocessing to avoid spurious re-renders
          const isDuplicate = seq !== undefined && expectedSeq > 0 && seq === expectedSeq;

          if (isDuplicate) {
            debug(
              'ipc',
              `Duplicate seq ${seq} detected, skipping state merge for update ${updateId}`,
            );
            // Still send ACK so the main-process thunk system doesn't hang
            // waiting for an acknowledgment that never arrives.
            try {
              const windowId = await ipcRenderer.invoke(IpcChannel.GET_WINDOW_ID);
              ipcRenderer.send(IpcChannel.STATE_UPDATE_ACK, { updateId, windowId, thunkId });
            } catch (error) {
              debug('ipc:error', `Error sending ack for duplicate update: ${error}`);
            }
            return;
          }

          // Capture previous expectedSeq for debug logging before overwriting
          const prevExpectedSeq = expectedSeq;

          // Update expectedSeq before any await to prevent concurrent handlers
          // from seeing stale values. After an await (getState), only apply our seq
          // if no concurrent handler has already advanced it further.
          if (seq !== undefined) {
            expectedSeq = seq;
          }

          if (hasSeqGap) {
            debug(
              'ipc',
              `Sequence gap detected (expected ${prevExpectedSeq + 1}, got ${seq}), resyncing via getState`,
            );
            newState = await handlers.getState();
            // Only apply the resync snapshot if no concurrent handler has already
            // advanced cachedState to a newer position during the await
            if (seq === undefined || seq >= expectedSeq) {
              cachedState = newState;
            } else {
              // A concurrent delta handler (seq > this handler's seq) already
              // advanced expectedSeq and applied its delta to cachedState while
              // we were awaiting getState(). Discard our snapshot — it is now
              // older than what cachedState holds.
              // NOTE: The concurrent delta used the pre-resync cachedState as its
              // merge base (stale from before the backward-seq restart). Keys not
              // touched by that delta may still reflect old values until the next
              // state update overwrites them. This is a narrow race (main-process
              // restart while renderer is live) and resolves on the next full
              // state push or any subsequent delta that touches the stale keys.
              didUpdate = false;
            }
          } else if (
            delta?.type === 'delta' &&
            ((delta.changed && Object.keys(delta.changed).length > 0) ||
              (delta.removed && delta.removed.length > 0))
          ) {
            // Delta and full-state branches assign cachedState without a
            // didUpdate/seq guard. This is safe because these branches contain
            // no `await` — the JS event loop guarantees they run atomically
            // within a single microtask and cannot interleave with other handlers.
            // cachedState is null until the first STATE_UPDATE arrives. The
            // initial payload always carries full current state as changed keys,
            // so an empty base is safe. Keys whose values are `undefined` will
            // be absent from both the delta and the resulting cachedState,
            // consistent with JSON serialization semantics.
            const base = cachedState ?? ({} as S);
            newState = deltaMerger.merge(base, delta) as S;
            cachedState = newState;
            debug('ipc', `Merging delta for update ${updateId}`);
          } else if (delta && delta.type === 'full' && delta.fullState != null) {
            // Full state replacement. Cloned via DeltaMerger to prevent IPC payload mutation.
            const isEmptySentinel =
              Object.keys(delta.fullState as Record<string, unknown>).length === 0;
            newState = deltaMerger.merge(cachedState ?? ({} as S), delta) as S;
            cachedState = newState;
            if (isEmptySentinel) {
              // Empty sentinel: subscription is live but all values were stripped
              // by sanitization. Set cachedState (done above) but skip notifying
              // listeners to avoid a flash of empty state before real data arrives.
              didUpdate = false;
            }
            debug('ipc', `Received full state update ${updateId}`);
          } else {
            // No usable delta or full state — fetch current state via IPC.
            // This can happen if the server sends a bare updateId with no payload
            // (e.g. after a main-process state reset without a seq gap).
            debug(
              'ipc',
              `No delta or full state, falling back to IPC getState for update ${updateId}`,
            );
            newState = await handlers.getState();
            if (seq === undefined || seq >= expectedSeq) {
              cachedState = newState;
            } else {
              didUpdate = false;
            }
          }

          // Only notify when we actually updated cachedState — if a concurrent
          // handler advanced state during an await, it already notified listeners
          // with the correct snapshot; re-notifying with our stale result would
          // deliver an out-of-order state to subscribers.
          if (didUpdate) {
            listeners.forEach((fn) => {
              fn(newState);
            });
          }

          // Send acknowledgment back to main process
          debug('ipc', `Sending acknowledgment for state update ${updateId}`);
          try {
            const windowId = await ipcRenderer.invoke(IpcChannel.GET_WINDOW_ID);
            ipcRenderer.send(IpcChannel.STATE_UPDATE_ACK, {
              updateId,
              windowId,
              thunkId,
            });
          } catch (error) {
            debug('ipc:error', `Error sending state update acknowledgment: ${error}`);
          }
        });

        // Initial state will be sent via STATE_UPDATE channel when bridge processes subscriptions
      }

      // Return unsubscribe function
      return () => {
        debug('ipc', 'Unsubscribing from state changes');
        listeners.delete(callback);

        // If no more listeners, clean up IPC listener and cached state.
        // Clearing cachedState to null is safe: on resubscription, the delta
        // branch uses `cachedState ?? ({} as S)` as its merge base, and any
        // resync/fallback path fetches full state via getState().
        if (listeners.size === 0) {
          debug('ipc', 'Last subscriber removed - cleaning up IPC listeners');
          ipcListeners.delete(IpcChannel.STATE_UPDATE);
          cachedState = null;
          expectedSeq = 0;
        }
      };
    },

    // Get current state from main process
    async getState(options?: { bypassAccessControl?: boolean }): Promise<S> {
      debug('ipc', 'Getting state from main process');
      const state = (await ipcRenderer.invoke(IpcChannel.GET_STATE, options)) as S;
      return state;
    },

    // Dispatch actions to main process
    async dispatch(
      action: string | Action | Thunk<S>,
      payloadOrOptions?: unknown,
      optionsIfString?: DispatchOptions,
    ): Promise<Action> {
      // Overload detection: string actions get payload (+optional options),
      // object/thunk/function actions get options as second arg
      let payload: unknown;
      let dispatchOptions: DispatchOptions | undefined;
      if (typeof action === 'string') {
        payload = payloadOrOptions;
        dispatchOptions = optionsIfString;
      } else {
        dispatchOptions = payloadOrOptions as DispatchOptions | undefined;
      }

      debug('ipc', 'Dispatch called with:', { action, payload, dispatchOptions });

      // Use provided options or default to empty object
      const opts = dispatchOptions || {};

      // Extract bypass flags
      const bypassAccessControl = opts.bypassAccessControl;
      const immediate = opts.immediate;

      debug(
        'ipc',
        `Dispatch called with bypass flags: accessControl=${bypassAccessControl}, immediate=${immediate}`,
      );

      // Handle thunks (functions)
      if (typeof action === 'function') {
        debug(
          'ipc',
          `Executing thunk in renderer, bypassAccessControl=${bypassAccessControl}, immediate=${immediate}`,
        );

        const thunk = action as InternalThunk<S>;

        // Store the bypass flags in the options
        const thunkOptions: DispatchOptions = {
          bypassAccessControl: !!bypassAccessControl,
          immediate: !!immediate,
        };

        debug('ipc', `[PRELOAD] Set immediate: ${thunkOptions.immediate} for thunk execution`);

        try {
          // Execute the thunk directly through the thunkProcessor implementation
          // This avoids the circular reference where executeThunk calls back to preload
          const thunkResult = (await thunkProcessor.executeThunk<S>(thunk, thunkOptions)) as Action;
          // Ensure we always return a valid Action object
          if (thunkResult && typeof thunkResult === 'object' && 'type' in thunkResult) {
            // If thunk returns a valid action, ensure it has an ID
            return {
              ...thunkResult,
              __id: thunkResult.__id || uuidv4(),
            };
          }
          if (typeof thunkResult === 'string') {
            // If thunk returns a string, convert to action
            return {
              type: thunkResult,
              __id: uuidv4(),
            };
          }
          // If thunk returns undefined, null, or invalid result, create a default action
          return {
            type: 'THUNK_RESULT',
            payload: thunkResult,
            __id: uuidv4(),
          };
        } catch (thunkError) {
          debug('ipc:error', 'Thunk execution error:', thunkError);
          throw thunkError;
        }
      }

      // For string or action object types, create a standardized action object
      const actionObj: Action =
        typeof action === 'string'
          ? {
              type: action,
              payload,
              __id: uuidv4(),
            }
          : {
              ...action,
              __id: action.__id || uuidv4(),
            };

      // Add bypass flags if specified
      if (bypassAccessControl) {
        actionObj.__bypassAccessControl = true;
      }

      if (immediate) {
        actionObj.__immediate = true;
      }

      debug(
        'ipc',
        `Dispatching action: ${
          actionObj.type
        }, bypassAccessControl=${!!actionObj.__bypassAccessControl}, immediate=${!!actionObj.__immediate}`,
      );

      // Track action dispatch for performance metrics
      trackActionDispatch(actionObj);

      // Route through batcher when available — high-priority actions (e.g. immediate)
      // trigger an immediate flush via the batcher's priority system, so all actions benefit
      const batcher = actionBatcher;
      if (batcher) {
        // Validate action before enqueueing
        validateActionInRenderer(actionObj);
        return new Promise<Action>((resolve, reject) => {
          batcher.enqueue(
            actionObj,
            (resolvedAction) => resolve(resolvedAction),
            reject,
            calculatePriority(actionObj),
          );
        });
      }

      // Individual DISPATCH + DISPATCH_ACK flow (when batching disabled)
      // Validate action BEFORE creating promise and registering listeners
      // to prevent dangling listeners if validation throws
      validateActionInRenderer(actionObj);

      return new Promise<Action>((resolve, reject) => {
        const actionId = actionObj.__id as string;

        // Set up a timeout in case we don't get an acknowledgment
        const timeoutMs = batchingConfig.ackTimeoutMs;
        debug(
          'ipc',
          `Setting up acknowledgment timeout of ${timeoutMs}ms for platform ${PLATFORM}`,
        );
        const timeoutId = setTimeout(() => {
          // Remove the listener if we timed out
          ipcRenderer.removeListener(IpcChannel.DISPATCH_ACK, ackListener);
          debug('ipc:error', `Timeout waiting for acknowledgment of action ${actionId}`);
          reject(new Error(`Timeout waiting for acknowledgment of action ${actionId}`));
        }, timeoutMs);

        // Safe resolve/reject functions that always clear the timeout
        const safeResolve = (value: Action) => {
          clearTimeout(timeoutId);
          resolve(value);
        };
        const safeReject = (error: unknown) => {
          clearTimeout(timeoutId);
          reject(error);
        };

        // Set up a one-time listener for the acknowledgment of this specific action
        const ackListener = (_event: IpcRendererEvent, payload: unknown) => {
          // Check if this acknowledgment is for our action
          const ackPayload = payload as { actionId?: string; error?: string };
          if (ackPayload && ackPayload.actionId === actionId) {
            // Remove the listener since we got our response
            ipcRenderer.removeListener(IpcChannel.DISPATCH_ACK, ackListener);

            if (ackPayload.error) {
              debug('ipc:error', `Action ${actionId} failed with error: ${ackPayload.error}`);
              safeReject(new Error(ackPayload.error));
            } else {
              debug('ipc', `Action ${actionId} completed successfully`);
              safeResolve(actionObj);
            }
          }
        };

        // Register the acknowledgment listener
        ipcRenderer.on(IpcChannel.DISPATCH_ACK, ackListener);

        // Send the action to the main process
        debug('ipc', `Sending action ${actionId} to main process`);
        ipcRenderer.send(IpcChannel.DISPATCH, { action: actionObj });
      });
    },
  };

  // Initialize once on startup
  if (!initialized) {
    initialized = true;

    // Set up acknowledgment listener for the thunk processor
    debug('ipc', 'Set up IPC acknowledgement listener for thunk processor');
    registerIpcListener(IpcChannel.DISPATCH_ACK, (_event: IpcRendererEvent, payload: unknown) => {
      const { actionId, thunkState } =
        (payload as { actionId?: string; thunkState?: unknown }) || {};

      debug('ipc', `Received acknowledgment for action: ${actionId}`);

      if (thunkState) {
        debug(
          'ipc',
          `Received thunk state with ${
            (thunkState as { activeThunks?: unknown[] })?.activeThunks?.length || 0
          } active thunks`,
        );
      }

      // Notify the thunk processor of action completion
      debug('ipc', `Notifying thunk processor of action completion: ${actionId}`);
      thunkProcessor.completeAction(actionId as string, payload);
    });

    // Set up thunk registration ack listener
    registerIpcListener(
      IpcChannel.REGISTER_THUNK_ACK,
      (_event: IpcRendererEvent, payload: unknown) => {
        const thunkPayload = payload as { thunkId?: string; success?: boolean; error?: string };
        const { thunkId, success, error } = thunkPayload || {};
        if (thunkId) {
          const entry = pendingThunkRegistrations.get(thunkId);
          if (entry) {
            if (success) {
              entry.resolve();
            } else {
              entry.reject(error || new Error('Thunk registration failed'));
            }
            pendingThunkRegistrations.delete(thunkId);
          }
        }
      },
    );

    // Setup the thunk processor with window ID and functions
    void (async () => {
      try {
        // Get the current window ID
        const windowId = await ipcRenderer.invoke(IpcChannel.GET_WINDOW_ID);
        debug('ipc', `Got current window ID: ${windowId}`);

        // Initialize the thunk processor with required functions
        thunkProcessor.initialize({
          windowId,
          // Function to send actions to main process (uses batcher if enabled)
          actionSender: async (
            action: Action,
            parentId?: string,
            options?: { batch?: boolean },
          ) => {
            debug(
              'ipc',
              `Sending action: ${action.type}, id: ${action.__id}${parentId ? `, parent: ${parentId}` : ''}${options?.batch ? ', batched' : ''}`,
            );

            // Validate action in renderer (development only)
            validateActionInRenderer(action, parentId);

            // Determine if we should batch this action
            // Thunk actions use direct dispatch by default to avoid deadlock
            // unless explicitly opted in via options.batch
            const isThunkAction = !!parentId;
            const batcher = actionBatcher;

            // Route through batcher — immediate actions get immediate flush via priority system
            if (batcher && (!isThunkAction || options?.batch === true)) {
              const priority = calculatePriority(action);
              const actionId = action.__id as string;
              return new Promise<void>((resolve, reject) => {
                batcher.enqueue(
                  action,
                  () => {
                    // Notify thunk processor of action completion for batched actions
                    // This is needed because BATCH_ACK doesn't trigger the DISPATCH_ACK handler
                    thunkProcessor.completeAction(actionId, action);
                    resolve();
                  },
                  reject,
                  priority,
                  parentId,
                );
              });
            }

            ipcRenderer.send(IpcChannel.DISPATCH, { action, parentId });
          },
          // Function to flush pending batched actions
          batchFlusher: async (): Promise<FlushResult> => {
            if (!actionBatcher) {
              return { batchId: '', actionsSent: 0, actionIds: [] };
            }
            return actionBatcher.flushWithResult(true);
          },
          // Function to register thunks with main process
          thunkRegistrar: async (
            thunkId: string,
            parentId?: string,
            immediate?: boolean,
            bypassAccessControl?: boolean,
          ) => {
            debug('ipc', `[PRELOAD] Registering thunk: thunkId=${thunkId}, immediate=${immediate}`);
            return new Promise<void>((resolve, reject) => {
              const timeoutId = setTimeout(() => {
                pendingThunkRegistrations.delete(thunkId);
                reject(new Error(`Timeout waiting for REGISTER_THUNK_ACK for thunk ${thunkId}`));
              }, batchingConfig.ackTimeoutMs);

              pendingThunkRegistrations.set(thunkId, {
                resolve: () => {
                  clearTimeout(timeoutId);
                  resolve();
                },
                reject: (err) => {
                  clearTimeout(timeoutId);
                  reject(err);
                },
              });
              ipcRenderer.send(IpcChannel.REGISTER_THUNK, {
                thunkId,
                parentId,
                immediate,
                bypassAccessControl,
              });
            });
          },
          // Function to notify thunk completion
          thunkCompleter: async (thunkId: string) => {
            debug('ipc', `Notifying main process of thunk completion: ${thunkId}`);
            ipcRenderer.send(IpcChannel.COMPLETE_THUNK, { thunkId });
          },
        });

        debug('ipc', 'Renderer thunk processor initialized');

        // Create subscription validation API
        const subscriptionValidatorAPI: SubscriptionValidatorAPI = {
          // Get window subscriptions via IPC
          getWindowSubscriptions: async (): Promise<string[]> => {
            try {
              // Get the window ID
              const windowId = await ipcRenderer.invoke(IpcChannel.GET_WINDOW_ID);
              // Then fetch subscriptions for this window ID
              const result = await ipcRenderer.invoke(
                IpcChannel.GET_WINDOW_SUBSCRIPTIONS,
                windowId,
              );
              return Array.isArray(result) ? result : [];
            } catch (error) {
              debug('subscription:error', 'Error getting window subscriptions:', error);
              return [];
            }
          },

          // Check if window is subscribed to a key
          isSubscribedToKey: async (key: string): Promise<boolean> => {
            const subscriptions = await subscriptionValidatorAPI.getWindowSubscriptions();

            // Subscribed to everything with '*'
            if (subscriptions.includes('*')) {
              return true;
            }

            // Check direct key match
            if (subscriptions.includes(key)) {
              return true;
            }

            // Check if the key is a parent of any subscription (e.g., 'user' includes 'user.profile')
            if (key.includes('.')) {
              const keyParts = key.split('.');
              for (let i = 1; i <= keyParts.length; i++) {
                const parentKey = keyParts.slice(0, i).join('.');
                if (subscriptions.includes(parentKey)) {
                  return true;
                }
              }
            }

            // Check if any subscription is a parent of this key (e.g., 'user' subscription includes 'user.profile' access)
            for (const subscription of subscriptions) {
              if (key.startsWith(`${subscription}.`)) {
                return true;
              }
            }

            return false;
          },

          // Validate that we have access to a key
          validateStateAccess: async (key: string): Promise<boolean> => {
            const isSubscribed = await subscriptionValidatorAPI.isSubscribedToKey(key);
            if (!isSubscribed) {
              debug(
                'subscription:error',
                `State access validation failed: not subscribed to key '${key}'`,
              );
              return false;
            }
            return true;
          },

          // Check if a state key exists in an object
          stateKeyExists: (state: unknown, key: string): boolean => {
            if (!key || !state || typeof state !== 'object') return false;

            // Handle dot notation by traversing the object
            const parts = key.split('.');
            let current = state as Record<string, unknown>;

            for (const part of parts) {
              if (current === undefined || current === null || typeof current !== 'object') {
                return false;
              }

              if (!(part in current)) {
                return false;
              }

              current = current[part] as Record<string, unknown>;
            }

            return true;
          },
        };

        // Expose the subscription validator API to the window
        debug('ipc', 'Exposing subscription validator API to window');
        // Try using contextBridge first (required for context isolation)
        // If it fails, fall back to direct window attachment
        try {
          contextBridge.exposeInMainWorld(
            '__zubridge_subscriptionValidator',
            subscriptionValidatorAPI,
          );
        } catch {
          // Context isolation disabled - directly attach to window
          (window as unknown as WindowWithZubridgeValidator).__zubridge_subscriptionValidator =
            subscriptionValidatorAPI;
        }

        // Add a state provider to the thunk processor
        thunkProcessor.setStateProvider((opts) => handlers.getState(opts));

        debug('ipc', 'Preload script initialized successfully');

        // Set up cleanup on page unload to prevent memory leaks
        if (typeof window !== 'undefined') {
          // Critical synchronous cleanup for beforeunload
          const beforeUnloadHandler = () => {
            debug('ipc', 'Page unloading, performing critical synchronous cleanup');
            performCriticalCleanup();
          };

          // Full async cleanup for pagehide
          const pagehideHandler = async (event: PageTransitionEvent) => {
            if (event.persisted) {
              // Page is being cached, do minimal cleanup
              debug('ipc', 'Page cached, performing partial cleanup');
              await performPartialCleanup();
            } else {
              // Page is being unloaded, do complete cleanup
              debug('ipc', 'Page unloading, performing complete cleanup');
              await performCompleteCleanup();
            }
          };

          const visibilityChangeHandler = () => {
            if (document.visibilityState === 'hidden') {
              debug('ipc', 'Page hidden, cleaning up expired resources');
              performPartialCleanup().catch((error) => {
                debug('cleanup:error', 'Error during visibility cleanup:', error);
              });
            }
          };

          window.addEventListener('beforeunload', beforeUnloadHandler);
          window.addEventListener('pagehide', pagehideHandler);
          document.addEventListener('visibilitychange', visibilityChangeHandler);

          // Track DOM event listeners for cleanup
          cleanupRegistry.dom.add(() => {
            window.removeEventListener('beforeunload', beforeUnloadHandler);
            window.removeEventListener('pagehide', pagehideHandler);
            document.removeEventListener('visibilitychange', visibilityChangeHandler);
          });
        }
      } catch (error) {
        debug('core:error', 'Error initializing preload script:', error);
      }
    })();
  }

  // Cleanup functions for resource management
  const performPartialCleanup = async (): Promise<void> => {
    debug('ipc', 'Performing partial cleanup of expired resources');

    // Directly call forceCleanupExpiredActions instead of routing through registry
    // to avoid accumulating callbacks if this is called multiple times rapidly
    thunkProcessor.forceCleanupExpiredActions();

    if (pendingThunkRegistrations.size > 0) {
      debug(
        'ipc',
        `Found ${pendingThunkRegistrations.size} pending thunk registrations during partial cleanup`,
      );
    }
  };

  // Critical synchronous cleanup for beforeunload
  const performCriticalCleanup = (): void => {
    debug('ipc', 'Performing critical synchronous cleanup');

    // Only essential synchronous cleanup here
    listeners.clear();
    cachedState = null;
    expectedSeq = 0;

    // Cancel pending registrations immediately
    for (const [thunkId, { reject }] of pendingThunkRegistrations) {
      try {
        reject(new Error('Page unload - thunk registration cancelled'));
      } catch (error: unknown) {
        // Can't use debug here as it might be async
        console.error(`Error rejecting thunk registration ${thunkId}:`, error);
      }
    }
    pendingThunkRegistrations.clear();
  };

  const performCompleteCleanup = async (): Promise<void> => {
    debug('ipc', 'Performing complete cleanup of all resources');

    // Add batcher cleanup
    if (actionBatcher) {
      actionBatcher.destroy();
      actionBatcher = null;
    }

    // Clean up thunk processor
    thunkProcessor.destroy();

    // Clean up pending registrations
    const pendingCount = pendingThunkRegistrations.size;
    for (const [thunkId, { reject }] of pendingThunkRegistrations) {
      try {
        reject(new Error('Complete cleanup - thunk registration cancelled'));
      } catch (error: unknown) {
        debug('ipc:error', `Error rejecting pending thunk registration ${thunkId}:`, error);
      }
    }
    pendingThunkRegistrations.clear();
    if (pendingCount > 0) {
      debug('ipc', `Cleaned up ${pendingCount} pending registrations`);
    }

    // Perform IPC and DOM cleanups
    await cleanupRegistry.cleanupAll();

    // Clear listeners set
    listeners.clear();

    debug('ipc', 'Complete cleanup finished successfully');
  };

  return {
    handlers,
    initialized,
    getBatchStats: () => actionBatcher?.getStats() ?? null,
  };
};

export type PreloadBridge = typeof preloadBridge;
