import type { BrowserWindow } from 'electron';
import type { Store } from 'redux';
import type { StoreApi } from 'zustand/vanilla';
import type { BackendBridge, WebContentsWrapper, AnyState, Dispatch } from '@zubridge/types';
import { createCoreBridge, createBridgeFromStore } from './bridge.js';
import { createDispatch } from './utils/dispatch.js';
import { ZustandOptions } from './adapters/zustand.js';
import { ReduxOptions } from './adapters/redux.js';
import { removeStateManager } from './utils/stateManagerRegistry.js';

/**
 * Export the core bridge creation function for custom implementations
 */
export { createCoreBridge };

/**
 * Re-export adapter options types
 */
export type { ZustandOptions, ReduxOptions };

/**
 * Interface for a bridge that connects a Zustand store to the main process
 */
export interface ZustandBridge<S extends AnyState = AnyState> extends BackendBridge<number> {
  subscribe: (windows: Array<BrowserWindow | WebContentsWrapper>) => { unsubscribe: () => void };
  unsubscribe: (windows?: Array<BrowserWindow | WebContentsWrapper>) => void;
  getSubscribedWindows: () => number[];
  dispatch: Dispatch<S>;
  destroy: () => void;
}

/**
 * Creates a bridge between a Zustand store and the renderer process
 */
export function createZustandBridge<S extends AnyState>(
  store: StoreApi<S>,
  windows: Array<BrowserWindow | WebContentsWrapper> = [],
  options?: ZustandOptions<S>,
): ZustandBridge<S> {
  // Create the core bridge with the store
  const coreBridge = createBridgeFromStore(store, windows, options);

  // Create the dispatch function with the same store
  const dispatchFn = createDispatch(store, options);

  // Return bridge with all functionality
  return {
    subscribe: coreBridge.subscribe,
    unsubscribe: coreBridge.unsubscribe,
    getSubscribedWindows: coreBridge.getSubscribedWindows,
    destroy: () => {
      coreBridge.destroy();
      // Clean up the state manager from the registry
      removeStateManager(store);
    },
    dispatch: dispatchFn,
  };
}

/**
 * Interface for a bridge that connects a Redux store to the main process
 */
export interface ReduxBridge<S extends AnyState = AnyState> extends BackendBridge<number> {
  subscribe: (windows: Array<BrowserWindow | WebContentsWrapper>) => { unsubscribe: () => void };
  unsubscribe: (windows?: Array<BrowserWindow | WebContentsWrapper>) => void;
  getSubscribedWindows: () => number[];
  dispatch: Dispatch<S>;
  destroy: () => void;
}

/**
 * Creates a bridge between a Redux store and the renderer process
 */
export function createReduxBridge<S extends AnyState>(
  store: Store<S>,
  windows: Array<BrowserWindow | WebContentsWrapper> = [],
  options?: ReduxOptions<S>,
): ReduxBridge<S> {
  // Create the core bridge with the store
  const coreBridge = createBridgeFromStore(store, windows, options);

  // Create the dispatch function with the same store
  const dispatchFn = createDispatch(store, options);

  // Return bridge with all functionality
  return {
    subscribe: coreBridge.subscribe,
    unsubscribe: coreBridge.unsubscribe,
    getSubscribedWindows: coreBridge.getSubscribedWindows,
    destroy: () => {
      coreBridge.destroy();
      // Clean up the state manager from the registry
      removeStateManager(store);
    },
    dispatch: dispatchFn,
  };
}

/**
 * Legacy bridge alias for backward compatibility
 * @deprecated This is now an alias for createZustandBridge and uses the new IPC channels.
 * Please update your code to use createZustandBridge directly in the future.
 */
export const mainZustandBridge = createZustandBridge;

export { createDispatch } from './utils/dispatch';
