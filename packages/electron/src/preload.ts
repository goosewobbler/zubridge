import { debug } from '@zubridge/core';
import type {
  Action,
  AnyState,
  DispatchOptions,
  Handlers,
  InternalThunk,
  Thunk,
} from '@zubridge/types';
import type { IpcRendererEvent } from 'electron';
import { contextBridge, ipcRenderer } from 'electron';
import { ActionBatcher, calculatePriority } from './batching/ActionBatcher.js';
import type { BatchAckPayload, BatchPayload } from './batching/types.js';
import { IpcChannel } from './constants.js';
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

  // Initialize action batcher if enabled
  let actionBatcher: ActionBatcher | null = null;
  const enableBatching = resolvedOptions.enableBatching !== false;

  if (enableBatching) {
    const batchingConfig = getBatchingConfig(resolvedOptions.batching);
    debug('batching', 'Initializing ActionBatcher with config:', batchingConfig);

    actionBatcher = new ActionBatcher(batchingConfig, async (batch: BatchPayload) => {
      return new Promise<BatchAckPayload>((resolve, reject) => {
        const timeoutMs = PLATFORM === 'linux' ? 60000 : 30000;
        const timeoutId = setTimeout(() => {
          ipcRenderer.removeListener(IpcChannel.BATCH_ACK, batchAckListener);
          reject(new Error(`Timeout waiting for batch acknowledgment ${batch.batchId}`));
        }, timeoutMs);

        const batchAckListener = (_event: IpcRendererEvent, payload: unknown) => {
          const ackPayload = payload as BatchAckPayload;
          if (ackPayload && ackPayload.batchId === batch.batchId) {
            clearTimeout(timeoutId);
            ipcRenderer.removeListener(IpcChannel.BATCH_ACK, batchAckListener);

            if (ackPayload.error) {
              reject(new Error(ackPayload.error));
            } else {
              resolve(ackPayload);
            }
          }
        };

        ipcRenderer.on(IpcChannel.BATCH_ACK, batchAckListener);
        ipcRenderer.send(IpcChannel.BATCH_DISPATCH, batch);
      });
    });
  }

  // Map to track pending thunk registration promises
  const pendingThunkRegistrations = new Map<
    string,
    { resolve: () => void; reject: (err: unknown) => void }
  >();

  // Cleanup registry for different types of resources
  class CleanupRegistry {
    private cleanups: Array<() => void | Promise<void>> = [];

    add(cleanup: () => void | Promise<void>): void {
      this.cleanups.push(cleanup);
    }

    async cleanupAll(): Promise<void> {
      const results = await Promise.allSettled(this.cleanups.map((cleanup) => cleanup()));

      // Log any failures but don't throw
      results.forEach((result, index) => {
        if (result.status === 'rejected') {
          debug('cleanup:error', `Cleanup ${index} failed:`, result.reason);
        }
      });

      this.cleanups.length = 0; // Clear array
    }
  }

  const cleanupRegistry = {
    ipc: new CleanupRegistry(),
    dom: new CleanupRegistry(),
    thunks: new CleanupRegistry(),

    async cleanupAll() {
      await Promise.all([this.ipc.cleanupAll(), this.dom.cleanupAll(), this.thunks.cleanupAll()]);
    },
  };

  const ipcListeners = new Map<
    string,
    (event: Electron.IpcRendererEvent, ...args: unknown[]) => void
  >();

  // Helper function to register IPC listeners with cleanup tracking
  const registerIpcListener = (
    channel: string,
    listener: (event: Electron.IpcRendererEvent, ...args: unknown[]) => void,
  ) => {
    try {
      // Remove any existing listener for this channel
      const existingListener = ipcListeners.get(channel);
      if (existingListener) {
        ipcRenderer.removeListener(channel, existingListener);
      }

      // Register new listener
      ipcRenderer.on(channel, listener);
      ipcListeners.set(channel, listener);

      // Add IPC cleanup to registry
      cleanupRegistry.ipc.add(() => {
        ipcRenderer.removeListener(channel, listener);
        ipcListeners.delete(channel);
      });
    } catch (error) {
      debug('ipc:error', `Failed to register IPC listener for channel ${channel}:`, error);
    }
  };

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
          const { updateId, state, thunkId } = payload as {
            updateId: string;
            state: S;
            thunkId?: string;
          };
          debug('ipc', `Received state update ${updateId} for thunk ${thunkId || 'none'}`);

          // Notify all subscribers of the state change
          listeners.forEach((fn) => {
            fn(state);
          });

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

        // If no more listeners, clean up IPC listener
        if (listeners.size === 0) {
          debug('ipc', 'Last subscriber removed - cleaning up IPC listeners');
          const stateUpdateListener = ipcListeners.get(IpcChannel.STATE_UPDATE);
          if (stateUpdateListener) {
            ipcRenderer.removeListener(IpcChannel.STATE_UPDATE, stateUpdateListener);
            ipcListeners.delete(IpcChannel.STATE_UPDATE);
          }
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
      payloadOrOptions?: unknown | DispatchOptions,
      options?: DispatchOptions,
    ): Promise<Action> {
      debug('ipc', 'Dispatch called with:', { action, payloadOrOptions, options });

      // Extract options or default to empty object
      let dispatchOptions: DispatchOptions;
      // Check if payloadOrOptions has DispatchOptions properties
      const isOptions =
        payloadOrOptions &&
        typeof payloadOrOptions === 'object' &&
        !Array.isArray(payloadOrOptions) &&
        ('bypassAccessControl' in payloadOrOptions || 'bypassThunkLock' in payloadOrOptions);

      if (isOptions) {
        dispatchOptions = payloadOrOptions as DispatchOptions;
      } else {
        dispatchOptions = options || {};
      }

      // Extract bypass flags
      const bypassAccessControl = dispatchOptions.bypassAccessControl;
      const bypassThunkLock = dispatchOptions.bypassThunkLock;

      debug(
        'ipc',
        `Dispatch called with bypass flags: accessControl=${bypassAccessControl}, thunkLock=${bypassThunkLock}`,
      );

      // Handle thunks (functions)
      if (typeof action === 'function') {
        debug(
          'ipc',
          `Executing thunk in renderer, bypassAccessControl=${bypassAccessControl}, bypassThunkLock=${bypassThunkLock}`,
        );

        const thunk = action as InternalThunk<S>;

        // Store the bypass flags in the options
        const thunkOptions: DispatchOptions = {
          bypassAccessControl: !!bypassAccessControl,
          bypassThunkLock: !!bypassThunkLock,
        };

        debug(
          'ipc',
          `[PRELOAD] Set bypassThunkLock: ${thunkOptions.bypassThunkLock} for thunk execution`,
        );

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
              payload: !isOptions ? payloadOrOptions : undefined,
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

      if (bypassThunkLock) {
        actionObj.__bypassThunkLock = true;
      }

      debug(
        'ipc',
        `Dispatching action: ${
          actionObj.type
        }, bypassAccessControl=${!!actionObj.__bypassAccessControl}, bypassThunkLock=${!!actionObj.__bypassThunkLock}`,
      );

      // Track action dispatch for performance metrics
      trackActionDispatch(actionObj);

      // Route through batcher when available, EXCEPT for bypassThunkLock actions
      // which need immediate execution and should use direct dispatch
      const batcher = actionBatcher;
      if (batcher && !actionObj.__bypassThunkLock) {
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
      return new Promise<Action>((resolve, reject) => {
        const actionId = actionObj.__id as string;

        // Set up a timeout in case we don't get an acknowledgment
        const timeoutMs = PLATFORM === 'linux' ? 60000 : 30000; // Platform-specific timeout
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
          actionSender: async (action: Action, parentId?: string) => {
            debug(
              'ipc',
              `Sending action: ${action.type}, id: ${action.__id}${parentId ? `, parent: ${parentId}` : ''}`,
            );

            // bypassThunkLock actions should use direct dispatch for immediate execution
            if (actionBatcher && !action.__bypassThunkLock) {
              const priority = calculatePriority(action);
              const batcher = actionBatcher;
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
          // Function to register thunks with main process
          thunkRegistrar: async (
            thunkId: string,
            parentId?: string,
            bypassThunkLock?: boolean,
            bypassAccessControl?: boolean,
          ) => {
            debug(
              'ipc',
              `[PRELOAD] Registering thunk: thunkId=${thunkId}, bypassThunkLock=${bypassThunkLock}`,
            );
            return new Promise<void>((resolve, reject) => {
              pendingThunkRegistrations.set(thunkId, { resolve, reject });
              ipcRenderer.send(IpcChannel.REGISTER_THUNK, {
                thunkId,
                parentId,
                bypassThunkLock,
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

    // Clean up expired thunk processor actions
    cleanupRegistry.thunks.add(async () => {
      thunkProcessor.forceCleanupExpiredActions();
    });

    await cleanupRegistry.thunks.cleanupAll();

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

    // Add thunk cleanup
    cleanupRegistry.thunks.add(async () => {
      thunkProcessor.destroy();
    });

    // Add pending registrations cleanup
    cleanupRegistry.thunks.add(async () => {
      const pendingCount = pendingThunkRegistrations.size;
      for (const [thunkId, { reject }] of pendingThunkRegistrations) {
        try {
          reject(new Error('Complete cleanup - thunk registration cancelled'));
        } catch (error: unknown) {
          debug('ipc:error', `Error rejecting pending thunk registration ${thunkId}:`, error);
        }
      }
      pendingThunkRegistrations.clear();
      debug('ipc', `Cleaned up ${pendingCount} pending registrations`);
    });

    // Perform all cleanups
    await cleanupRegistry.cleanupAll();

    // Clear listeners set
    listeners.clear();

    debug('ipc', 'Complete cleanup finished successfully');
  };

  return {
    handlers,
    initialized,
  };
};

/**
 * Legacy preload bridge for backward compatibility
 * @deprecated This is now an alias for preloadBridge and uses the new IPC channels.
 * Please update your code to use preloadBridge directly in the future.
 */
export const preloadZustandBridge = preloadBridge;

export type PreloadZustandBridge = typeof preloadZustandBridge;
export type PreloadBridge = typeof preloadBridge;
