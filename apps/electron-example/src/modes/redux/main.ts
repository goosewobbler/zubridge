import { configureStore } from '@reduxjs/toolkit';
import { createCoreBridge, createDispatch } from '@zubridge/electron/main';
import type { BrowserWindow } from 'electron';
import type { Dispatch, Store } from 'redux';
import type { ZustandBridge } from '@zubridge/electron/main';
import type { StateManager, Action } from '@zubridge/types';

import { rootReducer } from './features/index.js';

/**
 * Creates a Redux store for the Redux mode using Redux Toolkit
 */
export function createStore() {
  console.log('[Store] Creating Redux store with Redux Toolkit');

  // Create the Redux store using configureStore
  const store = configureStore({
    reducer: rootReducer,
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({
        serializableCheck: false, // For better interop with Electron
      }),
  });

  return store;
}

/**
 * Creates a bridge using the Redux approach
 * In this approach, we use Redux with Redux Toolkit to manage state
 */
export const createReduxBridge = (store: Store<any> | null = null, windows: BrowserWindow[] = []): ZustandBridge => {
  console.log('[Redux Mode] Creating bridge with Redux store');

  // Create a store if one wasn't provided
  const reduxStore = store || createStore();

  // Log initial state for debugging
  console.log('[Redux Mode] Initial raw state:', JSON.stringify(reduxStore.getState()));

  // Create a state normalizer that transforms the Redux state format
  // to match the format used by other modes (direct counter number instead of { value: number })
  const normalizeState = (state: any) => {
    // Create a normalized copy of the state
    const normalizedState = { ...state };

    // Transform the counter object to a direct number value
    if (normalizedState.counter && typeof normalizedState.counter.value === 'number') {
      normalizedState.counter = normalizedState.counter.value;
      console.log(
        `[Redux Mode] Normalized counter from ${JSON.stringify(state.counter)} to ${normalizedState.counter}`,
      );
    } else {
      console.log(`[Redux Mode] Counter not normalized, original value:`, normalizedState.counter);
    }

    return normalizedState;
  };

  // Create a custom state manager that normalizes the state
  const stateManager: StateManager<any> = {
    getState: () => {
      const reduxState = reduxStore.getState();
      const normalizedState = normalizeState(reduxState);
      console.log('[Redux Mode] getState returning normalized state:', JSON.stringify(normalizedState));
      return normalizedState;
    },
    subscribe: (listener) => {
      return reduxStore.subscribe(() => {
        const rawState = reduxStore.getState();
        console.log('[Redux Mode] State update detected, raw state:', JSON.stringify(rawState));
        const normalizedState = normalizeState(rawState);
        console.log('[Redux Mode] Sending normalized state to listener:', JSON.stringify(normalizedState));
        listener(normalizedState);
      });
    },
    processAction: (action: Action) => {
      try {
        console.log(`[Redux Mode] Processing action:`, action);

        const dispatch = reduxStore.dispatch as Dispatch<Action>;

        // Dispatch actions directly to the Redux store - no translation needed
        // since our Redux slice now uses the same action types
        dispatch(action);

        // Log the resulting state after action
        const newState = reduxStore.getState();
        console.log(`[Redux Mode] State after action ${action.type}:`, JSON.stringify(newState));
      } catch (error) {
        console.error('Error processing Redux action:', error);
      }
    },
  };

  const coreBridge = createCoreBridge(stateManager, windows);
  const dispatchFn = createDispatch(stateManager);

  return {
    subscribe: coreBridge.subscribe,
    unsubscribe: coreBridge.unsubscribe,
    getSubscribedWindows: coreBridge.getSubscribedWindows,
    destroy: coreBridge.destroy,
    dispatch: dispatchFn,
  };
};
