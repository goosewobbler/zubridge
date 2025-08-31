import type { Store } from 'redux';
import type { AnyState, Action, Handler, StateManager } from '@zubridge/types';
import { debug } from '@zubridge/core';
import { resolveHandler } from '../utils/handlers.js';
import type { ZubridgeMiddleware } from '../middleware.js';

/**
 * Helper to check if a value is a Promise
 */
function isPromise(value: unknown): value is Promise<unknown> {
  return (
    !!value && typeof value === 'object' && typeof (value as Promise<unknown>).then === 'function'
  );
}

/**
 * Options for the Redux adapter
 */
export interface ReduxOptions<S extends AnyState> {
  handlers?: Record<string, Handler>;
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
            const startTime = new Date().getTime();
            const result = handler(action.payload);

            // If the handler returns a Promise, it's async
            if (isPromise(result)) {
              debug(
                'adapters',
                `Handler for ${action.type} returned a Promise, it will complete asynchronously`,
              );
              // Return both the async status and the completion promise
              return {
                isSync: false,
                completion: result
                  .then(() => {
                    const endTime = new Date().getTime();
                    debug(
                      'adapters',
                      `Async handler for ${action.type} completed in ${endTime - startTime}ms, time: ${new Date().toISOString()}`,
                    );
                  })
                  .catch((error) => {
                    debug('adapters:error', `Error in async handler for ${action.type}:`, error);
                  }),
              };
            } else {
              const endTime = new Date().getTime();
              debug(
                'adapters',
                `Sync handler for ${action.type} completed in ${endTime - startTime}ms`,
              );
              return { isSync: true }; // Sync action
            }
          }
        }

        // For Redux, we dispatch all actions to the store
        // with our standard Action format
        debug('adapters', `Dispatching action to Redux store: ${action.type}`);
        store.dispatch(action);
        return { isSync: true }; // Redux dispatch is synchronous
      } catch (error) {
        debug('adapters:error', 'Error processing Redux action:', error);
        return { isSync: true }; // Default to sync if error occurred
      }
    },
  };
}
