import { createZustandBridge } from '@zubridge/electron/main';
import type { BrowserWindow } from 'electron';
import type { StoreApi } from 'zustand';
import type { RootReducer } from '@zubridge/types';
import type { ZustandBridge } from '@zubridge/electron/main';

// Import root reducer
import { rootReducer } from './features/index.js';
import type { BaseState } from '../../types/index.js';

/**
 * Creates a bridge using the reducers approach
 * In this approach, we provide a reducer function
 */
export const createReducersBridge = <S extends BaseState, Store extends StoreApi<S>>(
  store: Store,
  windows: BrowserWindow[],
): ZustandBridge => {
  console.log('[Reducers Mode] Creating bridge with reducer');

  // Add debugging wrapper around reducer
  const debugReducer: RootReducer<S> = (state, action) => {
    console.log('[Reducers] Action received:', action);
    console.log('[Reducers] Current state:', state);

    // Call the actual reducer
    const newState = rootReducer(state, action);

    console.log('[Reducers] New state:', newState);
    return newState as S;
  };

  // Create bridge with reducer
  return createZustandBridge<S>(store, windows, {
    reducer: debugReducer,
  });
};
