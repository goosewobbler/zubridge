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

    // Implement a slow double counter handler with delay
    'COUNTER:DOUBLE:SLOW': async () => {
      console.log(`[Basic] Doubling counter with delay`);
      console.log(`[Basic] Time before delay: ${new Date().toISOString()}`);

      // Use a longer delay on Linux to ensure proper sequence execution
      const delayTime = process.platform === 'linux' ? 5000 : 2500;
      console.log(`[Basic] Using ${delayTime}ms delay on platform: ${process.platform}`);

      // Wait for the configured delay time to simulate a slow operation
      await new Promise((resolve) => setTimeout(resolve, delayTime));

      console.log(`[Basic] Time after delay: ${new Date().toISOString()}`);
      setState((state) => {
        const newValue = (state.counter || 0) * 2;
        console.log(`[Basic] Counter doubled from ${state.counter} to ${newValue} after delay`);
        return {
          ...state,
          counter: newValue,
        };
      });
    },

    // Implement a slow halve counter handler with delay
    'COUNTER:HALVE:SLOW': async () => {
      console.log(`[Basic] Halving counter with 2500ms delay`);
      console.log(`[Basic] Time before delay: ${new Date().toISOString()}`);

      // Wait for 2500ms to simulate a slow operation
      await new Promise((resolve) => setTimeout(resolve, 2500));

      console.log(`[Basic] Time after delay: ${new Date().toISOString()}`);
      setState((state) => {
        const newValue = Math.round((state.counter || 0) / 2);
        console.log(`[Basic] Counter halved from ${state.counter} to ${newValue} after delay`);
        return {
          ...state,
          counter: newValue,
        };
      });
    },

    // Implement a double counter handler (no delay)
    'COUNTER:DOUBLE': () => {
      console.log(`[Basic] Doubling counter immediately`);
      setState((state) => {
        const newValue = (state.counter || 0) * 2;
        console.log(`[Basic] Counter doubled from ${state.counter} to ${newValue}`);
        return {
          ...state,
          counter: newValue,
        };
      });
    },

    // Implement a halve counter handler (no delay)
    'COUNTER:HALVE': () => {
      console.log(`[Basic] Halving counter immediately`);
      setState((state) => {
        const newValue = Math.round((state.counter || 0) / 2);
        console.log(`[Basic] Counter halved from ${state.counter} to ${newValue}`);
        return {
          ...state,
          counter: newValue,
        };
      });
    },
  }));
};
