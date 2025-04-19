import type { Store } from 'redux';
import type { AnyState, Action, Handler, StateManager } from '@zubridge/types';

/**
 * Options for the Redux adapter
 */
export interface ReduxOptions<S extends AnyState> {
  exposeState?: boolean;
  handlers?: Record<string, Handler>;
}

/**
 * Creates a state manager adapter for Redux stores
 *
 * This adapter connects a Redux store to the Zubridge bridge,
 * allowing it to be used with the Electron IPC system.
 */
export function createReduxAdapter<S extends AnyState>(store: Store<S>, options?: ReduxOptions<S>): StateManager<S> {
  return {
    getState: () => store.getState(),
    subscribe: (listener) => store.subscribe(() => listener(store.getState())),
    processAction: (action: Action) => {
      try {
        // First check if we have a custom handler for this action type
        if (options?.handlers && typeof options.handlers[action.type] === 'function') {
          options.handlers[action.type](action.payload);
          return;
        }

        // For Redux, we dispatch all actions to the store
        // with our standard Action format
        store.dispatch(action as any);
      } catch (error) {
        console.error('Error processing Redux action:', error);
      }
    },
  };
}
