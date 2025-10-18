import type { StoreApi } from 'zustand';
import type { State } from '../index.js';

/**
 * Creates action handlers for counter operations using Immer middleware
 * With immer middleware, setState automatically uses produce() internally
 * This allows direct mutation syntax which is cleaner than manual produce() calls
 */
export const createCounterHandlers = (store: StoreApi<State>) => {
  return {
    'COUNTER:INCREMENT': () => {
      console.log('[Immer] Incrementing counter');
      store.setState((state) => {
        state.counter += 1;
      });
    },
    'COUNTER:DECREMENT': () => {
      console.log('[Immer] Decrementing counter');
      store.setState((state) => {
        state.counter -= 1;
      });
    },
  };
};
