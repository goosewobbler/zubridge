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
  // Tracker for WebContents using WeakMap for automatic garbage collection
  const tracker: WebContentsTracker = createWebContentsTracker();

  // Process options with middleware if provided
  let processedOptions = options;
  if (options?.middleware) {
    const middlewareOptions = createMiddlewareOptions(options.middleware);
    processedOptions = {
      ...options,
      ...middlewareOptions,
    };
  }

  // Initialize with initial wrappers
  if (initialWrappers) {
    const initialWebContents = prepareWebContents(initialWrappers);
    for (const webContents of initialWebContents) {
      tracker.track(webContents);
    }
  }

  // Handle dispatch events from renderers
  ipcMain.on(IpcChannel.DISPATCH, async (event: IpcMainEvent, action: Action) => {
    try {
      // Apply middleware before processing action
      if (processedOptions?.beforeProcessAction) {
        action = await processedOptions.beforeProcessAction(action, event.sender.id);
      }

      const startTime = performance.now();

      // Process the action through our state manager
      stateManager.processAction(action);

      const processingTime = performance.now() - startTime;

      // Apply middleware after processing action
      if (processedOptions?.afterProcessAction) {
        await processedOptions.afterProcessAction(action, processingTime, event.sender.id);
      }

      // Send acknowledgment back to the sender if the action has an ID
      if (action.id) {
        event.sender.send(IpcChannel.DISPATCH_ACK, action.id);
      }
    } catch (error) {
      console.error('Error handling dispatch:', error);

      // Even on error, we should acknowledge the action was processed
      if (action.id) {
        event.sender.send(IpcChannel.DISPATCH_ACK, action.id);
      }
    }
  });

  // Handle getState requests from renderers
  ipcMain.handle(IpcChannel.GET_STATE, () => {
    try {
      return sanitizeState(stateManager.getState());
    } catch (error) {
      console.error('Error handling getState:', error);
      return {};
    }
  });

  // Subscribe to state manager changes and broadcast to subscribed windows
  const stateManagerUnsubscribe = stateManager.subscribe(async (state: AnyState) => {
    try {
      const activeIds = tracker.getActiveIds();
      if (activeIds.length === 0) {
        return;
      }

      // Sanitize state before sending
      const safeState = sanitizeState(state);

      // Apply middleware before state update - broadcast to all
      if (processedOptions?.beforeStateChange) {
        await processedOptions.beforeStateChange(safeState);
      }

      // Get active WebContents from our tracker
      const activeWebContents = tracker.getActiveWebContents();

      // Send updates to all active WebContents that were explicitly subscribed
      for (const webContents of activeWebContents) {
        // Apply middleware before state update for specific window
        if (processedOptions?.beforeStateChange) {
          await processedOptions.beforeStateChange(safeState, webContents.id);
        }

        safelySendToWindow(webContents, IpcChannel.SUBSCRIBE, safeState);

        // Apply middleware after state update for specific window
        if (processedOptions?.afterStateChange) {
          await processedOptions.afterStateChange(safeState, webContents.id);
        }
      }

      // Apply middleware after all state updates - broadcast
      if (processedOptions?.afterStateChange) {
        await processedOptions.afterStateChange(safeState);
      }
    } catch (error) {
      console.error('Error in state subscription handler:', error);
    }
  });

  // Add new windows to tracking and subscriptions
  const subscribe = (newWrappers: WrapperOrWebContents[]): { unsubscribe: () => void } => {
    const addedWebContents: WebContents[] = [];

    // Handle invalid input cases
    if (!newWrappers || !Array.isArray(newWrappers)) {
      return { unsubscribe: () => {} };
    }

    // Get WebContents from wrappers and track them
    for (const wrapper of newWrappers) {
      const webContents = getWebContents(wrapper);
      if (!webContents || isDestroyed(webContents)) {
        continue;
      }

      // Track the WebContents
      if (tracker.track(webContents)) {
        addedWebContents.push(webContents);

        // Send initial state
        const currentState = sanitizeState(stateManager.getState());

        // Apply middleware before initial state update
        if (processedOptions?.beforeStateChange) {
          processedOptions.beforeStateChange(currentState, webContents.id);
        }

        safelySendToWindow(webContents, IpcChannel.SUBSCRIBE, currentState);

        // Apply middleware after initial state update
        if (processedOptions?.afterStateChange) {
          processedOptions.afterStateChange(currentState, webContents.id);
        }
      }
    }

    // Return an unsubscribe function
    return {
      unsubscribe: () => {
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
      tracker.cleanup();
      return;
    }

    for (const wrapper of unwrappers) {
      const webContents = getWebContents(wrapper);
      if (webContents) {
        tracker.untrack(webContents);
      }
    }
  };

  // Get the list of currently subscribed window IDs
  const getSubscribedWindows = (): number[] => {
    return tracker.getActiveIds();
  };

  // Cleanup function to remove all listeners
  const destroy = async () => {
    // Call middleware destroy function if provided
    if (processedOptions?.onBridgeDestroy) {
      await processedOptions.onBridgeDestroy();
    }

    stateManagerUnsubscribe();
    ipcMain.removeHandler(IpcChannel.GET_STATE);
    // We can't remove the "on" listener cleanly in Electron,
    // but we can ensure we don't process any more dispatches
    tracker.cleanup();
  };

  return {
    subscribe,
    unsubscribe,
    getSubscribedWindows,
    destroy,
  };
}

/**
 * Internal utility to create a bridge from a store
 * This is used by createZustandBridge and createReduxBridge
 * @internal
 */
export function createBridgeFromStore<S extends AnyState = AnyState>(
  store: StoreApi<S> | Store<S>,
  windows?: WrapperOrWebContents[],
  options?: ZustandOptions<S> | ReduxOptions<S> | CoreBridgeOptions,
): BackendBridge<number> {
  // Get or create a state manager for the store
  const stateManager = getStateManager(store, options);

  // Create the bridge using the state manager
  return createCoreBridge(stateManager, windows, options as CoreBridgeOptions);
}
