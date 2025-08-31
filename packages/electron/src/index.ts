import type { AnyState, DispatchFunc, DispatchOptions, Handlers } from '@zubridge/types';
import { useStore, type StoreApi } from 'zustand';
import { createStore as createZustandStore } from 'zustand/vanilla';
import type { Action, Thunk, ExtractState, ReadonlyStoreApi } from '@zubridge/types';

// Export types
export type * from '@zubridge/types';

// Store registry to implement singleton pattern
// Maps handler objects to their corresponding stores
const storeRegistry = new WeakMap<Handlers<any>, StoreApi<any>>();

// Internal implementation of store creation
const createStore = <S extends AnyState>(bridge: Handlers<S>): StoreApi<S> => {
  // Check if a store already exists for these handlers
  if (storeRegistry.has(bridge)) {
    return storeRegistry.get(bridge) as StoreApi<S>;
  }

  // Create a new store if one doesn't exist
  const newStore = createZustandStore<S>((setState: StoreApi<S>['setState']) => {
    // subscribe to changes
    bridge.subscribe((state: S) => setState(state));

    // get initial state
    bridge.getState().then((state: S) => setState(state));

    // no state keys - they will all come from main
    return {} as S;
  });

  // Register the store
  storeRegistry.set(bridge, newStore);

  return newStore;
};

type UseBoundStore<S extends ReadonlyStoreApi<unknown>> = {
  (): ExtractState<S>;
  <U>(selector: (state: ExtractState<S>) => U): U;
} & S;

// Create Electron-specific handlers
export const createHandlers = <S extends AnyState>(): Handlers<S> => {
  if (typeof window === 'undefined' || !window.zubridge) {
    throw new Error(
      'Zubridge handlers not found in window. Make sure the preload script is properly set up.',
    );
  }

  return window.zubridge as Handlers<S>;
};

/**
 * Creates a hook for accessing the store state in renderer components
 */
export const createUseStore = <S extends AnyState>(
  customHandlers?: Handlers<S>,
): UseBoundStore<StoreApi<S>> => {
  const handlers = customHandlers || createHandlers<S>();
  const vanillaStore = createStore<S>(handlers);
  const useBoundStore = (selector: (state: S) => unknown) => useStore(vanillaStore, selector);

  Object.assign(useBoundStore, vanillaStore);

  // return store hook
  return useBoundStore as UseBoundStore<StoreApi<S>>;
};

/**
 * Creates a dispatch function for use in renderer components
 */
function useDispatch<
  S extends AnyState = AnyState,
  TActions extends Record<string, any> = Record<string, any>,
>(customHandlers?: Handlers<S>): DispatchFunc<S, TActions> {
  const handlers = customHandlers || createHandlers<S>();

  // Create a dispatch function that delegates directly to handlers.dispatch
  const dispatch: DispatchFunc<S, TActions> = (
    action: string | Action | Thunk<S>,
    payloadOrOptions?: unknown | DispatchOptions,
    maybeOptions?: DispatchOptions,
  ): Promise<any> => {
    // Delegate based on the action type
    if (typeof action === 'string') {
      return handlers.dispatch(action, payloadOrOptions, maybeOptions);
    } else if (typeof action === 'function') {
      return handlers.dispatch(action, payloadOrOptions as DispatchOptions);
    } else {
      return handlers.dispatch(action, payloadOrOptions as DispatchOptions);
    }
  };

  return dispatch;
}

export { useDispatch };

// Export environment utilities
export * from './utils/environment.js';

// Export the validation utilities to be used by applications
export {
  validateStateAccess,
  validateStateAccessWithExistence,
  stateKeyExists,
  isSubscribedToKey,
  getWindowSubscriptions,
} from './renderer/subscriptionValidator.js';

// Export action validation utilities
export {
  registerActionMapping,
  registerActionMappings,
  getAffectedStateKeys,
  canDispatchAction,
  validateActionDispatch,
} from './renderer/actionValidator.js';
