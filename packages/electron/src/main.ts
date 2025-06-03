import type { Store } from 'redux';
import type { StoreApi } from 'zustand/vanilla';
import type { BackendBridge, AnyState, Dispatch, WrapperOrWebContents } from '@zubridge/types';
import { createBridgeFromStore, CoreBridgeOptions } from './bridge.js';
import { createDispatch } from './main/dispatch.js';
import { ZustandOptions } from './adapters/zustand.js';
import { ReduxOptions } from './adapters/redux.js';
import { removeStateManager } from './lib/stateManagerRegistry.js';
import { createMiddlewareOptions, ZubridgeMiddleware } from './middleware.js';

/**
 * Re-export main process functionality
 */
export { createCoreBridge } from './bridge.js';
export { createBridgeFromStore } from './bridge.js';
export { createDispatch } from './main/dispatch.js';

// Export validation functions with proper parameter types
export {
  validateStateAccess,
  validateStateAccessWithExistence,
  validateStateAccessBatch,
  stateKeyExists,
  isSubscribedToKey,
  getWindowSubscriptions,
} from './renderer/subscriptionValidator.js';

// Export action validation functions with proper parameter types
export {
  registerActionMapping,
  registerActionMappings,
  getAffectedStateKeys,
  canDispatchAction,
  validateActionDispatch,
} from './renderer/actionValidator.js';

// Export types
export type { ZustandOptions } from './adapters/zustand.js';
export type { ReduxOptions } from './adapters/redux.js';
export type { CoreBridgeOptions } from './bridge.js';
export type { ZubridgeMiddleware } from './middleware.js';

/**
 * Interface for a bridge that connects a Zustand store to the main process
 */
export interface ZustandBridge<S extends AnyState = AnyState> extends BackendBridge<number> {
  subscribe: (windows: WrapperOrWebContents[], keys?: string[]) => { unsubscribe: () => void };
  unsubscribe: (windows?: WrapperOrWebContents[], keys?: string[]) => void;
  getSubscribedWindows: () => number[];
  getWindowSubscriptions: (windowId: number) => string[];
  dispatch: Dispatch<S>;
  destroy: () => void;
}

/**
 * Interface for a bridge that connects a Redux store to the main process
 */
export interface ReduxBridge<S extends AnyState = AnyState> extends BackendBridge<number> {
  subscribe: (windows: WrapperOrWebContents[], keys?: string[]) => { unsubscribe: () => void };
  unsubscribe: (windows?: WrapperOrWebContents[], keys?: string[]) => void;
  getSubscribedWindows: () => number[];
  getWindowSubscriptions: (windowId: number) => string[];
  dispatch: Dispatch<S>;
  destroy: () => void;
}

/**
 * Creates a bridge between a Zustand store and the renderer process
 */
export function createZustandBridge<S extends AnyState>(
  store: StoreApi<S>,
  options?: ZustandOptions<S> & CoreBridgeOptions,
): ZustandBridge<S> {
  // Create the core bridge with the store
  const coreBridge = createBridgeFromStore(store, options);

  // Create the dispatch function with the same store
  const dispatchFn = createDispatch(store, options);

  // Return bridge with all functionality
  return {
    subscribe: coreBridge.subscribe,
    unsubscribe: coreBridge.unsubscribe,
    getSubscribedWindows: coreBridge.getSubscribedWindows,
    getWindowSubscriptions: coreBridge.getWindowSubscriptions,
    destroy: () => {
      coreBridge.destroy();
      // Clean up the state manager from the registry
      removeStateManager(store);
    },
    dispatch: dispatchFn,
  };
}

/**
 * Creates a bridge between a Redux store and the renderer process
 */
export function createReduxBridge<S extends AnyState>(
  store: Store<S>,
  options?: ReduxOptions<S> & CoreBridgeOptions,
): ReduxBridge<S> {
  // Create the core bridge with the store
  const coreBridge = createBridgeFromStore(store, options);

  // Create the dispatch function with the same store
  const dispatchFn = createDispatch(store, options);

  // Return bridge with all functionality
  return {
    subscribe: coreBridge.subscribe,
    unsubscribe: coreBridge.unsubscribe,
    getSubscribedWindows: coreBridge.getSubscribedWindows,
    getWindowSubscriptions: coreBridge.getWindowSubscriptions,
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
