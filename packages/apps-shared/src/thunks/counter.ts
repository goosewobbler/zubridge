import type { Thunk } from '@zubridge/types';
import type { BaseState, ThunkContext } from '../types.js';

/**
 * Helper function to generate contextual logging prefix
 */
const getLogPrefix = (context: ThunkContext) => {
  const { environment, logPrefix } = context;
  const prefix =
    logPrefix || (environment === 'main' ? 'MAIN_PROCESS' : environment === 'renderer' ? 'RENDERER' : 'TAURI');
  return `[${prefix}_THUNK]`;
};

/**
 * Creates a thunk that doubles the counter value
 * This thunk demonstrates multi-step async operations with logging
 */
export const createDoubleCounterThunk = <S extends BaseState = BaseState>(
  initialCounter: number,
  context: ThunkContext,
): Thunk<S> => {
  const logPrefix = getLogPrefix(context);

  return async (getState, dispatch) => {
    const getCounter = async () => {
      const state = await getState();
      return state.counter;
    };

    try {
      const delayTime = 1500; // milliseconds

      // Log initial state
      console.log(`${logPrefix} Starting with counter value: ${initialCounter}`);

      // First async operation - double the value
      console.log(`${logPrefix} First operation: Doubling counter to ${initialCounter * 2}`);
      await dispatch('COUNTER:SET', initialCounter * 2);

      // Add delay to simulate async work
      await new Promise((resolve) => setTimeout(resolve, delayTime));

      // Log intermediate state after first operation
      const intermediateValue = await getCounter();
      console.log(`${logPrefix} After first operation: counter value is ${intermediateValue}`);

      // Check if another window modified our value
      if (intermediateValue !== initialCounter * 2) {
        console.log(
          `${logPrefix} Warning: Intermediate value (${intermediateValue}) doesn't match expected value (${initialCounter * 2}). Another window may have modified the counter.`,
        );
      }

      // Second async operation - double the intermediateValue
      console.log(`${logPrefix} Second operation: Doubling counter to ${intermediateValue * 2}`);
      await dispatch('COUNTER:SET', intermediateValue * 2);

      // Add delay to simulate async work
      await new Promise((resolve) => setTimeout(resolve, delayTime));

      // Log intermediate state after second operation
      const intermediateValue2 = await getCounter();
      console.log(`${logPrefix} After second operation: counter value is ${intermediateValue2}`);

      // Final operation - halve the counter value
      console.log(`${logPrefix} Third operation: Halving counter to ${intermediateValue2}`);
      await dispatch('COUNTER:SET', intermediateValue2 / 2);

      // Add delay to simulate async work
      await new Promise((resolve) => setTimeout(resolve, delayTime));

      // Log final state
      const finalValue = await getCounter();
      console.log(`${logPrefix} After final operation: counter value is ${finalValue}`);

      // Verify result
      if (finalValue === initialCounter * 2) {
        console.log(`${logPrefix} Test PASSED: Got expected value: ${finalValue}`);
      } else {
        console.log(`${logPrefix} Test FAILED: Got unexpected value: ${finalValue}`);
      }

      return finalValue;
    } catch (error) {
      console.error(`${logPrefix} Error executing thunk:`, error);
      throw error;
    }
  };
};
