import {
  createReduxBridge,
  type ZustandBridge,
  type ZubridgeMiddleware,
} from '@zubridge/electron/main';
import type { Store } from 'redux';
import { actions } from './store.js';

/**
 * Creates a bridge using a Redux store
 * In this approach, we use Redux with Redux Toolkit to manage state
 */
export function createBridge(store: Store, middleware?: ZubridgeMiddleware): ZustandBridge {
  console.log('[Redux Mode] Creating bridge with Redux store');

  // Create bridge with Redux store and action mapping
  const bridge = createReduxBridge(store, {
    middleware,
    handlers: {
      // Map string actions to Redux action creators
      'COUNTER:INCREMENT': () => store.dispatch(actions['COUNTER:INCREMENT']()),
      'COUNTER:DECREMENT': () => store.dispatch(actions['COUNTER:DECREMENT']()),
      'THEME:TOGGLE': () => store.dispatch(actions['THEME:TOGGLE']()),
    },
  });

  return bridge;
}
