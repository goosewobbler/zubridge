import { ipcMain } from 'electron';
import type { BrowserWindow, IpcMainEvent } from 'electron';
import type { WebContentsWrapper, Action, StateManager, AnyState, BackendBridge } from '@zubridge/types';
import { IpcChannel } from './constants';
import { StoreApi } from 'zustand';
import { Store } from 'redux';
import { ZustandOptions } from './adapters/zustand';
import { ReduxOptions } from './main';
import { getStateManager } from './utils/stateManagerRegistry';

/**
 * Creates a core bridge between the main process and renderer processes
 * This implements the Zubridge Electron backend contract without requiring a specific state management library
 */
export function createCoreBridge<State extends AnyState>(
  stateManager: StateManager<State>,
  initialWrappers: WebContentsWrapper[] = [],
): BackendBridge<number> {
  // This is a mapping from webContents.id to wrapper
  const wrapperMap = new Map<number, WebContentsWrapper>();

  // Subscriptions tracks which windows should receive updates
  const subscriptions = new Set<number>();

  // Helper to safely get webContents id from a wrapper
  const getWebContentsId = (wrapper: WebContentsWrapper): number | null => {
    try {
      if (!wrapper || !wrapper.webContents || wrapper.isDestroyed() || wrapper.webContents.isDestroyed()) {
        return null;
      }
      return wrapper.webContents.id;
    } catch (error) {
      return null;
    }
  };

  // Helper to safely send a message to a window
  const safelySendToWindow = (wrapper: WebContentsWrapper, channel: string, data: unknown): boolean => {
    try {
      if (!wrapper || !wrapper.webContents || wrapper.isDestroyed() || wrapper.webContents.isDestroyed()) {
        return false;
      }

      if (wrapper.webContents.isLoading()) {
        wrapper.webContents.once('did-finish-load', () => {
          try {
            if (!wrapper.webContents.isDestroyed()) {
              wrapper.webContents.send(channel, data);
            }
          } catch (e) {
            // Ignore errors during load
          }
        });
        return true;
      }

      wrapper.webContents.send(channel, data);
      return true;
    } catch (error) {
      return false;
    }
  };

  // Initialize our wrapper map with initial wrappers
  for (const wrapper of initialWrappers) {
    const id = getWebContentsId(wrapper);
    if (id !== null) {
      wrapperMap.set(id, wrapper);
    }
  }

  // Remove destroyed windows from our subscriptions
  const cleanupDestroyedWindows = () => {
    const toRemove: number[] = [];

    for (const id of subscriptions) {
      const wrapper = wrapperMap.get(id);
      let isValid = false;

      try {
        isValid = !(!wrapper || wrapper.isDestroyed() || wrapper.webContents.isDestroyed());
      } catch (e) {
        // If we get an error, assume the window is destroyed
        isValid = false;
      }

      if (!isValid) {
        toRemove.push(id);
        wrapperMap.delete(id);
      }
    }

    for (const id of toRemove) {
      subscriptions.delete(id);
    }
  };

  // Handle dispatch events from renderers
  ipcMain.on(IpcChannel.DISPATCH, (_event: IpcMainEvent, action: Action) => {
    try {
      cleanupDestroyedWindows();

      // Process the action through our state manager
      stateManager.processAction(action);
    } catch (error) {
      console.error('Error handling dispatch:', error);
    }
  });

  /**
   * Removes functions and non-serializable objects from a state object
   * to prevent IPC serialization errors
   */
  const sanitizeState = (state: AnyState): Record<string, unknown> => {
    if (!state || typeof state !== 'object') return state as any;

    const safeState: Record<string, unknown> = {};

    for (const key in state) {
      const value = state[key];
      // Skip functions which cannot be cloned over IPC
      if (typeof value !== 'function') {
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          // Recursively sanitize nested objects
          safeState[key] = sanitizeState(value as AnyState);
        } else {
          safeState[key] = value;
        }
      }
    }

    return safeState;
  };

  // Handle getState requests from renderers
  ipcMain.handle(IpcChannel.GET_STATE, () => {
    try {
      cleanupDestroyedWindows();
      return sanitizeState(stateManager.getState());
    } catch (error) {
      console.error('Error handling getState:', error);
      return {};
    }
  });

  // Subscribe to state manager changes and broadcast to ALL subscribed windows
  const stateManagerUnsubscribe = stateManager.subscribe((state) => {
    try {
      cleanupDestroyedWindows();

      if (subscriptions.size === 0) {
        return;
      }

      // Sanitize state before sending
      const safeState = sanitizeState(state);

      for (const id of subscriptions) {
        const wrapper = wrapperMap.get(id);
        if (wrapper) {
          safelySendToWindow(wrapper, IpcChannel.SUBSCRIBE, safeState);
        }
      }
    } catch (error) {
      console.error('Error in state subscription handler:', error);
    }
  });

  // Add new windows to tracking and subscriptions
  const subscribe = (newWrappers: WebContentsWrapper[]): { unsubscribe: () => void } => {
    const addedIds: number[] = [];

    // Handle invalid input cases
    if (!newWrappers || !Array.isArray(newWrappers)) {
      return { unsubscribe: () => {} };
    }

    for (const wrapper of newWrappers) {
      const id = getWebContentsId(wrapper);
      if (id === null) continue;

      // Add to our maps
      wrapperMap.set(id, wrapper);
      subscriptions.add(id);
      addedIds.push(id);

      // Set up automatic cleanup when the window is destroyed
      try {
        wrapper.webContents.once('destroyed', () => {
          subscriptions.delete(id);
          wrapperMap.delete(id);
        });
      } catch (e) {
        // Ignore errors during setup
      }

      // Send initial state
      const currentState = sanitizeState(stateManager.getState());
      safelySendToWindow(wrapper, IpcChannel.SUBSCRIBE, currentState);
    }

    // Return an unsubscribe function
    return {
      unsubscribe: () => {
        for (const id of addedIds) {
          subscriptions.delete(id);
        }
      },
    };
  };

  // Remove windows from subscriptions
  const unsubscribe = (unwrappers?: WebContentsWrapper[]) => {
    if (!unwrappers) {
      // If no wrappers are provided, unsubscribe all
      subscriptions.clear();
      return;
    }

    for (const wrapper of unwrappers) {
      const id = getWebContentsId(wrapper);
      if (id !== null) {
        subscriptions.delete(id);
      }
    }
  };

  // Get the list of currently subscribed window IDs
  const getSubscribedWindows = (): number[] => {
    cleanupDestroyedWindows();
    return [...subscriptions];
  };

  // Cleanup function to remove all listeners
  const destroy = () => {
    stateManagerUnsubscribe();
    ipcMain.removeHandler(IpcChannel.GET_STATE);
    // We can't remove the "on" listener cleanly in Electron,
    // but we can ensure we don't process any more dispatches
    subscriptions.clear();
    wrapperMap.clear();
  };

  // Subscribe the initial wrappers
  if (initialWrappers.length > 0) {
    subscribe(initialWrappers);
  }

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
  windows: Array<BrowserWindow | WebContentsWrapper> = [],
  options?: ZustandOptions<S> | ReduxOptions<S>,
): BackendBridge<number> {
  // Get or create a state manager for the store
  const stateManager = getStateManager(store, options);

  // Create the bridge using the state manager
  return createCoreBridge(stateManager, windows);
}
