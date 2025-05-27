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
  setupDestroyListener,
} from './utils/windows.js';
import { sanitizeState } from './utils/serialization.js';
import { createMiddlewareOptions, ZubridgeMiddleware } from './middleware.js';
import { debug } from '@zubridge/core';
import { actionQueue } from './main/actionQueue.js';
import { getThunkManager } from './lib/ThunkManager.js';
import { getThunkLockManager } from './lib/ThunkLockManager.js';
import { ThunkRegistrationQueue } from './lib/ThunkRegistrationQueue.js';
import { SubscriptionManager } from './lib/SubscriptionManager.js';
import { Thunk as ThunkClass } from './lib/Thunk.js';

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

  // Map of windowId to SubscriptionManager
  const subscriptionManagers = new Map<number, SubscriptionManager<State>>();

  // Track which window IDs have a destroy listener set up
  const destroyListenerSet = new Set<number>();

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
        const canProcess = thunkLockManager.canProcessAction(actionWithSource);

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
            safelySendToWindow(contents, IpcChannel.DISPATCH_ACK, {
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
        const thunkObj = new ThunkClass({
          id: parentId,
          sourceWindowId: event.sender.id,
          type: 'renderer',
        });
        await thunkRegistrationQueue.registerThunk(thunkObj);
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
            safelySendToWindow(event.sender, IpcChannel.DISPATCH_ACK, {
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
      const thunkObj = new ThunkClass({
        id: thunkId,
        sourceWindowId: sourceWindowId,
        type: 'renderer',
        parentId: parentId,
      });
      await thunkRegistrationQueue.registerThunk(thunkObj);
      debug('core', `[BRIDGE DEBUG] Thunk ${thunkId} registration queued successfully`);

      // Send ack to renderer
      event.sender && safelySendToWindow(event.sender, IpcChannel.REGISTER_THUNK_ACK, { thunkId, success: true });
    } catch (error) {
      debug('core:error', '[BRIDGE DEBUG] Error handling thunk registration:', error);
      // Send failure ack
      const { thunkId } = data || {};
      event.sender &&
        safelySendToWindow(event.sender, IpcChannel.REGISTER_THUNK_ACK, {
          thunkId,
          success: false,
          error: String(error),
        });
    }
  });

  // Handle thunk completion from renderers
  ipcMain.on(IpcChannel.COMPLETE_THUNK, (_event: IpcMainEvent, data: any) => {
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

  // Subscribe to state manager changes and selectively notify windows
  let prevState: State | undefined = undefined;
  const stateManagerUnsubscribe = stateManager.subscribe((state: State) => {
    debug('core', 'State manager notified of state change');
    const activeWebContents = windowTracker.getActiveWebContents();
    debug('core', `Notifying ${activeWebContents.length} active windows of state change`);

    // Sanitize state before notifying subscribers
    const sanitizedState = sanitizeState(state) as State;
    const sanitizedPrevState = prevState ? (sanitizeState(prevState) as State) : undefined;

    for (const webContents of activeWebContents) {
      const windowId = webContents.id;
      const subManager = subscriptionManagers.get(windowId);
      if (!subManager) {
        debug('core', `No subscription manager for window ${windowId}, skipping`);
        continue;
      }
      // Only notify if relevant keys changed
      if (sanitizedPrevState !== undefined) {
        debug('core', `Notifying window ${windowId} of state change`);
        subManager.notify(sanitizedPrevState, sanitizedState);
      } else {
        // On first run, send full state to all subscribers
        debug('core', `Sending initial state to window ${windowId}`);
        subManager.notify(sanitizedState, sanitizedState);
      }
    }
    prevState = state;
  });

  // --- Selective Subscription API (windows first, keys optional) ---
  function selectiveSubscribe(
    windows: WrapperOrWebContents[] | WrapperOrWebContents,
    keys?: string[],
  ): { unsubscribe: () => void } {
    const wrappers = Array.isArray(windows) ? windows : [windows];
    const unsubs: Array<() => void> = [];
    const subscribedWebContents: WebContents[] = [];
    for (const wrapper of wrappers) {
      const webContents = getWebContents(wrapper);
      if (!webContents || isDestroyed(webContents)) continue;
      const tracked = windowTracker.track(webContents);
      subscribedWebContents.push(webContents);
      let subManager = subscriptionManagers.get(webContents.id);
      if (!subManager) {
        subManager = new SubscriptionManager<State>();
        subscriptionManagers.set(webContents.id, subManager);
      }
      // Set up a destroy listener to clean up subscriptions when the window is closed
      if (!destroyListenerSet.has(webContents.id)) {
        setupDestroyListener(webContents, () => {
          subscriptionManagers.delete(webContents.id);
          destroyListenerSet.delete(webContents.id);
        });
        destroyListenerSet.add(webContents.id);
      }
      // Register a subscription for the keys with an actual callback that sends state updates
      const unsubscribe = subManager.subscribe(keys, (state) => {
        debug('core', `Sending state update to window ${webContents.id}`);
        const sanitizedState = sanitizeState(state);
        safelySendToWindow(webContents, IpcChannel.SUBSCRIBE, sanitizedState);
      });
      unsubs.push(unsubscribe);
      if (tracked) {
        const initialState = sanitizeState(stateManager.getState());
        safelySendToWindow(webContents, IpcChannel.SUBSCRIBE, initialState);
      }
    }
    return {
      unsubscribe: () => {
        unsubs.forEach((fn) => fn());
        subscribedWebContents.forEach((webContents) => {
          windowTracker.untrack(webContents);
        });
      },
    };
  }

  function selectiveUnsubscribe(windows: WrapperOrWebContents[] | WrapperOrWebContents, keys?: string[]): void {
    const wrappers = Array.isArray(windows) ? windows : [windows];
    for (const wrapper of wrappers) {
      const webContents = getWebContents(wrapper);
      if (!webContents) continue;
      const subManager = subscriptionManagers.get(webContents.id);
      if (subManager) {
        subManager.unsubscribe(keys, () => {});
        if (subManager.getCurrentSubscriptionKeys().length === 0) {
          subscriptionManagers.delete(webContents.id);
        }
      }
      windowTracker.untrack(webContents);
    }
  }

  // Unified subscribe API (windows first, keys optional)
  function subscribe(
    windows: WrapperOrWebContents[] | WrapperOrWebContents,
    keys?: string[],
  ): { unsubscribe: () => void } {
    // If windows is not provided, subscribe all windows to full state
    if (!windows) {
      const allWindows = windowTracker.getActiveWebContents();
      return selectiveSubscribe(allWindows);
    }
    return selectiveSubscribe(windows, keys);
  }

  // Unified unsubscribe API (windows first, keys optional)
  function unsubscribe(windows?: WrapperOrWebContents[] | WrapperOrWebContents, keys?: string[]): void {
    // If windows is not provided, unsubscribe all windows
    if (!windows) {
      subscriptionManagers.clear();
      windowTracker.cleanup();
      return;
    }
    const wrappers = Array.isArray(windows) ? windows : [windows];
    for (const wrapper of wrappers) {
      const webContents = getWebContents(wrapper);
      if (!webContents) continue;
      const subManager = subscriptionManagers.get(webContents.id);
      if (subManager) {
        subManager.unsubscribe(keys, () => {});
        if (subManager.getCurrentSubscriptionKeys().length === 0) {
          subscriptionManagers.delete(webContents.id);
        }
      }
      windowTracker.untrack(webContents);
    }
  }

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

    debug('core', 'Clearing subscription managers');
    subscriptionManagers.clear();

    debug('core', 'CoreBridge destroyed');
  };

  // Return the bridge interface
  return {
    subscribe,
    unsubscribe,
    getSubscribedWindows,
    destroy,
  };
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
