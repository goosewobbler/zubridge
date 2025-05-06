import { ipcMain } from 'electron';
import type { IpcMainEvent, WebContents } from 'electron';
import type { Action, StateManager, AnyState, BackendBridge, WrapperOrWebContents } from '@zubridge/types';
import { IpcChannel } from './constants.js';
import type { StoreApi } from 'zustand';
import type { Store } from 'redux';
import { ZustandOptions } from './adapters/zustand.js';
import { ReduxOptions } from './adapters/redux.js';
import { getStateManager } from './utils/stateManagerRegistry.js';
import {
  getWebContents,
  isDestroyed,
  safelySendToWindow,
  createWebContentsTracker,
  prepareWebContents,
  WebContentsTracker,
} from './utils/windows.js';
import { sanitizeState } from './utils/serialization.js';
import { createMiddlewareOptions, ZubridgeMiddleware } from './middleware.js';
import { debug } from './utils/debug.js';

export interface CoreBridgeOptions {
  // Middleware hooks
  middleware?: ZubridgeMiddleware;
  beforeProcessAction?: (action: Action, windowId?: number) => Promise<Action> | Action;
  afterProcessAction?: (action: Action, processingTime: number, windowId?: number) => Promise<void> | void;
  beforeStateChange?: (state: AnyState, windowId?: number) => Promise<void> | void;
  afterStateChange?: (state: AnyState, windowId?: number) => Promise<void> | void;
  onBridgeDestroy?: () => Promise<void> | void;
}

/**
 * Creates a core bridge between the main process and renderer processes
 * This implements the Zubridge Electron backend contract without requiring a specific state management library
 */
export function createCoreBridge<State extends AnyState>(
  stateManager: StateManager<State>,
  initialWrappers?: WrapperOrWebContents[],
  options?: CoreBridgeOptions,
): BackendBridge<number> {
  debug('core', 'Creating CoreBridge with options:', options);

  // Tracker for WebContents using WeakMap for automatic garbage collection
  const tracker: WebContentsTracker = createWebContentsTracker();

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

  // Initialize with initial wrappers
  if (initialWrappers) {
    const initialWebContents = prepareWebContents(initialWrappers);
    debug('core', `Initializing with ${initialWebContents.length} WebContents`);
    for (const webContents of initialWebContents) {
      tracker.track(webContents);
    }
  }

  // Handle dispatch events from renderers
  ipcMain.on(IpcChannel.DISPATCH, async (event: IpcMainEvent, action: Action) => {
    try {
      debug('ipc', `Received action from renderer ${event.sender.id}:`, action);

      // Apply middleware before processing action
      if (processedOptions?.beforeProcessAction) {
        debug('core', 'Applying beforeProcessAction middleware');
        action = await processedOptions.beforeProcessAction(action, event.sender.id);
      }

      const startTime = performance.now();

      // Process the action through our state manager
      debug('core', 'Processing action through state manager');
      stateManager.processAction(action);

      const processingTime = performance.now() - startTime;
      debug('core', `Action processed in ${processingTime.toFixed(2)}ms`);

      // Apply middleware after processing action
      if (processedOptions?.afterProcessAction) {
        debug('core', 'Applying afterProcessAction middleware');
        await processedOptions.afterProcessAction(action, processingTime, event.sender.id);
      }

      // Send acknowledgment back to the sender if the action has an ID
      if (action.id) {
        debug('ipc', `Sending acknowledgment for action ${action.id}`);
        event.sender.send(IpcChannel.DISPATCH_ACK, action.id);
      }
    } catch (error) {
      debug('core', 'Error handling dispatch:', error);

      // Even on error, we should acknowledge the action was processed
      if (action.id) {
        debug('ipc', `Sending acknowledgment for action ${action.id} despite error`);
        event.sender.send(IpcChannel.DISPATCH_ACK, action.id);
      }
    }
  });

  // Handle getState requests from renderers
  ipcMain.handle(IpcChannel.GET_STATE, () => {
    try {
      debug('ipc', 'Handling getState request');
      const state = sanitizeState(stateManager.getState());
      debug('ipc', 'Returning sanitized state');
      return state;
    } catch (error) {
      debug('core', 'Error handling getState:', error);
      return {};
    }
  });

  // Subscribe to state manager changes and broadcast to subscribed windows
  const stateManagerUnsubscribe = stateManager.subscribe(async (state: AnyState) => {
    try {
      const activeIds = tracker.getActiveIds();
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
      const activeWebContents = tracker.getActiveWebContents();

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
      debug('core', 'Error in state subscription handler:', error);
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
      if (tracker.track(webContents)) {
        debug('windows', `Subscribed WebContents ${webContents.id}`);
        addedWebContents.push(webContents);

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
          tracker.untrack(webContents);
        }
      },
    };
  };

  // Remove windows from subscriptions
  const unsubscribe = (unwrappers?: WrapperOrWebContents[]) => {
    if (!unwrappers) {
      // If no wrappers are provided, unsubscribe all
      debug('core', 'Unsubscribing all WebContents');
      tracker.cleanup();
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
      tracker.untrack(webContents);
    }
  };

  // Get IDs of subscribed windows
  const getSubscribedWindows = (): number[] => {
    const activeIds = tracker.getActiveIds();
    debug('windows', `Currently subscribed windows: ${activeIds.join(', ') || 'none'}`);
    return activeIds;
  };

  // Cleanup function for removing listeners
  const destroy = async () => {
    debug('core', 'Destroying CoreBridge');

    // Apply bridge destroy hook if provided
    if (processedOptions?.onBridgeDestroy) {
      debug('core', 'Applying onBridgeDestroy hook');
      await processedOptions.onBridgeDestroy();
    }

    // Cleanup all our resources
    debug('core', 'Unsubscribing from state manager');
    stateManagerUnsubscribe();

    debug('core', 'Cleaning up tracked WebContents');
    tracker.cleanup();

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
  windows?: WrapperOrWebContents[],
  options?: ZustandOptions<S> | ReduxOptions<S> | CoreBridgeOptions,
): BackendBridge<number> {
  debug('adapters', 'Creating bridge from store');

  // Get the appropriate state manager for this store
  const stateManager = getStateManager(store, options);
  debug('adapters', `Got state manager for store (type: ${typeof store})`);

  // Create a core bridge with this state manager
  return createCoreBridge(stateManager, windows, options as CoreBridgeOptions);
}
