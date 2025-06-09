import { ipcRenderer, contextBridge } from 'electron';
import type { IpcRendererEvent } from 'electron';
import { v4 as uuidv4 } from 'uuid';
import type { Action, AnyState, Handlers, Thunk, DispatchOptions, InternalThunk } from '@zubridge/types';
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
    const actionCompletionTimeoutMs = 30000;

    debug('core', `Creating thunk processor with timeout: ${actionCompletionTimeoutMs}ms`);
    return new RendererThunkProcessor(actionCompletionTimeoutMs);
  };

  // Get a properly configured thunk processor
  const thunkProcessor = getThunkProcessorWithConfig();

  // Map to track pending thunk registration promises
  const pendingThunkRegistrations = new Map<string, { resolve: () => void; reject: (err: any) => void }>();

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

  // Create the handlers object that will be exposed to clients
  const handlers: Handlers<S> = {
    subscribe(callback: (state: S) => void) {
      // Add the listener
      listeners.add(callback);

      // Set up the IPC listener for state updates if not already done
      if (listeners.size === 1) {
        debug('ipc', 'Setting up IPC state update listener');
        ipcRenderer.on(IpcChannel.SUBSCRIBE, (_event: IpcRendererEvent, newState: S) => {
          debug('ipc', 'Received state update');
          // Notify all listeners of the state update
          listeners.forEach((listener) => listener(newState));
        });
      }

      // Return unsubscribe function
      return () => {
        listeners.delete(callback);
        if (listeners.size === 0) {
          debug('ipc', 'Removing IPC state update listener');
          ipcRenderer.removeAllListeners(IpcChannel.SUBSCRIBE);
        }
      };
    },

    // Get the current state from main process
    async getState(): Promise<S> {
      try {
        debug('ipc', 'Getting state from main process');
        const state = await ipcRenderer.invoke(IpcChannel.GET_STATE);
        return state as S;
      } catch (error) {
        debug('core:error', 'Error getting state:', error);
        throw error;
      }
    },

    async dispatch(
      action: string | Action | Thunk<S>,
      payloadOrOptions?: unknown | DispatchOptions,
      options?: DispatchOptions,
    ): Promise<Action> {
      // Parse options from different argument positions
      let dispatchOptions: DispatchOptions | undefined;
      let payload: unknown = undefined;

      // Handle different argument combinations
      if (options && typeof options === 'object') {
        // If the third argument is provided as options, use it
        dispatchOptions = options;
      } else if (
        payloadOrOptions &&
        typeof payloadOrOptions === 'object' &&
        !Array.isArray(payloadOrOptions) &&
        ('bypassAccessControl' in payloadOrOptions ||
          'bypassThunkLock' in payloadOrOptions ||
          'keys' in payloadOrOptions)
      ) {
        // If second argument looks like options, use it as options
        dispatchOptions = payloadOrOptions as DispatchOptions;
      } else {
        // Otherwise, second argument is payload
        payload = payloadOrOptions;
      }

      const bypassAccessControl = dispatchOptions?.bypassAccessControl === true;
      const bypassThunkLock = dispatchOptions?.bypassThunkLock === true;

      debug(
        'ipc',
        `Dispatch called with bypassAccessControl=${bypassAccessControl}, bypassThunkLock=${bypassThunkLock}`,
        `action: ${action}`,
        `typeof action: ${typeof action}`,
      );

      // Handle string actions
      if (typeof action === 'string') {
        debug(
          'ipc',
          `Dispatching string action: ${action}, bypassAccessControl=${bypassAccessControl}, bypassThunkLock=${bypassThunkLock}`,
        );
        const actionObj: Action = {
          type: action,
          payload: payload,
          __id: uuidv4(),
        };

        // Add bypass flags if specified
        if (bypassAccessControl) {
          actionObj.__bypassAccessControl = true;
        }

        if (bypassThunkLock) {
          actionObj.__bypassThunkLock = true;
        }

        debug('ipc', `Created action object with ID: ${actionObj.__id}`);

        // Track action dispatch for performance metrics
        trackActionDispatch(actionObj);

        // Create a promise that will catch errors from the main process
        return new Promise<Action>((resolve, reject) => {
          console.log('preload', 'Dispatching action:', actionObj);
          // Dispatch and handle the result
          thunkProcessor
            .dispatchAction(actionObj, payload)
            .then(() => {
              console.log('preload', 'Action dispatched successfully');
              resolve(actionObj);
            })
            .catch((err) => {
              console.log('preload', 'Action dispatch failed:', err);
              reject(err);
            });
        });
      }

      // Handle thunks (functions)
      if (typeof action === 'function') {
        // TODO: do we ever get here?

        debug(
          'ipc',
          `Executing thunk in renderer, bypassAccessControl=${bypassAccessControl}, bypassThunkLock=${bypassThunkLock}`,
        );

        const thunk = action as InternalThunk<S>;

        // Create a getState function that uses the handlers.getState
        const getState = async () => {
          debug('ipc', 'Getting state for thunk via handlers.getState');
          return handlers.getState();
        };

        // Store the bypass flags in the thunk
        thunk.__bypassAccessControl = !!bypassAccessControl;
        thunk.__bypassThunkLock = !!bypassThunkLock;

        debug(
          'ipc',
          `[PRELOAD] Set __bypassThunkLock: ${thunk.__bypassThunkLock} on thunk: ${thunk.name || thunk.toString()}`,
        );

        // Execute the thunk through the thunk processor
        const parentId = undefined;
        return thunkProcessor.executeThunk<S>(thunk, getState, parentId);
      }

      // It's an action object
      // Ensure action has an ID and add bypass flags if specified
      const actionObj: Action = {
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

      // Dispatch directly to main process and handle errors properly
      return thunkProcessor
        .dispatchAction(actionObj)
        .then(() => actionObj)
        .catch((error) => {
          debug('ipc:error', `Error dispatching action ${actionObj.__id}: ${error}`);
          throw error; // Re-throw to propagate to caller
        });
    },
  };

  // Initialize once on startup
  if (!initialized) {
    initialized = true;

    // Set up acknowledgment listener
    debug('ipc', 'Set up IPC acknowledgement listener');
    ipcRenderer.on(IpcChannel.DISPATCH_ACK, (_event: IpcRendererEvent, payload: any) => {
      const { actionId, thunkState } = payload || {};

      debug('ipc', `Received acknowledgment for action: ${actionId}`);

      if (thunkState) {
        debug('ipc', `Received thunk state with ${thunkState.activeThunks?.length || 0} active thunks`);
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
            debug('ipc', `[PRELOAD] BITCH thunkRegistrar: Lock = ${bypassThunkLock}`);
            return new Promise<void>((resolve, reject) => {
              pendingThunkRegistrations.set(thunkId, { resolve, reject });
              ipcRenderer.send(IpcChannel.REGISTER_THUNK, { thunkId, parentId, bypassThunkLock, bypassAccessControl });
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
              const result = await ipcRenderer.invoke(IpcChannel.GET_WINDOW_SUBSCRIPTIONS, windowId);
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

        // Make the thunk processor available to the renderer via context bridge
        if (contextBridge) {
          debug('ipc', 'Exposing thunk processor to renderer via contextBridge');
          contextBridge.exposeInMainWorld('__zubridge_thunkProcessor', {
            executeThunk: (
              thunk: InternalThunk<S>,
              getState: () => any,
              options?: DispatchOptions,
              parentId?: string,
            ) => {
              debug('ipc', `[PRELOAD] BITCH executeThunk: Lock = ${options?.bypassThunkLock}`);
              // Call the private implementation directly to avoid infinite recursion
              return thunkProcessor.executeThunkImplementation(thunk, getState, options, parentId);
            },
            completeAction: (actionId: string, result: any) => thunkProcessor.completeAction(actionId, result),
            dispatchAction: (action: Action | string, payload?: unknown, parentId?: string) =>
              thunkProcessor.dispatchAction(action, payload, parentId),
          });

          // Expose subscription validator API
          debug('ipc', 'Exposing subscription validator to renderer via contextBridge');
          contextBridge.exposeInMainWorld('__zubridge_subscriptionValidator', {
            getWindowSubscriptions: () => subscriptionValidatorAPI.getWindowSubscriptions(),
            isSubscribedToKey: (key: string) => subscriptionValidatorAPI.isSubscribedToKey(key),
            stateKeyExists: (state: any, key: string) => subscriptionValidatorAPI.stateKeyExists(state, key),
          });
        }
      } catch (error) {
        debug('core:error', 'Error initializing thunk processor:', error);
      }
    })();

    debug('ipc', 'Bridge initialized');
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
