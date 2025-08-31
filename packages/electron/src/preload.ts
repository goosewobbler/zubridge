import { ipcRenderer, contextBridge } from 'electron';
import type { IpcRendererEvent } from 'electron';
import { v4 as uuidv4 } from 'uuid';
import type {
  Action,
  AnyState,
  Handlers,
  Thunk,
  DispatchOptions,
  InternalThunk,
} from '@zubridge/types';
import { IpcChannel } from './constants.js';
import { debug } from '@zubridge/core';
import { RendererThunkProcessor } from './renderer/rendererThunkProcessor.js';

// Return type for preload bridge function
export interface PreloadZustandBridgeReturn<S extends AnyState> {
  handlers: Handlers<S>;
  initialized: boolean;
}

/**
 * Creates and returns handlers that the window.zubridge object will expose
 * This uses the Electron IPC bridge to communicate with the main process
 */
export const preloadBridge = <S extends AnyState>(): PreloadZustandBridgeReturn<S> => {
  const listeners = new Set<(state: S) => void>();
  let initialized = false;

  // Get or create the thunk processor
  const getThunkProcessorWithConfig = (): RendererThunkProcessor => {
    // Platform-specific timeout for action completion
    const actionCompletionTimeoutMs = process.platform === 'linux' ? 60000 : 30000;

    debug(
      'core',
      `Creating thunk processor with timeout: ${actionCompletionTimeoutMs}ms for platform ${process.platform}`,
    );
    return new RendererThunkProcessor(actionCompletionTimeoutMs);
  };

  // Get a properly configured thunk processor
  const thunkProcessor = getThunkProcessorWithConfig();

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
        ipcRenderer.on(IpcChannel.STATE_UPDATE, async (_event, payload) => {
          const { updateId, state, thunkId } = payload;
          debug('ipc', `Received state update ${updateId} for thunk ${thunkId || 'none'}`);

          // Notify all subscribers of the state change
          listeners.forEach((fn) => fn(state));

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
      };
    },

    // Get current state from main process
    async getState(options?: { bypassAccessControl?: boolean }): Promise<S> {
      debug('ipc', 'Getting state from main process');
      return ipcRenderer.invoke(IpcChannel.GET_STATE, options) as Promise<S>;
    },

    // Dispatch actions to main process
    async dispatch(
      action: string | Action | Thunk<S>,
      payloadOrOptions?: unknown | DispatchOptions,
      options?: DispatchOptions,
    ): Promise<Action> {
      debug('ipc', 'Dispatch called with:', { action, payloadOrOptions, options });

      // Extract options or default to empty object
      const dispatchOptions =
        typeof payloadOrOptions === 'object' &&
        !Array.isArray(payloadOrOptions) &&
        payloadOrOptions !== null
          ? (payloadOrOptions as DispatchOptions)
          : options || {};

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

        // Execute the thunk directly through the thunkProcessor implementation
        // This avoids the circular reference where executeThunk calls back to preload
        return thunkProcessor.executeThunk<S>(thunk, thunkOptions);
      }

      // For string or action object types, create a standardized action object
      const actionObj: Action =
        typeof action === 'string'
          ? {
              type: action,
              payload:
                payloadOrOptions !== undefined && typeof payloadOrOptions !== 'object'
                  ? payloadOrOptions
                  : undefined,
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
        `Dispatching action: ${actionObj.type}, bypassAccessControl=${!!actionObj.__bypassAccessControl}, bypassThunkLock=${!!actionObj.__bypassThunkLock}`,
      );

      // Track action dispatch for performance metrics
      trackActionDispatch(actionObj);

      // Create a Promise that will resolve when we get an acknowledgment
      return new Promise<Action>((resolve, reject) => {
        const actionId = actionObj.__id as string;

        // Set up a one-time listener for the acknowledgment of this specific action
        const ackListener = (_event: IpcRendererEvent, payload: any) => {
          // Check if this acknowledgment is for our action
          if (payload && payload.actionId === actionId) {
            // Remove the listener since we got our response
            ipcRenderer.removeListener(IpcChannel.DISPATCH_ACK, ackListener);

            if (payload.error) {
              debug('ipc:error', `Action ${actionId} failed with error: ${payload.error}`);
              reject(new Error(payload.error));
            } else {
              debug('ipc', `Action ${actionId} completed successfully`);
              resolve(actionObj);
            }
          }
        };

        // Register the acknowledgment listener
        ipcRenderer.on(IpcChannel.DISPATCH_ACK, ackListener);

        // Send the action to the main process
        debug('ipc', `Sending action ${actionId} to main process`);
        ipcRenderer.send(IpcChannel.DISPATCH, { action: actionObj });

        // Set up a timeout in case we don't get an acknowledgment
        const timeoutMs = process.platform === 'linux' ? 60000 : 30000; // Platform-specific timeout
        debug(
          'ipc',
          `Setting up acknowledgment timeout of ${timeoutMs}ms for platform ${process.platform}`,
        );
        const timeoutId = setTimeout(() => {
          // Remove the listener if we timed out
          ipcRenderer.removeListener(IpcChannel.DISPATCH_ACK, ackListener);
          debug('ipc:error', `Timeout waiting for acknowledgment of action ${actionId}`);
          reject(new Error(`Timeout waiting for acknowledgment of action ${actionId}`));
        }, timeoutMs);

        // Make sure to clear the timeout when the promise settles
        const originalResolve = resolve;
        const originalReject = reject;
        resolve = (value: any) => {
          clearTimeout(timeoutId);
          originalResolve(value);
        };
        reject = (error: any) => {
          clearTimeout(timeoutId);
          originalReject(error);
        };
      });
    },
  };

  // Initialize once on startup
  if (!initialized) {
    initialized = true;

    // Set up acknowledgment listener for the thunk processor
    debug('ipc', 'Set up IPC acknowledgement listener for thunk processor');
    ipcRenderer.on(IpcChannel.DISPATCH_ACK, (_event: IpcRendererEvent, payload: any) => {
      const { actionId, thunkState } = payload || {};

      debug('ipc', `Received acknowledgment for action: ${actionId}`);

      if (thunkState) {
        debug(
          'ipc',
          `Received thunk state with ${thunkState.activeThunks?.length || 0} active thunks`,
        );
      }

      // Notify the thunk processor of action completion
      debug('ipc', `Notifying thunk processor of action completion: ${actionId}`);
      thunkProcessor.completeAction(actionId, payload);
    });

    // Set up thunk registration ack listener
    ipcRenderer.on(IpcChannel.REGISTER_THUNK_ACK, (_event: IpcRendererEvent, payload: any) => {
      const { thunkId, success, error } = payload || {};
      const entry = pendingThunkRegistrations.get(thunkId);
      if (entry) {
        if (success) {
          entry.resolve();
        } else {
          entry.reject(error || new Error('Thunk registration failed'));
        }
        pendingThunkRegistrations.delete(thunkId);
      }
    });

    // Setup the thunk processor with window ID and functions
    void (async () => {
      try {
        // Get the current window ID
        const windowId = await ipcRenderer.invoke(IpcChannel.GET_WINDOW_ID);
        debug('ipc', `Got current window ID: ${windowId}`);

        // Initialize the thunk processor with required functions
        thunkProcessor.initialize({
          windowId,
          // Function to send actions to main process
          actionSender: async (action: Action, parentId?: string) => {
            debug(
              'ipc',
              `Sending action: ${action.type}, id: ${action.__id}${parentId ? `, parent: ${parentId}` : ''}`,
            );
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
        const subscriptionValidatorAPI = {
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
          stateKeyExists: (state: any, key: string): boolean => {
            if (!key || !state) return false;

            // Handle dot notation by traversing the object
            const parts = key.split('.');
            let current = state;

            for (const part of parts) {
              if (current === undefined || current === null || typeof current !== 'object') {
                return false;
              }

              if (!(part in current)) {
                return false;
              }

              current = current[part];
            }

            return true;
          },
        };

        // Expose the subscription validator API to the window
        debug('ipc', 'Exposing subscription validator API to window');
        contextBridge.exposeInMainWorld(
          '__zubridge_subscriptionValidator',
          subscriptionValidatorAPI,
        );

        // Add a state provider to the thunk processor
        thunkProcessor.setStateProvider((opts) => handlers.getState(opts));

        debug('ipc', 'Preload script initialized successfully');
      } catch (error) {
        debug('core:error', 'Error initializing preload script:', error);
      }
    })();
  }

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
