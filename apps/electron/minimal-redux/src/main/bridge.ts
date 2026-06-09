import { createReduxBridge, type ZustandBridge } from '@zubridge/electron/main';
import type { Store } from 'redux';
import { actions } from './store.js';

/**
 * Creates a bridge using a Redux store
 * In this approach, we use Redux with Redux Toolkit to manage state
 */
export function createBridge(store: Store): ZustandBridge {
  console.log('[Redux Mode] Creating bridge with Redux store');

  const bridge = createReduxBridge(store, {
    handlers: {
      // Map string actions to Redux action creators
      'COUNTER:INCREMENT': () => store.dispatch(actions['COUNTER:INCREMENT']()),
      'COUNTER:DECREMENT': () => store.dispatch(actions['COUNTER:DECREMENT']()),
      'THEME:TOGGLE': () => store.dispatch(actions['THEME:TOGGLE']()),
    },
  });

  return bridge;
}
