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

  // -----------------------------------------------------------------------
  // Action Queue Implementation
  // -----------------------------------------------------------------------
  // This queue ensures that all actions (including those from thunks) are
  // processed in sequence, preventing race conditions when multiple actions
  // are dispatched in quick succession or when thunks perform async operations.
  // -----------------------------------------------------------------------

  // Tracks the Promise chain of all actions, ensuring sequential processing
  let actionQueue = Promise.resolve();

  /**
   * Helper to log debug messages when debugging is enabled
   */
  const logDebug = (message: string) => {
    if (typeof window !== 'undefined' && (window as any).ZUBRIDGE_DEBUG) {
      debug.log('core', `[ZUBRIDGE_DISPATCH_DEBUG] ${message}`);
    }
  };

  /**
   * Creates a safe dispatch function for use inside thunks
   * This ensures all nested dispatches are also properly queued
   */
  const createDispatchForThunk = (getState: () => S) => {
    /**
     * Helper function to get a readable action type for logging
     */
    const getActionTypeForLogging = (action: any): string => {
      if (typeof action === 'string') {
        return action;
      }

      if (typeof action === 'object' && action?.type) {
        return action.type;
      }

      return typeof action;
    };

    const thunkDispatch = async (innerAction: any, innerPayload?: unknown): Promise<unknown> => {
      try {
        const actionType = getActionTypeForLogging(innerAction);
        logDebug(`thunkDispatch called with: ${actionType}`);

        // String action type with optional payload
        if (typeof innerAction === 'string') {
          logDebug(`thunkDispatch: dispatching string action "${innerAction}"`);
          const result =
            innerPayload !== undefined
              ? await handlers.dispatch(innerAction, innerPayload)
              : await handlers.dispatch(innerAction);
          logDebug(`thunkDispatch: action "${innerAction}" completed`);
          return result;
        }

        // Nested thunk
        else if (typeof innerAction === 'function') {
          logDebug('thunkDispatch: executing nested thunk');
          const result = await innerAction(getState, thunkDispatch);
          logDebug('thunkDispatch: nested thunk completed');
          return result;
        }

        // Action object
        else if (innerAction && typeof innerAction === 'object') {
          logDebug(`thunkDispatch: dispatching object action "${innerAction.type}"`);
          const result = await handlers.dispatch(innerAction);
          logDebug(`thunkDispatch: action "${innerAction.type}" completed`);
          return result;
        }

        // Invalid action
        else {
          logDebug(`thunkDispatch: received invalid action type: ${typeof innerAction}`);
          return Promise.resolve();
        }
      } catch (error) {
        logDebug(`thunkDispatch ERROR: ${error}`);
        console.error('Error in thunkDispatch:', error);
        throw error;
      }
    };

    return thunkDispatch;
  };

  /**
   * Process an action, ensuring it waits for previous actions to complete
   */
  const processAction = async (
    action: Thunk<S> | Action | string | { type: keyof TActions; payload?: TActions[keyof TActions] },
    payload?: unknown,
  ): Promise<unknown> => {
    try {
      // Function: Execute thunk with store's getState and our dispatch function
      if (typeof action === 'function') {
        logDebug('Executing thunk function');
        const thunkDispatch = createDispatchForThunk(store.getState);
        return await (action as Thunk<S>)(store.getState, thunkDispatch);
      }

      // String action type with optional payload
      if (typeof action === 'string') {
        logDebug(`Dispatching string action "${action}"`);
        return payload !== undefined ? await handlers.dispatch(action, payload) : await handlers.dispatch(action);
      }

      // Action object: normalize to standard Action format
      if (typeof action === 'object' && action !== null && typeof action.type === 'string') {
        const normalizedAction: Action = {
          type: action.type,
          payload: action.payload,
        };

        logDebug(`Dispatching object action "${normalizedAction.type}"`);
        return await handlers.dispatch(normalizedAction);
      }

      // Invalid action
      const errorMessage = `Invalid action or thunk: ${action}`;
      logDebug(`ERROR: ${errorMessage}`);
      console.error(errorMessage);
      return undefined;
    } catch (err) {
      const errorMessage = `Error in dispatch: ${err}`;
      logDebug(`ERROR: ${errorMessage}`);
      console.error('Error in dispatch:', err);

      // Re-throw errors in the async context
      throw err;
    }
  };

  // Create a dispatch function that will handle both generic and typed actions
  const dispatch = (async (
    action: Thunk<S> | Action | string | { type: keyof TActions; payload?: TActions[keyof TActions] },
    payload?: unknown,
  ): Promise<unknown> => {
    // Add this action to the queue, ensuring it only executes after all previous actions
    // have completed. This maintains order even with async operations.
    const actionPromise = actionQueue.then(() => processAction(action, payload));

    // Update our queue to include this new action
    actionQueue = actionPromise.catch(() => {
      // Catch errors here to prevent breaking the chain, but don't handle them
      // Let the returned promise propagate the error to the caller
    }) as Promise<void>;

    // Return the promise for this specific action
    return actionPromise;
  }) as unknown as DispatchFunc<S, TActions>;

  return dispatch;
};

// Export environment utilities
export * from './utils/environment';
