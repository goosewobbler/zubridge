import { ipcMain } from 'electron';
import type { IpcMainEvent, WebContents } from 'electron';
import type { Action, StateManager, AnyState, BackendBridge, WrapperOrWebContents } from '@zubridge/types';
import { IpcChannel } from './constants.js';
import type { StoreApi } from 'zustand';
import type { Store } from 'redux';
import { ZustandOptions } from './adapters/zustand.js';
import { ReduxOptions } from './adapters/redux.js';
import { getStateManager } from './lib/stateManagerRegistry.js';
import {
  getWebContents,
  isDestroyed,
  safelySendToWindow,
  createWebContentsTracker,
  WebContentsTracker,
} from './utils/windows.js';
import { sanitizeState } from './utils/serialization.js';
import { createMiddlewareOptions, ZubridgeMiddleware } from './middleware.js';
import { debug } from '@zubridge/core';
import { actionQueue } from './main/actionQueue.js';
import { getThunkManager } from './lib/ThunkManager.js';
import { getMainThunkProcessor } from './main/mainThunkProcessor.js';
import { MainThunkProcessor } from './main/mainThunkProcessor.js';
import { getThunkLockManager } from './lib/ThunkLockManager.js';
import { ThunkRegistrationQueue } from './lib/ThunkRegistrationQueue.js';

// Get the global ThunkManager
const thunkManager = getThunkManager();

// Instantiate the thunk registration queue
const thunkRegistrationQueue = new ThunkRegistrationQueue(getThunkManager());

// Extend the Action type to include source window ID for internal use
interface ActionWithSource extends Action {
  __sourceWindowId?: number;
  parentId?: string;
}

export interface CoreBridgeOptions {
  // Middleware hooks
  middleware?: ZubridgeMiddleware;
  beforeProcessAction?: (action: Action, windowId?: number) => Promise<Action> | Action;
  afterProcessAction?: (action: Action, processingTime: number, windowId?: number) => Promise<void> | void;
  beforeStateChange?: (state: AnyState, windowId?: number) => Promise<void> | void;
  afterStateChange?: (state: AnyState, windowId?: number) => Promise<void> | void;
  onBridgeDestroy?: () => Promise<void> | void;

  /**
   * Maximum time (in milliseconds) to wait for an action to complete before auto-resolving
   * Used for actions that might contain async operations without proper acknowledgment
   * Default: 10000 (10 seconds)
   */
  actionCompletionTimeoutMs?: number;
}

/**
 * Creates a core bridge between the main process and renderer processes
 * This implements the Zubridge Electron backend contract without requiring a specific state management library
 */
