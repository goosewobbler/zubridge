import type { Store } from 'redux';
import type { StoreApi } from 'zustand/vanilla';
import type { BackendBridge, AnyState, Dispatch, WrapperOrWebContents } from '@zubridge/types';
import { createCoreBridge, createBridgeFromStore, CoreBridgeOptions } from './bridge.js';
import { createDispatch } from './utils/dispatch.js';
import { ZustandOptions } from './adapters/zustand.js';
import { ReduxOptions } from './adapters/redux.js';
import { removeStateManager } from './utils/stateManagerRegistry.js';
import { createMiddlewareOptions, ZubridgeMiddleware } from './middleware.js';

/**
 * Export the core bridge creation function for custom implementations
 */
export { createCoreBridge };

/**
 * Re-export adapter options types and middleware options
 */
export type { ZustandOptions, ReduxOptions, CoreBridgeOptions, ZubridgeMiddleware };

/**
 * Export middleware helper
 */
export { createMiddlewareOptions };

/**
 * Interface for a bridge that connects a Zustand store to the main process
 */
export interface ZustandBridge<S extends AnyState = AnyState> extends BackendBridge<number> {
  subscribe: (windows: WrapperOrWebContents[]) => { unsubscribe: () => void };
  unsubscribe: (windows?: WrapperOrWebContents[]) => void;
  getSubscribedWindows: () => number[];
  dispatch: Dispatch<S>;
  destroy: () => void;
}

/**
 * Creates a bridge between a Zustand store and the renderer process
 */
export function createZustandBridge<S extends AnyState>(
  store: StoreApi<S>,
  windows?: WrapperOrWebContents[],
  options?: ZustandOptions<S> & CoreBridgeOptions,
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
  subscribe: (windows: WrapperOrWebContents[]) => { unsubscribe: () => void };
  unsubscribe: (windows?: WrapperOrWebContents[]) => void;
  getSubscribedWindows: () => number[];
  dispatch: Dispatch<S>;
  destroy: () => void;
}

/**
 * Creates a bridge between a Redux store and the renderer process
 */
export function createReduxBridge<S extends AnyState>(
  store: Store<S>,
  windows?: WrapperOrWebContents[],
  options?: ReduxOptions<S> & CoreBridgeOptions,
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
