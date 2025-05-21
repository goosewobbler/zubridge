import { ipcRenderer, contextBridge } from 'electron';
import type { IpcRendererEvent } from 'electron';
import { v4 as uuidv4 } from 'uuid';
import type { Action, AnyState, Dispatch, Handlers, Thunk } from '@zubridge/types';
import { IpcChannel } from './constants.js';
import { debug } from './utils/debug.js';
import { getThunkProcessor } from './renderer/rendererThunkProcessor.js';
import { RendererThunkProcessor } from './renderer/rendererThunkProcessor.js';

// Extended handlers interface to support parent-child relationship tracking
interface ExtendedDispatch<S> {
  (action: string | Action | Thunk<S>, payload?: unknown, parentId?: string): Promise<any>;
}

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
  const stateCache = new Map<symbol, S>();
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
        console.log(`[PRELOAD] Creating thunk processor with timeout: ${actionCompletionTimeoutMs}ms`);
        return new RendererThunkProcessor(true, actionCompletionTimeoutMs);
      }
    } catch (error) {
      console.log('[PRELOAD] Error configuring thunk processor, using default');
    }

    // Use the default processor if no custom timeout
    return defaultProcessor;
  };

  // Get a properly configured thunk processor
  const thunkProcessor = getThunkProcessorWithConfig();

  // Set up the acknowledgment listener
  const listenForAcknowledgments = () => {
    console.log('[PRELOAD] Set up IPC acknowledgement listener');
    ipcRenderer.on(IpcChannel.DISPATCH_ACK, (event: IpcRendererEvent, payload: any) => {
      const { actionId, thunkState } = payload || {};

      console.log(`[PRELOAD] Received acknowledgment for action: ${actionId}`);
      console.log(`[PRELOAD] Acknowledgment payload:`, JSON.stringify(payload, null, 2));

      if (thunkState) {
        console.log(
          `[PRELOAD] Received thunk state version ${thunkState.version} with ${thunkState.activeThunks?.length || 0} active thunks`,
        );
        if (thunkState.activeThunks?.length > 0) {
          console.log(`[PRELOAD] Active thunks:`, JSON.stringify(thunkState.activeThunks, null, 2));
        }
      }

      // Notify the thunk processor of action completion
      console.log(`[PRELOAD] Notifying thunk processor of action completion: ${actionId}`);
      thunkProcessor.completeAction(actionId, payload);
      console.log(`[PRELOAD] Thunk processor notified of action completion: ${actionId}`);
    });
  };

  // Initialize the thunk processor
  const setupThunkProcessor = async () => {
    try {
      // Get the current window ID
      const windowId = await ipcRenderer.invoke(IpcChannel.GET_WINDOW_ID);
      console.log(`[PRELOAD] Got current window ID: ${windowId}`);

      // Initialize the thunk processor with required functions
      thunkProcessor.initialize({
        windowId,
        // Function to send actions to main process
        actionSender: async (action: Action, parentId?: string) => {
          console.log(
            `[PRELOAD-SEND] Sending action: ${action.type}, id: ${action.id}, timestamp: ${Date.now()}${
              parentId ? `, parent: ${parentId}` : ''
            }`,
          );

          ipcRenderer.send(IpcChannel.DISPATCH, { action, parentId });
          console.log(`[PRELOAD-SEND] Action sent: ${action.type}, id: ${action.id}`);
        },
        // Function to register thunks with main process
        thunkRegistrar: async (thunkId: string, parentId?: string) => {
          ipcRenderer.send(IpcChannel.REGISTER_THUNK, { thunkId, parentId });
        },
        // Function to notify thunk completion (not currently used)
        thunkCompleter: async (thunkId: string) => {
          console.log(`[PRELOAD] Notifying main process of thunk completion: ${thunkId}`);
          ipcRenderer.send(IpcChannel.COMPLETE_THUNK, { thunkId });
          console.log(`[PRELOAD] Thunk completion notification sent: ${thunkId}`);
        },
      });

      console.log('[PRELOAD] Renderer thunk processor initialized');

      // Make the thunk processor available to the renderer via context bridge
      if (contextBridge) {
        console.log('[PRELOAD] Exposing thunk processor to renderer via contextBridge');
        contextBridge.exposeInMainWorld('__zubridge_thunkProcessor', {
          executeThunk: (thunk: any, getState: any, parentId?: string) =>
            thunkProcessor.executeThunk(thunk, getState, parentId),
          completeAction: (actionId: string, result: any) => thunkProcessor.completeAction(actionId, result),
          dispatchAction: (action: Action | string, payload?: unknown, parentId?: string) =>
            thunkProcessor.dispatchAction(action, payload, parentId),
        });
      }
    } catch (error) {
      console.error('[PRELOAD] Error initializing thunk processor:', error);
      throw error;
    }
  };

  // Initialize once on startup
  if (!initialized) {
    initialized = true;

    // Set up acknowledgment listener
    listenForAcknowledgments();

    // Setup the thunk processor with window ID and functions
    void setupThunkProcessor();

    // Set up state update listener from main process
    ipcRenderer.on(IpcChannel.SUBSCRIBE, (_event: IpcRendererEvent, newState: S) => {
      debug('ipc', 'Received state update', newState);
      // Update state cache and notify listeners
      stateCache.set(Symbol.for('latest'), newState);
      listeners.forEach((listener) => listener(newState));
    });

    debug('ipc', 'Bridge initialized');
    console.log('[PRELOAD] Bridge initialized');
  }

  // Create the handlers object that will be exposed to clients
  const handlers = {
    subscribe(callback: (state: S) => void) {
      // Add the listener
      listeners.add(callback);

      // Return unsubscribe function
      return () => {
        listeners.delete(callback);
      };
    },

    // Get the current state from main process
    async getState(): Promise<S> {
      try {
        debug('ipc', 'Getting state from main process');
        const state = await ipcRenderer.invoke(IpcChannel.GET_STATE);
        stateCache.set(Symbol.for('latest'), state as S);
        return state as S;
      } catch (error) {
        console.error('[PRELOAD] Error getting state:', error);
        // It's often better to rethrow or handle more gracefully
        // For now, rethrowing to make the failure visible if __app_main_ready__ also fails
        throw error;
      }
    },

    dispatch(action: string | Action | Thunk<S>, payload?: unknown, parentId?: string) {
      // Handle string actions
      if (typeof action === 'string') {
        console.log(
          `[PRELOAD-DISPATCH] Dispatching string action: ${action}${parentId ? ` with parent: ${parentId}` : ''}`,
        );

        const actionObj: Action = {
          type: action,
          payload: payload,
          id: uuidv4(),
        };

        console.log(`[PRELOAD-DISPATCH] Created action object with ID: ${actionObj.id}`);

        // Dispatch directly to main process through the thunk processor
        return thunkProcessor.dispatchAction(actionObj, payload, parentId).then(() => actionObj);
      }

      // Handle thunks (functions)
      if (typeof action === 'function') {
        debug('ipc', 'Executing thunk in renderer');
        console.log(`[PRELOAD] Executing thunk in renderer${parentId ? ` with parent: ${parentId}` : ''}`);

        // Create a function to get state for this thunk
        const getState = async () => {
          // Fetch the current state
          return await handlers.getState();
        };

        // Execute the thunk through the thunk processor
        return thunkProcessor.executeThunk(action, getState, parentId);
      }

      // It's an action object
      // Ensure action has an ID
      if (!action.id) {
        action.id = uuidv4();
      }

      // Log the dispatch
      console.log(`[RENDERER_THUNK] Dispatching action: ${action.type}`);

      // Dispatch directly to main process
      return thunkProcessor.dispatchAction(action, payload, parentId).then(() => action);
    },
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
