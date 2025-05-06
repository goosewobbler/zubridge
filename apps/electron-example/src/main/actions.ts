import type { Thunk } from '@zubridge/types';
import { State } from '../types';

/**
 * Helper function to create a thunk that performs a sequence of operations
 * in the main process to demonstrate awaiting behavior
 */
export const createMainProcessThunk = (): Thunk<Partial<State>> => {
  return async (getState, dispatch) => {
    try {
      const delayTime = 500; // milliseconds

      // Log initial state
      const currentState = getState();
      const currentValue = currentState.counter as number;
      console.log(`[MAIN_PROCESS_THUNK] Starting with counter value: ${currentValue}`);

      // First async operation - quadruple the value
      console.log(`[MAIN_PROCESS_THUNK] First operation: Quadrupling counter to ${currentValue * 4}`);
      await dispatch({ type: 'COUNTER:SET', payload: currentValue * 4 });

      // Add delay to simulate async work
      await new Promise((resolve) => setTimeout(resolve, delayTime));

      // Log intermediate state after first operation
      const intermediateState = getState();
      const intermediateValue = intermediateState.counter as number;
      console.log(`[MAIN_PROCESS_THUNK] After first operation: counter value is ${intermediateValue}`);

      // Second async operation - halve the value
      console.log(`[MAIN_PROCESS_THUNK] Second operation: Halving counter to ${intermediateValue / 2}`);
      await dispatch({ type: 'COUNTER:SET', payload: intermediateValue / 2 });

      // Add delay to simulate async work
      await new Promise((resolve) => setTimeout(resolve, delayTime));

      // Log final state
      const finalState = getState();
      const finalValue = finalState.counter as number;
      console.log(`[MAIN_PROCESS_THUNK] After second operation: counter value is ${finalValue}`);
      console.log(`[MAIN_PROCESS_THUNK] Test complete: expected ${currentValue * 2}, got ${finalValue}`);

      return finalValue;
    } catch (error) {
      console.error('[MAIN_PROCESS_THUNK] Error executing thunk:', error);
      throw error;
    }
  };
};
