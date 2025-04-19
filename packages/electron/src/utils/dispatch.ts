import type { Action, AnyState, Dispatch, StateManager, Thunk } from '@zubridge/types';
import type { Store } from 'redux';
import type { StoreApi } from 'zustand/vanilla';
import { ZustandOptions } from '../adapters/zustand.js';
import { ReduxOptions } from '../adapters/redux.js';
import { getStateManager } from './stateManagerRegistry.js';

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
  // Get or create a state manager for the store or use the provided one
  const stateManager: StateManager<S> =
    'processAction' in storeOrManager
      ? (storeOrManager as StateManager<S>)
      : getStateManager(storeOrManager as StoreApi<S> | Store<S>, options);

  const dispatch: Dispatch<S> = (actionOrThunk, payload?: unknown): any => {
    try {
      if (typeof actionOrThunk === 'function') {
        // Handle thunks
        return (actionOrThunk as Thunk<S>)(() => stateManager.getState() as S, dispatch as any);
      } else if (typeof actionOrThunk === 'string') {
        // Handle string action types with payload
        stateManager.processAction({
          type: actionOrThunk,
          payload,
        });
      } else if (actionOrThunk && typeof actionOrThunk === 'object') {
        // Handle action objects
        stateManager.processAction(actionOrThunk as Action);
      } else {
        console.error('Invalid action or thunk:', actionOrThunk);
      }
    } catch (err) {
      console.error('Error in dispatch:', err);
    }
  };

  return dispatch;
}
