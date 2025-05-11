import { type StoreApi } from 'zustand';
import type { BaseState } from '../../../../types.js';

/**
 * Attaches the counter handlers to the state object
 * In the basic mode, handlers are part of the state object itself
 */
export const attachCounterHandlers = <S extends BaseState>(store: StoreApi<S>) => {
  const { setState } = store;

  // Set up counter initial state
  setState((state) => ({
    ...state,
    'counter': 0,

    // Implement the increment counter handler
    'COUNTER:INCREMENT': () => {
      console.log('[Basic] Incrementing counter');
      setState((state) => ({
        ...state,
        counter: (state.counter || 0) + 1,
      }));
    },

    // Implement the decrement counter handler
    'COUNTER:DECREMENT': () => {
      console.log('[Basic] Decrementing counter');
      setState((state) => ({
        ...state,
        counter: (state.counter || 0) - 1,
      }));
    },

    // Implement a set counter handler for thunks
    'COUNTER:SET': (value: number) => {
      console.log(`[Basic] Setting counter to ${value}`);
      setState((state) => ({
        ...state,
        counter: value,
      }));
    },

    // Implement a slow set counter handler with delay
    'COUNTER:SET:SLOW': async (value: number) => {
      console.log(`[Basic] Setting counter to ${value} with 2500ms delay`);
      console.log(`[Basic] Time before delay: ${new Date().toISOString()}`);

      // Wait for 2500ms to simulate a slow operation
      await new Promise((resolve) => setTimeout(resolve, 2500));

      console.log(`[Basic] Time after delay: ${new Date().toISOString()}`);
      setState((state) => ({
        ...state,
        counter: value,
      }));
      console.log(`[Basic] Counter set to ${value} after delay`);
    },

    // Implement a reset counter handler
    'COUNTER:RESET': () => {
      console.log('[Basic] Resetting counter to 0');
      setState((state) => ({
        ...state,
        counter: 0,
      }));
    },
  }));
};
