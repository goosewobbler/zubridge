import type { StoreApi } from 'zustand/vanilla';
import type { AnyState, Handler, RootReducer, StateManager } from '@zubridge/types';
import { findCaseInsensitiveMatch, findNestedHandler, resolveHandler } from '../utils/handlers.js';
import { debug } from '../utils/debug.js';

/**
 * Helper to check if a value is a Promise
 */
function isPromise(value: unknown): value is Promise<unknown> {
  return !!value && typeof value === 'object' && typeof (value as Promise<unknown>).then === 'function';
}

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
    processAction: async (action) => {
      try {
        debug('adapters', 'Zustand adapter processing action:', action);

        // First check if we have a custom handler for this action type
        if (options?.handlers) {
          // Try to resolve a handler for this action type
          debug('adapters', 'Checking for handler in custom handlers');
          const handler = resolveHandler(options.handlers, action.type);
          if (handler) {
            debug('adapters', `Found custom handler for action type: ${action.type}`);
            // Await the handler's execution - it might be async
            debug('adapters', `Executing handler for ${action.type}, time: ${new Date().toISOString()}`);
            const startTime = new Date().getTime();
            const result = handler(action.payload);

            // If the handler returns a Promise, await it
            if (isPromise(result)) {
              debug('adapters', `Handler for ${action.type} returned a Promise, awaiting completion`);
              await result;
              const endTime = new Date().getTime();
              debug(
                'adapters',
                `Async handler for ${action.type} completed in ${endTime - startTime}ms, time: ${new Date().toISOString()}`,
              );
            } else {
              const endTime = new Date().getTime();
              debug('adapters', `Sync handler for ${action.type} completed in ${endTime - startTime}ms`);
            }

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
            // Call the method and await if it returns a Promise
            const result = methodMatch[1](action.payload);
            if (isPromise(result)) {
              debug('adapters', `Method ${methodMatch[0]} returned a Promise, awaiting completion`);
              await result;
            }
            return;
          }

          // Try nested path resolution in state
          debug('adapters', 'Trying nested path resolution for handler in store state');
          const nestedStateHandler = findNestedHandler<Function>(state, action.type);
          if (nestedStateHandler) {
            debug('adapters', `Found nested handler in store state for: ${action.type}`);
            // Call the handler and await if it returns a Promise
            const result = nestedStateHandler(action.payload);
            if (isPromise(result)) {
              debug('adapters', `Nested handler for ${action.type} returned a Promise, awaiting completion`);
              await result;
            }
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
