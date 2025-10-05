import type { ZubridgeMiddleware, ZustandBridge } from '@zubridge/electron/main';
import { createZustandBridge } from '@zubridge/electron/main';
import type { RootReducer } from '@zubridge/types';
import { debug } from '@zubridge/utils';
import type { StoreApi } from 'zustand';
import type { BaseState } from '../../types.js';
// Import root reducer
import { rootReducer } from './features/index.js';

/**
 * Creates a bridge using the reducers approach
 * In this approach, we provide a Redux-style reducer function
 */
export const createReducersBridge = <S extends BaseState, Store extends StoreApi<S>>(
  store: Store,
  middleware?: ZubridgeMiddleware,
): ZustandBridge => {
  debug('core', '[Reducers Mode] Creating bridge with root reducer');

  // Add debugging wrapper around reducer
  const debugReducer: RootReducer<S> = (state, action) => {
    debug('store', '[Reducers] Action received:', action);
    debug('store', '[Reducers] Current state:', state);

    // Call the actual reducer
    const newState = rootReducer(state, action);

    debug('store', '[Reducers] New state:', newState);
    return newState as S;
  };

  // Create bridge with root reducer and middleware if provided
  return createZustandBridge<S>(store, {
    reducer: debugReducer,
    middleware,
  });
};
