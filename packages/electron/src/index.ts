import type { AnyState, Handlers } from '@zubridge/types';
import { useStore, type StoreApi } from 'zustand';
import { createStore as createZustandStore } from 'zustand/vanilla';
import type { Action, Thunk, ExtractState, ReadonlyStoreApi, DispatchFunc } from '@zubridge/types';
import { debugUtils } from './utils/debug.js';

// Export types
export type * from '@zubridge/types';

// Export debugging utilities
export const debug = debugUtils;

// Add type declaration for window.zubridge
declare global {
  interface Window {
    zubridge: Handlers<AnyState>;
  }
}

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
    throw new Error('Zubridge handlers not found in window. Make sure the preload script is properly set up.');
  }

  return window.zubridge as Handlers<S>;
};

/**
 * Creates a hook for accessing the store state in React components
 */
export const createUseStore = <S extends AnyState>(customHandlers?: Handlers<S>): UseBoundStore<StoreApi<S>> => {
  const handlers = customHandlers || createHandlers<S>();
  const vanillaStore = createStore<S>(handlers);
  const useBoundStore = (selector: (state: S) => unknown) => useStore(vanillaStore, selector);

  Object.assign(useBoundStore, vanillaStore);

  // return store hook
  return useBoundStore as UseBoundStore<StoreApi<S>>;
};

/**
 * Creates a dispatch function for sending actions to the main process
 *
 * @template S The state type
 * @template TActions A record of action types to payload types mapping (optional)
 * @param customHandlers Optional custom handlers to use instead of window.zubridge
 * @returns A typed dispatch function
 *
 * @example
 * // Basic usage
 * const dispatch = useDispatch();
 *
 * @example
 * // With typed actions
 * type CounterActions = {
 *   'COUNTER:INCREMENT': void;
 *   'COUNTER:DECREMENT': void;
 *   'COUNTER:SET': number;
 * };
 * const dispatch = useDispatch<State, CounterActions>();
 * dispatch({ type: 'COUNTER:SET', payload: 5 }); // Type-safe payload
 * dispatch({ type: 'UNKNOWN' }); // Type error
 */
export const useDispatch = <S extends AnyState = AnyState, TActions extends Record<string, any> = Record<string, any>>(
  customHandlers?: Handlers<S>,
): DispatchFunc<S, TActions> => {
  const handlers = customHandlers || createHandlers<S>();

  // Ensure we have a store for these handlers
  const store = storeRegistry.has(handlers) ? (storeRegistry.get(handlers) as StoreApi<S>) : createStore<S>(handlers);

  // Create a dispatch function that will handle both generic and typed actions
  const dispatch = ((
    action: Thunk<S> | Action | string | { type: keyof TActions; payload?: TActions[keyof TActions] },
    payload?: unknown,
  ): unknown => {
    // Debug helper function
    const debugLog = (message: string) => {
      if (typeof window !== 'undefined' && (window as any).ZUBRIDGE_DEBUG) {
        console.log(`[ZUBRIDGE_DISPATCH_DEBUG] ${message}`);
      }
    };

    if (typeof action === 'function') {
      // Handle thunks - execute them with the store's getState and our dispatch function
      debugLog('Executing thunk function');

      // Create a proper async dispatch wrapper that ensures all promises are awaited
      const asyncSafeDispatch = async (innerAction: any, innerPayload?: unknown): Promise<unknown> => {
        debugLog(
          `asyncSafeDispatch called with: ${typeof innerAction === 'string' ? innerAction : typeof innerAction}`,
        );

        // Return the promise from dispatch to allow proper awaiting
        if (typeof innerAction === 'string') {
          debugLog(`asyncSafeDispatch: dispatching string action "${innerAction}"`);
          const result =
            innerPayload !== undefined
              ? await handlers.dispatch(innerAction, innerPayload)
              : await handlers.dispatch(innerAction);
          debugLog(`asyncSafeDispatch: action "${innerAction}" completed`);
          return result;
        } else if (typeof innerAction === 'function') {
          // Handle nested thunks
          debugLog('asyncSafeDispatch: executing nested thunk');
          const result = await innerAction(store.getState, asyncSafeDispatch);
          debugLog('asyncSafeDispatch: nested thunk completed');
          return result;
        } else if (innerAction && typeof innerAction === 'object') {
          // Handle action objects
          debugLog(`asyncSafeDispatch: dispatching object action "${innerAction.type}"`);
          const result = await handlers.dispatch(innerAction);
          debugLog(`asyncSafeDispatch: action "${innerAction.type}" completed`);
          return result;
        } else {
          debugLog(`asyncSafeDispatch: received invalid action type: ${typeof innerAction}`);
          return Promise.resolve();
        }
      };

      debugLog('Passing asyncSafeDispatch to thunk');
      // Execute the thunk with our async-safe dispatch function
      return (action as Thunk<S>)(store.getState, asyncSafeDispatch);
    }

    // Handle string action type with payload
    if (typeof action === 'string') {
      // Only pass the payload parameter if it's not undefined, and handle promise return value
      debugLog(`Dispatching string action "${action}"`);
      return payload !== undefined ? handlers.dispatch(action, payload) : handlers.dispatch(action);
    }

    // For action objects, normalize to standard Action format
    if (typeof action.type !== 'string') {
      throw new Error(`Invalid action type: ${String(action.type)}. Expected a string.`);
    }
    const normalizedAction: Action = {
      type: action.type,
      payload: action.payload,
    };

    // Return the promise from dispatch
    debugLog(`Dispatching object action "${normalizedAction.type}"`);
    return handlers.dispatch(normalizedAction);
  }) as DispatchFunc<S, TActions>;

  return dispatch;
};

// Export environment utilities
export * from './utils/environment';
