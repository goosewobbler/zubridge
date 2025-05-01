import { ipcMain } from 'electron';
import type { IpcMainEvent, WebContents } from 'electron';
import type { Action, StateManager, AnyState, BackendBridge, WrapperOrWebContents } from '@zubridge/types';
import { IpcChannel } from './constants';
import { StoreApi } from 'zustand';
import { Store } from 'redux';
import { ZustandOptions } from './adapters/zustand';
import { ReduxOptions } from './main';
import { getStateManager } from './utils/stateManagerRegistry';
import {
  getWebContents,
  isDestroyed,
  safelySendToWindow,
  createWebContentsTracker,
  prepareWebContents,
  WebContentsTracker,
} from './utils/windows';
import { sanitizeState } from './utils/serialization';

/**
 * Creates a core bridge between the main process and renderer processes
 * This implements the Zubridge Electron backend contract without requiring a specific state management library
 */
export function createCoreBridge<State extends AnyState>(
  stateManager: StateManager<State>,
  initialWrappers?: WrapperOrWebContents[],
): BackendBridge<number> {
  // Tracker for WebContents using WeakMap for automatic garbage collection
  const tracker: WebContentsTracker = createWebContentsTracker();

  // Initialize with initial wrappers
  if (initialWrappers) {
    const initialWebContents = prepareWebContents(initialWrappers);
    for (const webContents of initialWebContents) {
      tracker.track(webContents);
    }
  }

  // Handle dispatch events from renderers
  ipcMain.on(IpcChannel.DISPATCH, (event: IpcMainEvent, action: Action) => {
    try {
      // Process the action through our state manager
      stateManager.processAction(action);

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
  const stateManagerUnsubscribe = stateManager.subscribe((state) => {
    try {
      const activeIds = tracker.getActiveIds();
      if (activeIds.length === 0) {
        return;
      }

      // Sanitize state before sending
      const safeState = sanitizeState(state);

      // Get active WebContents from our tracker
      const activeWebContents = tracker.getActiveWebContents();

      // Send updates to all active WebContents that were explicitly subscribed
      for (const webContents of activeWebContents) {
        safelySendToWindow(webContents, IpcChannel.SUBSCRIBE, safeState);
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
        safelySendToWindow(webContents, IpcChannel.SUBSCRIBE, currentState);
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
  const destroy = () => {
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
  options?: ZustandOptions<S> | ReduxOptions<S>,
): BackendBridge<number> {
  // Get or create a state manager for the store
  const stateManager = getStateManager(store, options);

  // Create the bridge using the state manager
  return createCoreBridge(stateManager, windows);
}
