import { createZustandBridge } from '@zubridge/electron/main';
import type { StoreApi } from 'zustand';
import type { ZustandBridge, ZubridgeMiddleware } from '@zubridge/electron/main';

// Import counter handlers
import { incrementCounter, decrementCounter, setCounter, setCounterSlow } from './features/counter/index.js';
// Import theme handlers
import { toggleTheme, setTheme } from './features/theme/index.js';
// Import the state type
import type { BaseState } from '../../types.js';
import type { ActionHandlers } from './features/index.js';
import { resetState, generateLargeState } from './features/state/index.js';

/**
 * Creates action handlers for the handlers mode
 */
export const createHandlers = <S extends BaseState>(store: StoreApi<S>): ActionHandlers => {
  return {
    'COUNTER:INCREMENT': incrementCounter(store),
    'COUNTER:DECREMENT': decrementCounter(store),
    'COUNTER:SET': setCounter(store),
    'COUNTER:SET:SLOW': setCounterSlow(store),
    'THEME:TOGGLE': toggleTheme(store),
    'THEME:SET': setTheme(store),
    'STATE:RESET': resetState(store),
    'STATE:GENERATE-FILLER': generateLargeState(store),
  };
};

/**
 * Creates a bridge using the handlers approach
 * In this approach, we provide separate action handlers
 */
export const createHandlersBridge = <S extends BaseState, Store extends StoreApi<S>>(
  store: Store,
  middleware?: ZubridgeMiddleware,
): ZustandBridge => {
  console.log('[Handlers Mode] Creating bridge with separate handlers');

  // Define action handlers
  const handlers = createHandlers(store);

  // Create bridge with handlers and middleware if provided
  return createZustandBridge<S>(store, {
    handlers,
    middleware,
  });
};
