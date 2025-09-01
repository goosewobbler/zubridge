import type { ZubridgeMiddleware, ZustandBridge } from '@zubridge/electron/main';
import { createZustandBridge } from '@zubridge/electron/main';
import type { StoreApi } from 'zustand';
import type { BaseState } from '../../types.js';
import {
  decrementCounter,
  doubleCounter,
  doubleCounterSlow,
  halveCounter,
  halveCounterSlow,
  incrementCounter,
  setCounter,
  setCounterSlow,
} from './features/counter/index.js';
import { triggerMainProcessError } from './features/error/index.js';
import type { ActionHandlers } from './features/index.js';
import { generateLargeState, resetState } from './features/state/index.js';
import { setTheme, toggleTheme } from './features/theme/index.js';

/**
 * Creates action handlers for the handlers mode
 */
export const createHandlers = <S extends BaseState>(store: StoreApi<S>): ActionHandlers => {
  return {
    'COUNTER:INCREMENT': () => incrementCounter(store)(),
    'COUNTER:DECREMENT': () => decrementCounter(store)(),
    'COUNTER:SET': (payload?: unknown) => setCounter(store)(payload as number),
    'COUNTER:SET:SLOW': (payload?: unknown) => setCounterSlow(store)(payload as number),
    'COUNTER:DOUBLE': () => doubleCounter(store)(),
    'COUNTER:HALVE': () => halveCounter(store)(),
    'COUNTER:DOUBLE:SLOW': () => doubleCounterSlow(store)(),
    'COUNTER:HALVE:SLOW': () => halveCounterSlow(store)(),
    'THEME:TOGGLE': () => toggleTheme(store)(),
    'THEME:SET': (payload?: unknown) => setTheme(store)(payload as boolean),
    'STATE:RESET': () => resetState(store)(),
    'STATE:GENERATE-FILLER': (payload?: unknown) =>
      generateLargeState(store)(payload as { variant?: 'small' | 'medium' | 'large' | 'xl' }),
    'ERROR:TRIGGER_MAIN_PROCESS_ERROR': () => triggerMainProcessError()(),
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
