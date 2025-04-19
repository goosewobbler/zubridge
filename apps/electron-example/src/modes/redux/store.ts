import { configureStore } from '@reduxjs/toolkit';
import type { StoreApi } from 'zustand';
import type { Store } from 'redux';
import type { State } from '../../types/index.js';
import { rootReducer } from './features/index.js';

/**
 * Creates a Redux store adapter that conforms to the Zustand StoreApi interface
 */
function createReduxAdapter<S>(store: Store<S>): StoreApi<S> {
  let previousState = store.getState();

  return {
    getState: store.getState,
    getInitialState: store.getState,
    setState: (_partial, _replace) => {
      console.warn('setState is not supported for Redux stores, use dispatch instead');
    },
    subscribe: (listener) => {
      const unsubscribe = store.subscribe(() => {
        const currentState = store.getState();
        listener(currentState, previousState);
        previousState = currentState;
      });
      return unsubscribe;
    },
  };
}

/**
 * Gets a Redux store instance
 * Returns a StoreApi adapter for use with the Zubridge system
 */
export function getReduxStore(): StoreApi<State> {
  console.log('[Redux Mode] Creating Redux store');

  // Create the Redux store
  const reduxStore = configureStore({
    reducer: rootReducer,
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({
        serializableCheck: false, // For better interop with Electron
      }),
  });

  // Create a Zustand adapter for the Redux store
  return createReduxAdapter(reduxStore);
}