export function createCoreBridge<State extends AnyState>(
  stateManager: StateManager<State>,
  options?: CoreBridgeOptions,
): BackendBridge<number> {
  debug('core', 'Creating CoreBridge with options:', options);

  // Get the action completion timeout from options or use default
  const actionCompletionTimeoutMs = options?.actionCompletionTimeoutMs;

  // Tracker for WebContents using WeakMap for automatic garbage collection
  const windowTracker: WebContentsTracker = createWebContentsTracker();

  // Process options with middleware if provided
  let processedOptions = options;
  if (options?.middleware) {
    debug('core', 'Initializing middleware');
    const middlewareOptions = createMiddlewareOptions(options.middleware);
    processedOptions = {
      ...options,
      ...middlewareOptions,
    };
  }

  // Get the main thunk processor with the timeout (create a new instance if needed)
  // This ensures we don't need to update an existing processor's config
  const mainThunkProcessor = (() => {
    // Get the singleton instance
    const existingProcessor = getMainThunkProcessor();

    // Only pass the timeout if it's defined
    if (actionCompletionTimeoutMs !== undefined) {
      // Create a new instance with the timeout
      return new MainThunkProcessor(actionCompletionTimeoutMs);
    }

    // Use the existing processor
    return existingProcessor;
  })();

  // Add a getter method to the window tracker for retrieving WebContents by ID
  const getWindowById = (id: number): WebContents | undefined => {
    const allContents = windowTracker.getActiveWebContents();
    return allContents.find((contents) => contents.id === id);
  };

  // Register IPC handlers for the bridge

  // Set up the action processor for the bridge action queue
  actionQueue.setActionProcessor(async (action: Action) => {
    try {
      const actionWithSource = action as ActionWithSource;

      // Check if this is a thunk-related action
      const isThunkChild = 'parentId' in action && action.parentId !== undefined;
      if (isThunkChild) {
        debug(
          'core',
          `[BRIDGE DEBUG] Processing child action of thunk ${(action as ActionWithSource).parentId}: ${action.type}`,
        );
      }

      // Apply middleware before processing action
      if (processedOptions?.beforeProcessAction) {
        debug('core', 'Applying beforeProcessAction middleware');
        try {
          action = await processedOptions.beforeProcessAction(action, actionWithSource.__sourceWindowId);
        } catch (middlewareError) {
          debug('core:error', '[BRIDGE DEBUG] Error in beforeProcessAction middleware:', middlewareError);
        }
      }

      const startTime = performance.now();

      // Process the action through our state manager
      debug('core', 'Processing action through state manager');
      debug('core', `[BRIDGE DEBUG] Processing action through state manager: ${action.type} (ID: ${action.id})`);

      if (!stateManager) {
        debug('core', '[BRIDGE DEBUG] State manager is undefined or null');
        return;
      }

      if (!stateManager.processAction) {
        debug('core', '[BRIDGE DEBUG] State manager missing processAction method');
        return;
      }

      let isAsyncAction = false;
      let stateUpdatePromise: Promise<any> | undefined;

      try {
        debug('core', `[BRIDGE DEBUG] Processing action ${action.type} (ID: ${action.id})`);

        // **CRITICAL: Check thunk locking before processing any action**
        const thunkLockManager = getThunkLockManager();
        const canProcess = thunkLockManager.canProcessAction(actionWithSource, actionWithSource.__sourceWindowId || 0);

        if (!canProcess) {
          debug('core', `[BRIDGE DEBUG] Action ${action.type} blocked by thunk lock manager - enqueueing for later`);
          // Use action queue which will retry when thunk completes
          actionQueue.enqueueAction(
            actionWithSource,
            actionWithSource.__sourceWindowId || 0,
            actionWithSource.parentId,
            () => {},
          );
          return; // Return immediately, action will be processed later
        }

        debug('core', '[BRIDGE DEBUG] Action allowed by thunk lock manager, processing immediately');
        debug('core', 'Processing action through state manager');
        debug('core', `[BRIDGE DEBUG] Processing action through state manager: ${action.type} (ID: ${action.id})`);

        // Process the action and get the result
        const result = stateManager.processAction(action);

        // Check if the action processing was asynchronous
        if (result && !result.isSync) {
          isAsyncAction = true;

          if (result.completion) {
            debug(
              'core',
              `[BRIDGE DEBUG] Action ${action.type} (ID: ${action.id}) is asynchronous, waiting for completion`,
            );
            stateUpdatePromise = result.completion;
          } else {
            debug(
              'core',
              `[BRIDGE DEBUG] Action ${action.type} (ID: ${action.id}) marked as async but no completion promise provided`,
            );
          }
        } else {
          debug('core', `[BRIDGE DEBUG] Action ${action.type} (ID: ${action.id}) is synchronous`);
        }

        // If the action is async and has a completion promise, wait for it
        if (isAsyncAction && stateUpdatePromise) {
          try {
            debug('core', `[BRIDGE DEBUG] Waiting for async action ${action.type} (ID: ${action.id}) to complete...`);
            await stateUpdatePromise;
            debug('core', `[BRIDGE DEBUG] Async action ${action.type} (ID: ${action.id}) completed successfully`);
          } catch (asyncError) {
            debug('core', `[BRIDGE DEBUG] Error in async action completion: ${asyncError}`);
          }
        }

        debug('core', `[BRIDGE DEBUG] Action processing successful: ${action.type}`);
      } catch (processError) {
        debug('core:error', '[BRIDGE DEBUG] Error in stateManager.processAction:', processError);
      }

      const processingTime = performance.now() - startTime;
      debug('core', `Action processed in ${processingTime.toFixed(2)}ms`);
      debug(
        'core',
        `[BRIDGE DEBUG] Action ${action.type} (ID: ${action.id}) processed in ${processingTime.toFixed(2)}ms`,
      );

      // Apply middleware after processing action
      if (processedOptions?.afterProcessAction) {
        debug('core', 'Applying afterProcessAction middleware');
        try {
          await processedOptions.afterProcessAction(action, processingTime, actionWithSource.__sourceWindowId);
        } catch (middlewareError) {
          debug('core:error', '[BRIDGE DEBUG] Error in afterProcessAction middleware:', middlewareError);
        }
      }

      // Send acknowledgment back to the sender if the action has an ID and source window
      if (action.id && actionWithSource.__sourceWindowId) {
        debug('ipc', `Sending acknowledgment for action ${action.id}`);
        debug('ipc', `[BRIDGE DEBUG] Sending acknowledgment for action ${action.id}`);
        try {
          const windowId = actionWithSource.__sourceWindowId;
          const contents = getWindowById(windowId);

          if (contents && !isDestroyed(contents)) {
            // Get current thunk state to piggyback with acknowledgment
            const thunkState = thunkManager.getActiveThunksSummary();

            debug('ipc', `[BRIDGE DEBUG] Including thunk state (version ${thunkState.version}) with acknowledgment`);
            debug('ipc', `[BRIDGE DEBUG] Active thunks: ${thunkState.thunks.length}`);

            // Send acknowledgment with thunk state
            contents.send(IpcChannel.DISPATCH_ACK, {
              actionId: action.id,
              thunkState,
            });

            debug('ipc', `[BRIDGE DEBUG] Acknowledgment sent for action ${action.id} to window ${windowId}`);
          } else {
            debug('ipc', `[BRIDGE DEBUG] Cannot send acknowledgment - WebContents destroyed or not found`);
          }
        } catch (ackError) {
          debug('ipc:error', '[BRIDGE DEBUG] Error sending acknowledgment:', ackError);
        }
      }
    } catch (error) {
      debug('core:error', 'CRITICAL ERROR during middleware import/initialization or bridge creation:', error);
      // For CI, re-throw to ensure the process exits with an error if this setup fails
      // This makes the CI job fail clearly.
      throw error;
    }
  });

  // Handle dispatch events from renderers
  ipcMain.on(IpcChannel.DISPATCH, async (event: IpcMainEvent, data: any) => {
    try {
      debug('ipc', `Received action data from renderer ${event.sender.id}:`, data);

      // Extract the action from the wrapper object
      const { action, parentId } = data || {};

      if (!action || typeof action !== 'object') {
        debug('ipc', '[BRIDGE DEBUG] Invalid action received:', data);
        return;
      }

      debug('ipc', `[BRIDGE DEBUG] Received action from renderer ${event.sender.id}:`, {
        type: action.type,
        id: action.id,
        payload: action.payload,
        parentId: parentId,
      });

      if (!action.type) {
        debug('ipc', '[BRIDGE DEBUG] Action missing type:', data);
        return;
      }

      // Add the source window ID to the action for acknowledgment purposes
      const actionWithSource: ActionWithSource = {
        ...action,
        __sourceWindowId: event.sender.id,
        parentId: parentId,
      };

      // If this is a thunk action, ensure the thunk is registered before enqueueing
      if (parentId && !thunkManager.hasThunk(parentId)) {
        debug('ipc', `[BRIDGE DEBUG] Registering thunk ${parentId} before enqueueing action ${action.id}`);
        await thunkRegistrationQueue.registerThunk(parentId, event.sender.id, undefined, 'renderer');
      }

      // Queue the action for processing
      actionQueue.enqueueAction(actionWithSource, event.sender.id, parentId);
    } catch (error) {
      debug('core:error', 'Error handling dispatch:', error);
      debug('core:error', '[BRIDGE DEBUG] Error handling dispatch:', error);

      // Even on error, we should acknowledge the action was processed
      try {
        const { action } = data || {};
        if (action?.id) {
          debug('ipc', `Sending acknowledgment for action ${action.id} despite error`);
          debug('ipc', `[BRIDGE DEBUG] Sending acknowledgment for action ${action.id} despite error`);
          if (!isDestroyed(event.sender)) {
            // Match the structure of the successful acknowledgment case
            event.sender.send(IpcChannel.DISPATCH_ACK, {
              actionId: action.id,
              thunkState: { version: 0, thunks: [] },
            });
            debug('ipc', `[BRIDGE DEBUG] Error acknowledgment sent for action ${action.id}`);
          }
        }
      } catch (ackError) {
        debug('ipc:error', '[BRIDGE DEBUG] Error sending error acknowledgment:', ackError);
      }
    }
  });

  // Handle getState requests from renderers
  ipcMain.handle(IpcChannel.GET_STATE, (event) => {
    try {
      debug('ipc', 'Handling getState request');
      debug('ipc', `[BRIDGE DEBUG] Handling getState request from renderer ${event.sender.id}`);

      if (!stateManager) {
        debug('core', '[BRIDGE DEBUG] State manager is undefined or null in getState handler');
        return {};
      }

      if (!stateManager.getState) {
        debug('core', '[BRIDGE DEBUG] State manager missing getState method');
        return {};
      }

      const rawState = stateManager.getState();
      debug(
        'store',
        `[BRIDGE DEBUG] Raw state retrieved:`,
        typeof rawState === 'object' ? Object.keys(rawState) : typeof rawState,
      );

      const state = sanitizeState(rawState);
      debug('ipc', 'Returning sanitized state');
      debug('ipc', `[BRIDGE DEBUG] Returning sanitized state to renderer ${event.sender.id}`);

      return state;
    } catch (error) {
      debug('core:error', 'Error handling getState:', error);
      debug('core:error', '[BRIDGE DEBUG] Error handling getState:', error);
      return {};
    }
  });

  // Handle thunk registration from renderers
  ipcMain.on(IpcChannel.REGISTER_THUNK, async (event: IpcMainEvent, data: any) => {
    debug('core', `[BRIDGE DEBUG] REGISTER_THUNK IPC handler called`);
    debug('core', `[BRIDGE DEBUG] Event sender ID: ${event.sender.id}`);
    debug('core', `[BRIDGE DEBUG] Data received:`, data);

    try {
      const { thunkId, parentId } = data;
      const sourceWindowId = event.sender.id;

      debug(
        'core',
        `[BRIDGE DEBUG] Registering thunk ${thunkId} from window ${sourceWindowId}${parentId ? ` with parent ${parentId}` : ''}`,
      );

      // Use ThunkRegistrationQueue to register the thunk with proper global locking
      await thunkRegistrationQueue.registerThunk(thunkId, sourceWindowId, parentId, 'renderer');
      debug('core', `[BRIDGE DEBUG] Thunk ${thunkId} registration queued successfully`);

      // Send ack to renderer
      event.sender.send(IpcChannel.REGISTER_THUNK_ACK, { thunkId, success: true });
    } catch (error) {
      debug('core:error', '[BRIDGE DEBUG] Error handling thunk registration:', error);
      // Send failure ack
      const { thunkId } = data || {};
      event.sender.send(IpcChannel.REGISTER_THUNK_ACK, { thunkId, success: false, error: String(error) });
    }
  });

  // Handle thunk completion from renderers
  ipcMain.on(IpcChannel.COMPLETE_THUNK, (event: IpcMainEvent, data: any) => {
    try {
      const { thunkId } = data;
      debug('ipc', `[BRIDGE DEBUG] Received thunk completion notification for ${thunkId}`);

      if (!thunkId) {
        debug('core', '[BRIDGE DEBUG] Missing thunkId in thunk completion notification');
        return;
      }

      // Mark the thunk as completed in the tracker
      const wasActive = thunkManager.isThunkActive(thunkId);
      thunkManager.markThunkCompleted(thunkId);
      debug('core', `[BRIDGE DEBUG] Thunk ${thunkId} marked as completed (was active: ${wasActive})`);

      // The ThunkTracker will notify ActionQueueManager via state change listener
      debug('core', '[BRIDGE DEBUG] ActionQueue will be notified via ThunkTracker state change listener');
    } catch (error) {
      debug('core:error', '[BRIDGE DEBUG] Error handling thunk completion:', error);
    }
  });

  // Subscribe to state manager changes and broadcast to subscribed windows
  const stateManagerUnsubscribe = stateManager.subscribe(async (state: AnyState) => {
    try {
      const activeIds = windowTracker.getActiveIds();
      debug('core', `State changed, broadcasting to ${activeIds.length} active windows`);

      if (activeIds.length === 0) {
        debug('core', 'No active windows to broadcast to');
        return;
      }

      // Sanitize state before sending
      debug('serialization', 'Sanitizing state before broadcast');
      const safeState = sanitizeState(state);

      // Apply middleware before state update - broadcast to all
      if (processedOptions?.beforeStateChange) {
        debug('core', 'Applying beforeStateChange middleware (global)');
        await processedOptions.beforeStateChange(safeState);
      }

      // Get active WebContents from our tracker
      const activeWebContents = windowTracker.getActiveWebContents();

      // Send updates to all active WebContents that were explicitly subscribed
      for (const webContents of activeWebContents) {
        // Apply middleware before state update for specific window
        if (processedOptions?.beforeStateChange) {
          debug('core', `Applying beforeStateChange middleware for window ${webContents.id}`);
          await processedOptions.beforeStateChange(safeState, webContents.id);
        }

        debug('ipc', `Sending state update to window ${webContents.id}`);
        safelySendToWindow(webContents, IpcChannel.SUBSCRIBE, safeState);

        // Apply middleware after state update for specific window
        if (processedOptions?.afterStateChange) {
          debug('core', `Applying afterStateChange middleware for window ${webContents.id}`);
          await processedOptions.afterStateChange(safeState, webContents.id);
        }
      }

      // Apply middleware after all state updates - broadcast
      if (processedOptions?.afterStateChange) {
        debug('core', 'Applying afterStateChange middleware (global)');
        await processedOptions.afterStateChange(safeState);
      }
    } catch (error) {
      debug('core:error', 'Error in state subscription handler:', error);
    }
  });

  // Add new windows to tracking and subscriptions
  const subscribe = (newWrappers: WrapperOrWebContents[]): { unsubscribe: () => void } => {
    const addedWebContents: WebContents[] = [];

    // Handle invalid input cases
    if (!newWrappers || !Array.isArray(newWrappers)) {
      debug('core', 'Invalid wrappers provided to subscribe');
      return { unsubscribe: () => {} };
    }

    debug('core', `Subscribing ${newWrappers.length} wrappers`);

    // Get WebContents from wrappers and track them
    for (const wrapper of newWrappers) {
      const webContents = getWebContents(wrapper);
      if (!webContents || isDestroyed(webContents)) {
        debug('windows', 'Skipping invalid or destroyed WebContents');
        continue;
      }

      // Track the WebContents
      if (windowTracker.track(webContents)) {
        debug('windows', `Subscribed WebContents ${webContents.id}`);
        addedWebContents.push(webContents);

        // Expose configuration to the window
        if (actionCompletionTimeoutMs !== undefined) {
          webContents
            .executeJavaScript(
              `
            window.__ZUBRIDGE_CONFIG = window.__ZUBRIDGE_CONFIG || {};
            window.__ZUBRIDGE_CONFIG.actionCompletionTimeoutMs = ${actionCompletionTimeoutMs};
            debug('core', "[BRIDGE] Configuration exposed to window:", window.__ZUBRIDGE_CONFIG);
          `,
            )
            .catch((error) => {
              debug('core:error', '[BRIDGE] Error exposing configuration to window:', error);
            });
        }

        // Send initial state
        const currentState = sanitizeState(stateManager.getState());
        debug('ipc', `Sending initial state to WebContents ${webContents.id}`);

        // Apply middleware before initial state update
        if (processedOptions?.beforeStateChange) {
          debug('core', `Applying beforeStateChange middleware for initial state to window ${webContents.id}`);
          processedOptions.beforeStateChange(currentState, webContents.id);
        }

        safelySendToWindow(webContents, IpcChannel.SUBSCRIBE, currentState);

        // Apply middleware after initial state update
        if (processedOptions?.afterStateChange) {
          debug('core', `Applying afterStateChange middleware for initial state to window ${webContents.id}`);
          processedOptions.afterStateChange(currentState, webContents.id);
        }
      } else {
        debug('windows', `WebContents ${webContents.id} already tracked, skipping`);
      }
    }

    // Return an unsubscribe function
    return {
      unsubscribe: () => {
        debug('core', `Unsubscribing ${addedWebContents.length} WebContents`);
        for (const webContents of addedWebContents) {
          windowTracker.untrack(webContents);
        }
      },
    };
  };

  // Remove windows from subscriptions
  const unsubscribe = (unwrappers?: WrapperOrWebContents[]) => {
    if (!unwrappers) {
      // If no wrappers are provided, unsubscribe all
      debug('core', 'Unsubscribing all WebContents');
      windowTracker.cleanup();
      return;
    }

    debug('core', `Unsubscribing ${unwrappers.length} specific wrappers`);
    for (const wrapper of unwrappers) {
      const webContents = getWebContents(wrapper);
      if (!webContents) {
        debug('windows', 'Skipping invalid WebContents in unsubscribe');
        continue;
      }
      debug('windows', `Unsubscribing WebContents ${webContents.id}`);
      windowTracker.untrack(webContents);
    }
  };

  // Get IDs of subscribed windows
  const getSubscribedWindows = (): number[] => {
    const activeIds = windowTracker.getActiveIds();
    debug('windows', `Currently subscribed windows: ${activeIds.join(', ') || 'none'}`);
    return activeIds;
  };

  // Handle registering and accessing WebContents IDs
  ipcMain.handle(IpcChannel.GET_WINDOW_ID, (event) => {
    return event.sender.id;
  });

  // Handle requests for current global thunk state
  ipcMain.handle(IpcChannel.GET_THUNK_STATE, () => {
    try {
      const thunkState = thunkManager.getActiveThunksSummary();
      debug(
        'core',
        `[BRIDGE DEBUG] Returning thunk state with version ${thunkState.version} and ${thunkState.thunks.length} active thunks`,
      );
      return thunkState;
    } catch (error) {
      debug('core:error', '[BRIDGE DEBUG] Error getting thunk state:', error);
      return { version: 1, thunks: [] };
    }
  });

  // Cleanup function for removing listeners
  const destroy = async () => {
    debug('core', 'Destroying CoreBridge');

    // Clean up the IPC handlers
    ipcMain.removeHandler(IpcChannel.GET_WINDOW_ID);
    ipcMain.removeHandler(IpcChannel.GET_THUNK_STATE);

    // Apply bridge destroy hook if provided
    if (processedOptions?.onBridgeDestroy) {
      debug('core', 'Applying onBridgeDestroy hook');
      await processedOptions.onBridgeDestroy();
    }

    // Cleanup all our resources
    debug('core', 'Unsubscribing from state manager');
    stateManagerUnsubscribe();

    debug('core', 'Cleaning up tracked WebContents');
    windowTracker.cleanup();

    debug('core', 'CoreBridge destroyed');
  };

  // Return the bridge interface
  return { subscribe, unsubscribe, getSubscribedWindows, destroy };
}

/**
 * Creates a bridge from a store (either Zustand or Redux)
 */
export function createBridgeFromStore<S extends AnyState = AnyState>(
  store: StoreApi<S> | Store<S>,
  options?: ZustandOptions<S> | ReduxOptions<S> | CoreBridgeOptions,
): BackendBridge<number> {
  debug('adapters', 'Creating bridge from store');

  // Get the appropriate state manager for this store
  const stateManager = getStateManager(store, options);
  debug('adapters', `Got state manager for store (type: ${typeof store})`);

  // Create a core bridge with this state manager
  return createCoreBridge(stateManager, options as CoreBridgeOptions);
}
