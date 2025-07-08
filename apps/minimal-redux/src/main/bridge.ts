import { createReduxBridge, type ZustandBridge, type ZubridgeMiddleware } from '@zubridge/electron/main';
import type { Store } from 'redux';

/**
 * Creates a bridge using a Redux store
 * In this approach, we use Redux with Redux Toolkit to manage state
 */
export function createBridge(store: Store, middleware?: ZubridgeMiddleware): ZustandBridge {
  console.log('[Redux Mode] Creating bridge with Redux store');

  // Create bridge with Redux store and the createReduxBridge function from the library
  const bridge = createReduxBridge(store, {
    middleware,
  });

  return bridge;
}
