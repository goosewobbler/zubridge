import type { StoreApi } from 'zustand/vanilla';
import type { AnyState, Handler, RootReducer, StateManager } from '@zubridge/types';
import { findCaseInsensitiveMatch, findNestedHandler, resolveHandler } from '../utils/handlers.js';
import { debug } from '@zubridge/core';

/**
 * Helper to check if a value is a Promise
 */
function isPromise(value: unknown): value is Promise<unknown> {
  return !!value && typeof value === 'object' && typeof (value as Promise<unknown>).then === 'function';
}

/**
 * Converts any promise to a Promise<void>
 * This helps guarantee type compatibility with ProcessResult.completion
 */
function toVoidPromise<T>(promise: Promise<T>): Promise<void> {
  return promise
    .then(() => undefined)
    .catch((error) => {
      debug('adapters:error', '[PROMISE_ERROR] Error in promise:', error);
      // Re-throw to ensure errors are propagated
      throw error;
    });
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
            // Execute the handler - it might be async
            debug('adapters', `Executing handler for ${action.type}, time: ${new Date().toISOString()}`);
            const startTime = new Date().getTime();
            const result = handler(action.payload);

            // If the handler returns a Promise, it's async
            if (isPromise(result)) {
              debug('adapters', `Handler for ${action.type} returned a Promise, it will complete asynchronously`);

              // Add unique ID for tracking this promise
              const promiseId = Math.random().toString(36).substring(2, 10);
              debug(
                'adapters',
                `[ADAPTER_DEBUG] [${promiseId}] Creating async handler promise wrapper for action: ${action.type}`,
              );

              // Transform the result promise to ensure it returns void
              const voidPromise = toVoidPromise(
                result.then(() => {
                  const endTime = new Date().getTime();
                  debug(
                    'adapters',
                    `[ADAPTER_DEBUG] [${promiseId}] Async handler promise for ${action.type} RESOLVED after ${endTime - startTime}ms`,
                  );
                  debug(
                    'adapters',
                    `Async handler for ${action.type} completed in ${endTime - startTime}ms, time: ${new Date().toISOString()}`,
                  );
                  debug('adapters', `[ADAPTER_DEBUG] [${promiseId}] STATE IS NOW UPDATED for ${action.type}`);
                }),
              );

              // Return both the async status and the void completion promise
              return {
                isSync: false,
                completion: voidPromise,
              };
            } else {
              const endTime = new Date().getTime();
              debug('adapters', `Sync handler for ${action.type} completed in ${endTime - startTime}ms`);
              return { isSync: true }; // Sync action
            }
          }
        }

        // Next check if we have a reducer
        if (options?.reducer) {
          debug('adapters', 'Using reducer to handle action');
          store.setState(options.reducer(store.getState(), action));
          return { isSync: true }; // Reducers are synchronous
        }

        // Handle built-in actions
        if (action.type === 'setState') {
          debug('adapters', 'Processing setState action');
          store.setState(action.payload as Partial<S>);
          return { isSync: true }; // setState is synchronous
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
            // Call the method and check if it returns a Promise
            const result = methodMatch[1](action.payload);
            if (isPromise(result)) {
              debug('adapters', `Method ${methodMatch[0]} returned a Promise, it will complete asynchronously`);
              // Return both the async status and the completion promise
              return {
                isSync: false,
                completion: toVoidPromise(
                  result.then(() => {
                    debug('adapters', `Async method ${methodMatch[0]} completed`);
                  }),
                ),
              };
            }
            return { isSync: true }; // Sync action
          }

          // Try nested path resolution in state
          debug('adapters', 'Trying nested path resolution for handler in store state');
          const nestedStateHandler = findNestedHandler<Function>(state, action.type);
          if (nestedStateHandler) {
            debug('adapters', `Found nested handler in store state for: ${action.type}`);
            // Call the handler and check if it returns a Promise
            const result = nestedStateHandler(action.payload);
            if (isPromise(result)) {
              debug(
                'adapters',
                `Nested handler for ${action.type} returned a Promise, it will complete asynchronously`,
              );
              // Return both the async status and the completion promise
              return {
                isSync: false,
                completion: toVoidPromise(
                  result.then(() => {
                    debug('adapters', `Async nested handler for ${action.type} completed`);
                  }),
                ),
              };
            }
            return { isSync: true }; // Sync action
          }

          debug('adapters', `No handler found for action type: ${action.type}`);
          return { isSync: true }; // Default to sync if no handler found
        }
      } catch (error) {
        debug('adapters:error', 'Error processing action:', error);
        return { isSync: true }; // Default to sync if error occurred
      }
    },
  };
}
