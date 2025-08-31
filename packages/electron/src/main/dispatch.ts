import { debug } from '@zubridge/core';
import type {
  Action,
  AnyState,
  Dispatch,
  DispatchOptions,
  StateManager,
  Thunk,
} from '@zubridge/types';
import type { Store } from 'redux';
import { v4 as uuidv4 } from 'uuid';
import type { StoreApi } from 'zustand/vanilla';
import type { ReduxOptions } from '../adapters/redux.js';
import type { ZustandOptions } from '../adapters/zustand.js';
import { getStateManager } from '../lib/stateManagerRegistry.js';
import { getMainThunkProcessor } from './mainThunkProcessor.js';

// Get the main process thunk processor
const mainThunkProcessor = getMainThunkProcessor();

/**
 * Creates a dispatch function for the given store
 * This automatically gets or creates an appropriate state manager based on the store type
 */
export function createDispatch<S extends AnyState>(
  store: StoreApi<S> | Store<S>,
  options?: ZustandOptions<S> | ReduxOptions<S>,
): Dispatch<S>;
/**
 * Creates a dispatch function using a pre-created state manager
 * @internal This overload is intended for internal use by bridge creators
 */
export function createDispatch<S extends AnyState>(stateManager: StateManager<S>): Dispatch<S>;
/**
 * Implementation that handles both overloads
 */
export function createDispatch<S extends AnyState>(
  storeOrManager: StoreApi<S> | Store<S> | StateManager<S>,
  options?: ZustandOptions<S> | ReduxOptions<S>,
): Dispatch<S> {
  debug('core', 'Creating dispatch function', { hasOptions: !!options });

  // Get or create a state manager for the store or use the provided one
  const stateManager: StateManager<S> =
    'processAction' in storeOrManager
      ? (storeOrManager as StateManager<S>)
      : getStateManager(storeOrManager as StoreApi<S> | Store<S>, options);

  // Initialize the main thunk processor once during creation of the dispatch function
  mainThunkProcessor.initialize({
    stateManager,
  });

  // Internal dispatch implementation that accepts parentId and options
  const internalDispatch = async (
    actionOrThunk: Thunk<S> | Action | string,
    payload?: unknown,
    parentId?: string,
    options?: DispatchOptions,
  ): Promise<unknown> => {
    try {
      debug('core', 'Dispatching from main process');

      if (typeof actionOrThunk === 'function') {
        // Handle thunks
        debug('core', 'Executing thunk function');
        const thunkFunction = actionOrThunk as Thunk<S>;

        try {
          // Pass options to mainThunkProcessor
          const result = await mainThunkProcessor.executeThunk(thunkFunction, options);
          debug('core', 'Thunk execution completed successfully');
          return result;
        } catch (thunkError) {
          debug('core', 'Error during thunk execution:', thunkError);
          throw thunkError;
        }
      } else {
        // Handle regular actions
        try {
          let actionObj: Action;

          if (typeof actionOrThunk === 'string') {
            // Handle string action types with payload
            debug('core', `Dispatching string action: ${actionOrThunk}`);
            actionObj = {
              type: actionOrThunk,
              payload,
              __id: uuidv4(),
            };
          } else if (actionOrThunk && typeof actionOrThunk === 'object') {
            // Handle action objects
            debug('core', `Dispatching action object: ${(actionOrThunk as Action).type}`);
            actionObj = {
              ...(actionOrThunk as Action),
              __id: (actionOrThunk as Action).__id || uuidv4(),
            };
          } else {
            throw new Error(`Invalid action type: ${typeof actionOrThunk}`);
          }

          // Mark the action as originating from the main process
          actionObj.__isFromMainProcess = true;

          // If we have a parent ID, add it to the action
          if (parentId) {
            actionObj.__thunkParentId = parentId;

            // Mark this as a thunk start action if it's the first action with this parent
            if (mainThunkProcessor.isFirstActionForThunk(parentId)) {
              debug('core', `Marking action ${actionObj.__id} as starting thunk ${parentId}`);
              actionObj.__startsThunk = true;
            }
          }

          // Pass options to mainThunkProcessor
          mainThunkProcessor.processAction(actionObj, options);

          // Return the action object
          return actionObj;
        } catch (error) {
          debug('core', 'Error dispatching action:', error);
          throw error;
        }
      }
    } catch (error) {
      debug('core', 'Error in internalDispatch:', error);
      throw error;
    }
  };

  // Create the public dispatch function with the standard interface
  const dispatch: Dispatch<S> = (
    actionOrThunk: Thunk<S> | Action | string,
    payload?: unknown,
    options?: DispatchOptions,
  ): Promise<unknown> => {
    return internalDispatch(actionOrThunk, payload, undefined, options);
  };

  return dispatch;
}
