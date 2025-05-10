import type { Action, AnyState, Dispatch, StateManager, Thunk } from '@zubridge/types';
import type { Store } from 'redux';
import type { StoreApi } from 'zustand/vanilla';
import { ZustandOptions } from '../adapters/zustand.js';
import { ReduxOptions } from '../adapters/redux.js';
import { getStateManager } from '../lib/stateManagerRegistry.js';
import { debug } from '../utils/debug.js';
import { getMainThunkProcessor } from './mainThunkProcessor.js';
import { v4 as uuidv4 } from 'uuid';

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

  // Initialize the main thunk processor
  mainThunkProcessor.initialize({
    stateManager,
  });

  // Internal dispatch implementation that accepts parentId
  const internalDispatch = async (
    actionOrThunk: Thunk<S> | Action | string,
    payload?: unknown,
    parentId?: string,
  ): Promise<any> => {
    try {
      debug('core', 'Dispatching from main process');

      if (typeof actionOrThunk === 'function') {
        // Handle thunks
        debug('core', 'Executing thunk function');
        const thunkFunction = actionOrThunk as Thunk<S>;

        return new Promise(async (resolve, reject) => {
          try {
            // Create an async getState function that returns the latest state
            const getState = async () => stateManager.getState() as S;

            // Execute the thunk
            try {
              // Initialize the processor for this dispatch
              mainThunkProcessor.initialize({
                stateManager,
              });

              const result = await mainThunkProcessor.executeThunk(thunkFunction, getState, parentId);
              resolve(result);
            } catch (thunkError) {
              reject(thunkError);
            }
          } catch (err) {
            debug('core', 'Error executing thunk:', err);
            reject(err);
          }
        });
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
              id: uuidv4(),
            };
          } else if (actionOrThunk && typeof actionOrThunk === 'object') {
            // Handle action objects
            debug('core', `Dispatching action object: ${(actionOrThunk as Action).type}`);
            actionObj = {
              ...(actionOrThunk as Action),
              id: (actionOrThunk as Action).id || uuidv4(),
            };
          } else {
            throw new Error(`Invalid action type: ${typeof actionOrThunk}`);
          }

          // Initialize the processor for this dispatch
          mainThunkProcessor.initialize({
            stateManager,
          });

          // Mark the action as originating from the main process
          (actionObj as any).__isFromMainProcess = true;

          // If we have a parent ID, add it to the action
          if (parentId) {
            (actionObj as any).__thunkParentId = parentId;
          }

          // Process the action
          mainThunkProcessor.processAction(actionObj);

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
  const dispatch: Dispatch<S> = (actionOrThunk: Thunk<S> | Action | string, payload?: unknown): Promise<any> => {
    return internalDispatch(actionOrThunk, payload);
  };

  return dispatch;
}
