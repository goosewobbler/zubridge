import type { StoreApi } from 'zustand/vanilla';
import type { AnyState, Handler, RootReducer, StateManager } from '@zubridge/types';

/**
 * Options for the Zustand bridge and adapter
 */
export interface ZustandOptions<S extends AnyState> {
  exposeState?: boolean;
  handlers?: Record<string, Handler>;
  reducer?: RootReducer<S>;
}

/**
 * Creates a state manager adapter for Zustand stores
 */
export function createZustandAdapter<S extends AnyState>(
  store: StoreApi<S>,
  options?: ZustandOptions<S>,
): StateManager<S> {
  return {
    getState: () => store.getState(),
    subscribe: (listener) => store.subscribe(listener),
    processAction: (action) => {
      try {
        // First check if we have a custom handler for this action type
        if (options?.handlers && typeof options.handlers[action.type] === 'function') {
          options.handlers[action.type](action.payload);
          return;
        }

        // Next check if we have a reducer
        if (options?.reducer) {
          store.setState(options.reducer(store.getState(), action));
          return;
        }

        // Handle built-in actions
        if (action.type === 'setState') {
          store.setState(action.payload as Partial<S>);
        } else if (typeof (store.getState() as any)[action.type] === 'function') {
          // If the action type corresponds to a store method, call it with the payload
          (store.getState() as any)[action.type](action.payload);
        }
      } catch (error) {
        console.error('Error processing action:', error);
      }
    },
  };
}
