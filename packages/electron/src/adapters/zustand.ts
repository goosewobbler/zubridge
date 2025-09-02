import { debug } from '@zubridge/core';
import type { AnyState, Handler, RootReducer, StateManager } from '@zubridge/types';
import type { StoreApi } from 'zustand/vanilla';
import { ActionProcessingError } from '../errors/index.js';
import type { ZubridgeMiddleware } from '../middleware.js';
import { logZubridgeError } from '../utils/errorHandling.js';
import { findCaseInsensitiveMatch, findNestedHandler, resolveHandler } from '../utils/handlers.js';
import { isPromise } from '../utils/serialization.js';

/**
 * Options for the Zustand bridge and adapter
 */
export interface ZustandOptions<S extends AnyState> {
  handlers?: Record<string, Handler>;
  reducer?: RootReducer<S>;
  middleware?: ZubridgeMiddleware;
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
            debug(
              'adapters',
              `Executing handler for ${action.type}, time: ${new Date().toISOString()}`,
            );
            const startTime = Date.now();
            const result = handler(action.payload);

            // If the handler returns a Promise, it's async
            if (isPromise(result)) {
              debug(
                'adapters',
                `Handler for ${action.type} returned a Promise, it will complete asynchronously`,
              );

              // Add unique ID for tracking this promise
              const promiseId = Math.random().toString(36).substring(2, 10);
              debug(
                'adapters',
                `[ADAPTER_DEBUG] [${promiseId}] Creating async handler promise wrapper for action: ${action.type}`,
              );

              // Create a single promise chain with proper error handling
              const completion = result
                .then(() => {
                  const endTime = Date.now();
                  debug(
                    'adapters',
                    `[ADAPTER_DEBUG] [${promiseId}] Async handler promise for ${action.type} RESOLVED after ${endTime - startTime}ms`,
                  );
                  debug(
                    'adapters',
                    `Async handler for ${action.type} completed in ${endTime - startTime}ms, time: ${new Date().toISOString()}`,
                  );
                  debug(
                    'adapters',
                    `[ADAPTER_DEBUG] [${promiseId}] STATE IS NOW UPDATED for ${action.type}`,
                  );
                  return undefined;
                })
                .catch((error: unknown) => {
                  const endTime = Date.now();

                  const actionError = new ActionProcessingError(
                    `Async handler execution failed for action ${action.type}`,
                    action.type,
                    'zustand',
                    {
                      promiseId,
                      duration: endTime - startTime,
                      handlerName: 'async_handler',
                      originalError: error,
                    },
                  );

                  logZubridgeError(actionError);
                  // For IPC communication, serialize the error
                  return { error: actionError.message };
                });

              // Return both the async status and the completion promise
              return {
                isSync: false,
                completion,
              };
            }
            const endTime = Date.now();
            debug(
              'adapters',
              `Sync handler for ${action.type} completed in ${endTime - startTime}ms`,
            );
            return { isSync: true }; // Sync action
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
        }
        // Check for a matching method in the store state
        debug('adapters', 'Looking for action handler in store state');
        const state = store.getState();

        // Try direct match with state functions
        const methodMatch = findCaseInsensitiveMatch(
          Object.fromEntries(
            Object.entries(state).filter(([_, value]) => typeof value === 'function'),
          ),
          action.type,
        );

        if (methodMatch && typeof methodMatch[1] === 'function') {
          debug('adapters', `Found direct method match in store state: ${methodMatch[0]}`);
          // Call the method and check if it returns a Promise
          const result = methodMatch[1](action.payload);
          if (isPromise(result)) {
            debug(
              'adapters',
              `Method ${methodMatch[0]} returned a Promise, it will complete asynchronously`,
            );
            // Return both the async status and the completion promise
            return {
              isSync: false,
              completion: result
                .then(() => {
                  debug('adapters', `Async method ${methodMatch[0]} completed`);
                  return undefined;
                })
                .catch((error: unknown) => {
                  const actionError = new ActionProcessingError(
                    `Async method execution failed for ${methodMatch[0]}`,
                    action.type,
                    'zustand',
                    {
                      methodName: methodMatch[0],
                      originalError: error,
                    },
                  );

                  logZubridgeError(actionError);
                  return { error: actionError.message };
                }),
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
              completion: result
                .then(() => {
                  debug('adapters', `Async nested handler for ${action.type} completed`);
                  return undefined;
                })
                .catch((error: unknown) => {
                  const actionError = new ActionProcessingError(
                    `Async nested handler execution failed for action ${action.type}`,
                    action.type,
                    'zustand',
                    {
                      handlerName: 'nested_handler',
                      originalError: error,
                    },
                  );

                  logZubridgeError(actionError);
                  return { error: actionError.message };
                }),
            };
          }
          return { isSync: true }; // Sync action
        }

        debug('adapters', `No handler found for action type: ${action.type}`);
        return { isSync: true }; // Default to sync if no handler found
      } catch (error) {
        const actionError = new ActionProcessingError(
          `Synchronous action processing failed for action ${action.type}`,
          action.type,
          'zustand',
          {
            context: 'sync_process_action',
            originalError: error,
          },
        );

        logZubridgeError(actionError);

        // Return standardized error so it can be propagated to the renderer
        return {
          isSync: true,
          error: actionError.message, // Keep consistent with async error format
        };
      }
    },
  };
}
