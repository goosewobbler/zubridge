import { createZustandBridge } from '@zubridge/electron/main';
import type { StoreApi } from 'zustand';
import type { ZustandBridge, ZubridgeMiddleware } from '@zubridge/electron/main';

import { incrementCounter, decrementCounter } from '../features/counter/index.js';
import { toggleTheme } from '../features/theme/index.js';
import type { State, ActionHandlers } from '../features/index.js';

/**
 * Creates action handlers for the handlers mode
 */
export const createHandlers = (store: StoreApi<State>): ActionHandlers => {
  return {
    'COUNTER:INCREMENT': incrementCounter(store),
    'COUNTER:DECREMENT': decrementCounter(store),
    'THEME:TOGGLE': toggleTheme(store),
  };
};

/**
 * Creates a bridge using the handlers approach
 * In this approach, we provide separate action handlers
 */
export function createBridge(
  store: StoreApi<State>,
  middleware?: ZubridgeMiddleware,
): ZustandBridge {
  console.log('[Handlers Mode] Creating bridge with separate handlers');

  // Define action handlers
  const handlers = createHandlers(store);

  // Create bridge with handlers and middleware if provided
  return createZustandBridge<State>(store, {
    handlers,
    middleware,
  });
}
