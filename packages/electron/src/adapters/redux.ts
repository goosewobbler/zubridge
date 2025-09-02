import { debug } from '@zubridge/core';
import type { Action, AnyState, Handler, StateManager } from '@zubridge/types';
import type { Store } from 'redux';
import { ActionProcessingError } from '../errors/index.js';
import type { ZubridgeMiddleware } from '../middleware.js';
import { logZubridgeError } from '../utils/errorHandling.js';
import { resolveHandler } from '../utils/handlers.js';
import { isPromise } from '../utils/serialization.js';

/**
 * Options for the Redux adapter
 */
export interface ReduxOptions<_S extends AnyState> {
  handlers?: Record<string, Handler | Record<string, unknown>>;
  middleware?: ZubridgeMiddleware;
}

/**
 * Creates a state manager adapter for Redux stores
 *
 * This adapter connects a Redux store to the Zubridge bridge,
 * allowing it to be used with the Electron IPC system.
 */
export function createReduxAdapter<S extends AnyState>(
  store: Store<S>,
  options?: ReduxOptions<S>,
): StateManager<S> {
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

              // Create a single promise chain with proper error handling
              const completion = result
                .then(() => {
                  const endTime = Date.now();
                  debug(
                    'adapters',
                    `Async handler for ${action.type} completed in ${
                      endTime - startTime
                    }ms, time: ${new Date().toISOString()}`,
                  );
                  return undefined;
                })
                .catch((error: unknown) => {
                  const endTime = Date.now();

                  const actionError = new ActionProcessingError(
                    `Async handler execution failed for action ${action.type}`,
                    action.type,
                    'redux',
                    {
                      duration: endTime - startTime,
                      handlerName: 'async_handler',
                      originalError: error,
                    },
                  );

                  logZubridgeError(actionError);
                  // Return standardized error in result rather than throwing to prevent unhandled rejections
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

        // For Redux, we dispatch all actions to the store
        // with our standard Action format
        debug('adapters', `Dispatching action to Redux store: ${action.type}`);
        store.dispatch(action);
        return { isSync: true }; // Redux dispatch is synchronous
      } catch (error) {
        const actionError = new ActionProcessingError(
          `Synchronous action processing failed for action ${action.type}`,
          action.type,
          'redux',
          {
            context: 'sync_process_action',
            originalError: error,
          },
        );

        logZubridgeError(actionError);

        return {
          isSync: true,
          error: actionError.message, // Keep consistent with async error format
        };
      }
    },
  };
}
