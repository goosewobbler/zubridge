import type { StoreApi } from 'zustand';
import type { State } from '../index.js';

/**
 * Creates action handlers for counter operations in basic mode
 * In basic mode, these handlers are attached directly to the store state
 */
export const createCounterHandlers = (store: StoreApi<State>) => {
  return {
    'COUNTER:INCREMENT': () => {
      console.log('[Basic] Incrementing counter');
      store.setState((state) => ({
        ...state,
        counter: state.counter + 1,
      }));
    },
    'COUNTER:DECREMENT': () => {
      console.log('[Basic] Decrementing counter');
      store.setState((state) => ({
        ...state,
        counter: state.counter - 1,
      }));
    },
  };
};
