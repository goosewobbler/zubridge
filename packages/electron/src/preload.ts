import { ipcRenderer, contextBridge } from 'electron';
import type { IpcRendererEvent } from 'electron';
import { v4 as uuidv4 } from 'uuid';
import type { Action, AnyState, Handlers, Thunk } from '@zubridge/types';
import { IpcChannel } from './constants.js';
import { debug } from '@zubridge/core';
import { getThunkProcessor } from './renderer/rendererThunkProcessor.js';
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
    // Get the default processor
    const defaultProcessor = getThunkProcessor();

    // Try to get config from the window
    let actionCompletionTimeoutMs: number | undefined;
    try {
      if (typeof window !== 'undefined' && (window as any).__ZUBRIDGE_CONFIG) {
        actionCompletionTimeoutMs = (window as any).__ZUBRIDGE_CONFIG.actionCompletionTimeoutMs;
      }

      // Fallback to process.env if available
      if (actionCompletionTimeoutMs === undefined && process.env.ZUBRIDGE_ACTION_TIMEOUT) {
        actionCompletionTimeoutMs = parseInt(process.env.ZUBRIDGE_ACTION_TIMEOUT, 10);
      }

      // If we have a timeout, create a new processor with it
      if (actionCompletionTimeoutMs !== undefined) {
        debug('core', `Creating thunk processor with timeout: ${actionCompletionTimeoutMs}ms`);
        return new RendererThunkProcessor(actionCompletionTimeoutMs);
      }
    } catch (error) {
      debug('core:error', 'Error configuring thunk processor, using default');
    }

    // Use the default processor if no custom timeout
    return defaultProcessor;
  };

  // Get a properly configured thunk processor
  const thunkProcessor = getThunkProcessorWithConfig();

  // Map to track pending thunk registration promises
  const pendingThunkRegistrations = new Map<string, { resolve: () => void; reject: (err: any) => void }>();

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

    dispatch(
      action: string | Action | Thunk<S>,
      payloadOrOptions?: unknown | { keys?: string[]; force?: boolean },
      options?: { keys?: string[]; force?: boolean },
    ) {
      // Handle string actions
      if (typeof action === 'string') {
        const payload = options === undefined && typeof payloadOrOptions !== 'object' ? payloadOrOptions : undefined;
        debug('ipc', `Dispatching string action: ${action}`);
        const actionObj: Action = {
          type: action,
          payload: payload,
          id: uuidv4(),
        };
        debug('ipc', `Created action object with ID: ${actionObj.id}`);
        // Dispatch directly to main process through the thunk processor
        return thunkProcessor.dispatchAction(actionObj, payload).then(() => actionObj);
      }
      // Handle thunks (functions)
      if (typeof action === 'function') {
        debug('ipc', 'Executing thunk in renderer');
        // Create a getState function that uses the handlers.getState
        const getState = async () => {
          debug('ipc', 'Getting state for thunk via handlers.getState');
          return handlers.getState();
        };
        // Execute the thunk through the thunk processor
        return thunkProcessor.executeThunk(action as Thunk<S>, getState);
      }

      // It's an action object
      // Ensure action has an ID
      const actionObj = { ...action, id: action.id || uuidv4() };
      debug('ipc', `Dispatching action: ${actionObj.type}`);
      // Dispatch directly to main process
      return thunkProcessor.dispatchAction(actionObj).then(() => actionObj);
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
            debug('ipc', `Sending action: ${action.type}, id: ${action.id}${parentId ? `, parent: ${parentId}` : ''}`);
            ipcRenderer.send(IpcChannel.DISPATCH, { action, parentId });
          },
          // Function to register thunks with main process
          thunkRegistrar: async (thunkId: string, parentId?: string) => {
            return new Promise<void>((resolve, reject) => {
              pendingThunkRegistrations.set(thunkId, { resolve, reject });
              ipcRenderer.send(IpcChannel.REGISTER_THUNK, { thunkId, parentId });
            });
          },
          // Function to notify thunk completion
          thunkCompleter: async (thunkId: string) => {
            debug('ipc', `Notifying main process of thunk completion: ${thunkId}`);
            ipcRenderer.send(IpcChannel.COMPLETE_THUNK, { thunkId });
          },
        });

        debug('ipc', 'Renderer thunk processor initialized');

        // Make the thunk processor available to the renderer via context bridge
        if (contextBridge) {
          debug('ipc', 'Exposing thunk processor to renderer via contextBridge');
          contextBridge.exposeInMainWorld('__zubridge_thunkProcessor', {
            executeThunk: (thunk: any, getState: () => any, parentId?: string) => {
              // Call the private implementation directly to avoid infinite recursion
              return thunkProcessor.executeThunkImplementation(thunk, getState, parentId);
            },
            completeAction: (actionId: string, result: any) => thunkProcessor.completeAction(actionId, result),
            dispatchAction: (action: Action | string, payload?: unknown, parentId?: string) =>
              thunkProcessor.dispatchAction(action, payload, parentId),
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
