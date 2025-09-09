import { configureStore } from '@reduxjs/toolkit';
import type { ZubridgeMiddleware, ZustandBridge } from '@zubridge/electron/main';
import { createReduxBridge as createMainReduxBridge } from '@zubridge/electron/main';
import type { Store } from 'redux';

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
 * Creates a bridge using a Redux store
 * In this approach, we use Redux with Redux Toolkit to manage state
 */
export const createReduxBridge = (store: Store, middleware?: ZubridgeMiddleware): ZustandBridge => {
  console.log('[Redux Mode] Creating bridge with Redux store');

  // Create bridge with Redux store and the createReduxBridge function from the library
  return createMainReduxBridge(store, {
    middleware,
  });
};
