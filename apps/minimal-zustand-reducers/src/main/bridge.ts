import type { ZubridgeMiddleware, ZustandBridge } from '@zubridge/electron/main';
import { createZustandBridge } from '@zubridge/electron/main';
import type { RootReducer } from '@zubridge/types';
import type { StoreApi } from 'zustand';
import type { State } from '../features/index.js';
// Import root reducer
import { rootReducer } from '../features/index.js';

/**
 * Creates a bridge using the reducers approach
 * In this approach, we provide a Redux-style reducer function
 */
export function createBridge(
  store: StoreApi<State>,
  middleware?: ZubridgeMiddleware,
): ZustandBridge {
  console.log('[Reducers Mode] Creating bridge with root reducer');

  // Add debugging wrapper around reducer
  const debugReducer: RootReducer<State> = (state, action) => {
    console.log('[Reducers] Action received:', action);
    console.log('[Reducers] Current state:', state);

    // Call the actual reducer
    const newState = rootReducer(state, action);

    console.log('[Reducers] New state:', newState);
    return newState;
  };

  // Create bridge with root reducer and middleware if provided
  return createZustandBridge<State>(store, {
    reducer: debugReducer,
    middleware,
  });
}
