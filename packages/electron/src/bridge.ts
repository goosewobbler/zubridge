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

export interface CoreBridgeOptions {
  // Middleware hooks
  middleware?: ZubridgeMiddleware;
  beforeProcessAction?: (action: Action, windowId?: number) => Promise<Action> | Action;
  afterProcessAction?: (action: Action, processingTime: number, windowId?: number) => Promise<void> | void;
  beforeStateChange?: (state: AnyState, windowId?: number) => Promise<void> | void;
  afterStateChange?: (state: AnyState, windowId?: number) => Promise<void> | void;
  onBridgeDestroy?: () => Promise<void> | void;
}

// Middleware callback functions
interface MiddlewareCallbacks {
  trackActionDispatch?: (action: Action) => Promise<void>;
  trackActionReceived?: (action: Action) => Promise<void>;
  trackStateUpdate?: (action: Action, state: string) => Promise<void>;
  trackActionAcknowledged?: (actionId: string) => Promise<void>;
}

// Global middleware callbacks
let middlewareCallbacks: MiddlewareCallbacks = {};

// Export function to set middleware callbacks
export function setMiddlewareCallbacks(callbacks: MiddlewareCallbacks) {
  middlewareCallbacks = callbacks;
  debug('core', 'Middleware callbacks set:', Object.keys(callbacks).join(', '));
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

    // Register middleware callbacks if the middleware provides them
    if (options?.middleware?.trackActionDispatch) {
      middlewareCallbacks.trackActionDispatch = (action) => options.middleware!.trackActionDispatch!(action);
    }
    if (options?.middleware?.trackActionReceived) {
      middlewareCallbacks.trackActionReceived = (action) => options.middleware!.trackActionReceived!(action);
    }
    if (options?.middleware?.trackStateUpdate) {
      middlewareCallbacks.trackStateUpdate = (action, state) => options.middleware!.trackStateUpdate!(action, state);
    }
    if (options?.middleware?.trackActionAcknowledged) {
      middlewareCallbacks.trackActionAcknowledged = (actionId) =>
        options.middleware!.trackActionAcknowledged!(actionId);
    }
  }

  // Add a getter method to the window tracker for retrieving WebContents by ID
  const getWindowById = (id: number): WebContents | undefined => {
    const allContents = windowTracker.getActiveWebContents();
    return allContents.find((contents) => contents.id === id);
  };

  // Register IPC handlers for the bridge

  // Set up the action processor for the bridge action queue
  actionQueue.setActionProcessor(async (action: Action) => {
    let error = null;

    try {
      // Check if this is a thunk-related action
      const isThunkChild = 'parentId' in action && action.parentId !== undefined;
      if (isThunkChild) {
        debug('core', `[BRIDGE DEBUG] Processing child action of thunk ${(action as any).parentId}: ${action.type}`);
      }

      // Track action received by middleware
      if (middlewareCallbacks.trackActionReceived) {
        // Clone action and ensure payload is a string for Rust middleware
        const actionForMiddleware = { ...action };
        if (actionForMiddleware.payload && typeof actionForMiddleware.payload !== 'string') {
          try {
            actionForMiddleware.payload = JSON.stringify(actionForMiddleware.payload);
          } catch (serializationError) {
            debug('core:error', `Error serializing payload for middleware: ${serializationError}`);
            actionForMiddleware.payload = '[serialization error]';
          }
        }
        await middlewareCallbacks.trackActionReceived(actionForMiddleware);
      }

      // Middleware hook: beforeProcessAction (may transform the action)
      if (processedOptions?.beforeProcessAction) {
        try {
          action = await processedOptions.beforeProcessAction(action, action.__sourceWindowId);
        } catch (middlewareError) {
          debug('core:error', '[BRIDGE DEBUG] Error in beforeProcessAction middleware:', middlewareError);
        }
      }

      const startTime = performance.now();

      // Process the action through our state manager
      debug('core', 'Processing action through state manager');

      try {
        debug('core', `[BRIDGE DEBUG] Processing action ${action.type} (ID: ${action.__id})`);

        // **CRITICAL: Check thunk locking before processing any action**
        const thunkLockManager = getThunkLockManager();
        const canProcess = thunkLockManager.canProcessAction(action);

        if (!canProcess) {
          debug('core', `[BRIDGE DEBUG] Action ${action.type} blocked by thunk lock manager - enqueueing for later`);
          // Use action queue which will retry when thunk completes
          actionQueue.enqueueAction(action, action.__sourceWindowId || 0, (action as any).parentId, () => {});
          return; // Return immediately, action will be processed later
        }

        debug('core', '[BRIDGE DEBUG] Action allowed by thunk lock manager, processing immediately');
        debug('core', 'Processing action through state manager');
        debug('core', `[BRIDGE DEBUG] Processing action through state manager: ${action.type} (ID: ${action.__id})`);

        // Process the action and get the result
        const result = stateManager.processAction(action);

        // Check if the result contains an error
        if (result && result.error) {
          debug(
            'core:error',
            `[BRIDGE DEBUG] Action ${action.type} (ID: ${action.__id}) returned an error:`,
            result.error,
          );
          error = result.error;
        }

        // Check if the action processing was asynchronous
        let isAsyncAction = false;
        let stateUpdatePromise: Promise<any> | undefined;

        if (result && !result.isSync) {
          isAsyncAction = true;

          if (result.completion) {
            debug(
              'core',
              `[BRIDGE DEBUG] Action ${action.type} (ID: ${action.__id}) is asynchronous, waiting for completion`,
            );
            stateUpdatePromise = result.completion;
          } else {
            debug(
              'core',
              `[BRIDGE DEBUG] Action ${action.type} (ID: ${action.__id}) marked as async but no completion promise provided`,
            );
          }
        } else {
          debug('core', `[BRIDGE DEBUG] Action ${action.type} (ID: ${action.__id}) is synchronous`);
        }

        // If the action is async and has a completion promise, wait for it
        if (isAsyncAction && stateUpdatePromise) {
          try {
            debug('core', `[BRIDGE DEBUG] Waiting for async action ${action.type} (ID: ${action.__id}) to complete...`);
            await stateUpdatePromise;
            debug('core', `[BRIDGE DEBUG] Async action ${action.type} (ID: ${action.__id}) completed successfully`);
          } catch (asyncError) {
            debug('core', `[BRIDGE DEBUG] Error in async action completion: ${asyncError}`);
            error = asyncError;
          }
        }

        debug('core', `[BRIDGE DEBUG] Action processing successful: ${action.type}`);
      } catch (processError) {
        debug('core:error', '[BRIDGE DEBUG] Error in stateManager.processAction:', processError);
        error = processError;
      }

      const processingTime = performance.now() - startTime;
      debug('core', `Action processed in ${processingTime.toFixed(2)}ms`);
      debug(
        'core',
        `[BRIDGE DEBUG] Action ${action.type} (ID: ${action.__id}) processed in ${processingTime.toFixed(2)}ms`,
      );

      // Middleware hook: afterProcessAction (post-processing hooks)
      if (processedOptions?.afterProcessAction) {
        try {
          await processedOptions.afterProcessAction(action, processingTime, action.__sourceWindowId);
        } catch (middlewareError) {
          debug('core:error', '[BRIDGE DEBUG] Error in afterProcessAction middleware:', middlewareError);
        }
      }

      // Track state update with middleware
      if (middlewareCallbacks.trackStateUpdate) {
        const currentState = stateManager.getState();
        // Clone action and ensure payload is a string for Rust middleware
        const actionForMiddleware = { ...action };
        if (actionForMiddleware.payload !== undefined && typeof actionForMiddleware.payload !== 'string') {
          actionForMiddleware.payload = JSON.stringify(actionForMiddleware.payload);
        }

        // Convert state to JSON string for Rust middleware
        const stateJson = JSON.stringify(currentState);

        await middlewareCallbacks.trackStateUpdate(actionForMiddleware, stateJson);
      }

      // Don't send acknowledgment here - let the queue handle it after processing is fully complete
      // The acknowledgment will be sent by the queue's onComplete callback

      return error; // Return the error if there was one, null otherwise
    } catch (error) {
      debug('core:error', 'CRITICAL ERROR during middleware import/initialization or bridge creation:', error);
      // For CI, re-throw to ensure the process exits with an error if this setup fails
      // This makes the CI job fail clearly.
      return error;
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
        id: action.__id,
        payload: action.payload,
        parentId: parentId,
      });

      if (!action.type) {
        debug('ipc', '[BRIDGE DEBUG] Action missing type:', data);
        return;
      }

      // Add the source window ID to the action for acknowledgment purposes
      const actionWithSource: Action = {
        ...action,
        __sourceWindowId: event.sender.id,
        parentId: parentId,
      };

      // If this is a thunk action, ensure the thunk is registered before enqueueing
      if (parentId && !thunkManager.hasThunk(parentId)) {
        debug('ipc', `[BRIDGE DEBUG] Registering thunk ${parentId} before enqueueing action ${action.__id}`);
        const thunkObj = new ThunkClass({
          id: parentId,
          sourceWindowId: event.sender.id,
          type: 'renderer',
        });
        await thunkRegistrationQueue.registerThunk(thunkObj);
      }

      // Queue the action for processing
      actionQueue.enqueueAction(actionWithSource, event.sender.id, parentId, (error) => {
        // This callback is called when the action is completed (successfully or with error)
        debug('ipc', `[BRIDGE DEBUG] Action ${action.__id} completed with ${error ? 'error' : 'success'}`);

        if (error) {
          debug(
            'ipc:error',
            `[BRIDGE DEBUG] Error details for action ${action.__id}: ${error instanceof Error ? error.message : String(error)}`,
          );
          debug(
            'ipc:error',
            `[BRIDGE DEBUG] Error object type: ${typeof error}, instanceof Error: ${error instanceof Error}`,
          );
          debug(
            'ipc:error',
            `[BRIDGE DEBUG] Error stack: ${error instanceof Error ? error.stack : 'No stack available'}`,
          );
        }

        try {
          if (!isDestroyed(event.sender)) {
            // Get current thunk state to piggyback with acknowledgment
            const thunkState = thunkManager.getActiveThunksSummary();

            // Send acknowledgment with thunk state and error information
            safelySendToWindow(event.sender, IpcChannel.DISPATCH_ACK, {
              actionId: action.__id,
              thunkState,
              // Include error information if there was an error
              error: error ? (error instanceof Error ? error.message : String(error)) : null,
            });

            debug('ipc', `[BRIDGE DEBUG] Acknowledgment sent for action ${action.__id} to window ${event.sender.id}`);

            // Track action acknowledged with middleware
            if (middlewareCallbacks.trackActionAcknowledged) {
              // Use void to indicate we're intentionally not awaiting
              void middlewareCallbacks.trackActionAcknowledged(action.__id);
            }
          }
        } catch (ackError) {
          debug('ipc:error', '[BRIDGE DEBUG] Error sending acknowledgment:', ackError);
        }
      });
    } catch (error) {
      debug('core:error', 'Error handling dispatch:', error);
      debug('core:error', '[BRIDGE DEBUG] Error handling dispatch:', error);

      // Even on error, we should acknowledge the action was processed
      try {
        const { action } = data || {};
        if (action?.__id) {
          debug('ipc', `Sending acknowledgment for action ${action.__id} despite error`);
          debug('ipc', `[BRIDGE DEBUG] Sending acknowledgment for action ${action.__id} despite error`);
          if (!isDestroyed(event.sender)) {
            safelySendToWindow(event.sender, IpcChannel.DISPATCH_ACK, {
              actionId: action.__id,
              thunkState: { version: 0, thunks: [] },
              error: error instanceof Error ? error.message : String(error),
            });
            debug('ipc', `[BRIDGE DEBUG] Error acknowledgment sent for action ${action.__id}`);
          }
        }
      } catch (ackError) {
        debug('ipc:error', '[BRIDGE DEBUG] Error sending error acknowledgment:', ackError);
      }
    }
  });

  // Handle track_action_dispatch events from renderers
  ipcMain.on(IpcChannel.TRACK_ACTION_DISPATCH, async (event: IpcMainEvent, data: any) => {
    try {
      const { action } = data || {};
      if (!action || !action.type) {
        debug('middleware:error', 'Invalid action tracking data received');
        return;
      }

      debug('middleware', `Received action dispatch tracking for ${action.type} (ID: ${action.__id})`);

      // Add source window ID to the action
      const actionWithSource = {
        ...action,
        __sourceWindowId: event.sender.id,
      };

      // Call middleware tracking function if available
      if (middlewareCallbacks.trackActionDispatch) {
        // Ensure payload is a string for Rust middleware
        if (actionWithSource.payload !== undefined && typeof actionWithSource.payload !== 'string') {
          actionWithSource.payload = JSON.stringify(actionWithSource.payload);
        }
        await middlewareCallbacks.trackActionDispatch(actionWithSource);
      }
    } catch (error) {
      debug('middleware:error', 'Error handling action dispatch tracking:', error);
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
  /**
   * Subscribe windows to state updates for specific keys.
   *
   * @param windows - The window(s) to subscribe
   * @param keys - Optional array of state keys to subscribe to:
   *   - undefined: Subscribe to all state (default)
   *   - []: Subscribe to no state
   *   - ['*']: Subscribe to all state
   *   - ['key1', 'key2']: Subscribe to specific keys
   * @returns An object with an unsubscribe function
   */
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
      const unsubscribe = subManager.subscribe(
        keys,
        (state) => {
          debug('core', `Sending state update to window ${webContents.id}`);
          const sanitizedState = sanitizeState(state);
          safelySendToWindow(webContents, IpcChannel.SUBSCRIBE, sanitizedState);
        },
        webContents.id,
      );
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

  // Unified subscribe API (windows first, keys optional)
  /**
   * Subscribe windows to state updates.
   *
   * @param windows - The window(s) to subscribe
   * @param keys - Optional array of state keys to subscribe to:
   *   - undefined: Subscribe to all state (default)
   *   - []: Subscribe to no state
   *   - ['*']: Subscribe to all state
   *   - ['key1', 'key2']: Subscribe to specific keys
   * @returns An object with an unsubscribe function
   */
  function subscribe(
    windows: WrapperOrWebContents[] | WrapperOrWebContents,
    keys?: string[],
  ): { unsubscribe: () => void } {
    debug('core', `[subscribe] Called with windows and keys: ${keys ? JSON.stringify(keys) : 'undefined'}`);

    // If windows is not provided, subscribe all windows to full state
    if (!windows) {
      const allWindows = windowTracker.getActiveWebContents();
      return selectiveSubscribe(allWindows);
    }

    // Pass keys as undefined (not []) when not specified to subscribe to all state
    // This ensures subscribe(windows) subscribes to all state
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
        subManager.unsubscribe(keys, () => {}, webContents.id);
        if (subManager.getCurrentSubscriptionKeys(webContents.id).length === 0) {
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

  const getWindowSubscriptions = (windowId: number): string[] => {
    const subManager = subscriptionManagers.get(windowId);
    return subManager ? subManager.getCurrentSubscriptionKeys(windowId) : [];
  };

  // Handle registering and accessing WebContents IDs
  ipcMain.handle(IpcChannel.GET_WINDOW_ID, (event) => {
    return event.sender.id;
  });

  // Handle requests for window subscriptions
  ipcMain.handle(IpcChannel.GET_WINDOW_SUBSCRIPTIONS, (event, windowId) => {
    try {
      // If no explicit windowId is provided, use the sender's ID
      const targetWindowId = windowId || event.sender.id;
      const subscriptions = getWindowSubscriptions(targetWindowId);
      debug('subscription', `[GET_WINDOW_SUBSCRIPTIONS] Window ${targetWindowId} subscriptions: ${subscriptions}`);
      return subscriptions;
    } catch (error) {
      debug('subscription:error', `[GET_WINDOW_SUBSCRIPTIONS] Error getting subscriptions:`, error);
      return [];
    }
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
    getWindowSubscriptions,
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
