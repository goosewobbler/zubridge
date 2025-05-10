import type { StoreApi } from 'zustand/vanilla';
import type { AnyState, Handler, RootReducer, StateManager } from '@zubridge/types';
import { findCaseInsensitiveMatch, findNestedHandler, resolveHandler } from '../utils/handlers.js';
import { debug } from '../utils/debug.js';

/**
 * Options for the Zustand bridge and adapter
 */
export interface ZustandOptions<S extends AnyState> {
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
  debug('adapters', 'Creating Zustand adapter', options);

  return {
    getState: () => store.getState(),
    subscribe: (listener) => store.subscribe(listener),
    processAction: (action) => {
      try {
        debug('adapters', 'Zustand adapter processing action:', action);

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

        // Next check if we have a reducer
        if (options?.reducer) {
          debug('adapters', 'Using reducer to handle action');
          store.setState(options.reducer(store.getState(), action));
          return;
        }

        // Handle built-in actions
        if (action.type === 'setState') {
          debug('adapters', 'Processing setState action');
          store.setState(action.payload as Partial<S>);
        } else {
          // Check for a matching method in the store state
          debug('adapters', 'Looking for action handler in store state');
          const state = store.getState();

          // Try direct match with state functions
          const methodMatch = findCaseInsensitiveMatch(
            Object.fromEntries(Object.entries(state).filter(([_, value]) => typeof value === 'function')),
            action.type,
          );

          if (methodMatch && typeof methodMatch[1] === 'function') {
            debug('adapters', `Found direct method match in store state: ${methodMatch[0]}`);
            methodMatch[1](action.payload);
            return;
          }

          // Try nested path resolution in state
          debug('adapters', 'Trying nested path resolution for handler in store state');
          const nestedStateHandler = findNestedHandler<Function>(state, action.type);
          if (nestedStateHandler) {
            debug('adapters', `Found nested handler in store state for: ${action.type}`);
            nestedStateHandler(action.payload);
            return;
          }

          debug('adapters', `No handler found for action type: ${action.type}`);
        }
      } catch (error) {
        debug('adapters', 'Error processing action:', error);
        console.error('Error processing action:', error);
      }
    },
  };
}
