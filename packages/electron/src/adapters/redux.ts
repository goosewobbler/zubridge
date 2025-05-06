import type { Store } from 'redux';
import type { AnyState, Action, Handler, StateManager } from '@zubridge/types';
import { resolveHandler } from '../utils/handler-resolution.js';
import { debug } from '../utils/debug.js';

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
  debug('adapters', 'Creating Redux adapter', options);

  return {
    getState: () => store.getState(),
    subscribe: (listener) => store.subscribe(() => listener(store.getState())),
    processAction: (action: Action) => {
      try {
        debug('adapters', 'Redux adapter processing action:', action);

        // First check if we have a custom handler for this action type
        if (options?.handlers) {
          // Try to resolve a handler for this action type
          debug('adapters', 'Checking for handler in custom handlers');
          const handler = resolveHandler(options.handlers, action.type);
          if (handler) {
            debug('adapters', `Found custom handler for action type: ${action.type}`);
            handler(action.payload);
            return;
          }
        }

        // For Redux, we dispatch all actions to the store
        // with our standard Action format
        debug('adapters', `Dispatching action to Redux store: ${action.type}`);
        store.dispatch(action as any);
      } catch (error) {
        debug('adapters', 'Error processing Redux action:', error);
        console.error('Error processing Redux action:', error);
      }
    },
  };
}
