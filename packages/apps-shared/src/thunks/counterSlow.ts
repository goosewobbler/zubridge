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
 * Creates a thunk that doubles the counter value but uses slow actions
 * This thunk demonstrates multi-step async operations with logging
 * All actions are performed using COUNTER:SET:SLOW for extended delays
 */
export const createDoubleCounterSlowThunk = <S extends BaseState = BaseState>(
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
      const delayTime = 500; // milliseconds between operations

      // Log initial state
      console.log(`${logPrefix} Starting with counter value: ${initialCounter}`);
      console.log(`${logPrefix} Current time: ${new Date().toISOString()}`);

      // First async operation - double the value with SLOW action
      console.log(`${logPrefix} First operation: Doubling counter to ${initialCounter * 2} using SLOW action`);
      console.log(`${logPrefix} Time before first slow action: ${new Date().toISOString()}`);

      const startTime1 = new Date().getTime();
      await dispatch('COUNTER:SET:SLOW', initialCounter * 2);
      const endTime1 = new Date().getTime();
      const duration1 = endTime1 - startTime1;

      console.log(`${logPrefix} First slow action completed in ${duration1}ms`);
      console.log(`${logPrefix} Time after first slow action: ${new Date().toISOString()}`);

      // Add delay to simulate async work between operations
      await new Promise((resolve) => setTimeout(resolve, delayTime));

      // Log intermediate state after first operation
      const intermediateValue = await getCounter();
      console.log(`${logPrefix} After first operation: counter value is ${intermediateValue}`);
      console.log(`${logPrefix} Current time: ${new Date().toISOString()}`);

      // Check if another window modified our value
      if (intermediateValue !== initialCounter * 2) {
        console.log(
          `${logPrefix} Warning: Intermediate value (${intermediateValue}) doesn't match expected value (${initialCounter * 2}). Another window may have modified the counter.`,
        );
      }

      // Second async operation - double the value again using SLOW action
      const expectedSecondValue = intermediateValue * 2;
      console.log(`${logPrefix} Second operation: Doubling counter to ${expectedSecondValue} using SLOW action`);
      console.log(`${logPrefix} Time before second slow action: ${new Date().toISOString()}`);

      const startTime2 = new Date().getTime();
      await dispatch('COUNTER:SET:SLOW', expectedSecondValue);
      const endTime2 = new Date().getTime();
      const duration2 = endTime2 - startTime2;

      console.log(`${logPrefix} Second slow action completed in ${duration2}ms`);
      console.log(`${logPrefix} Time after second slow action: ${new Date().toISOString()}`);

      // Log intermediate state after second operation
      const intermediateValue2 = await getCounter();
      console.log(`${logPrefix} After second operation: counter value is ${intermediateValue2}`);

      // Final operation - halve the counter value using SLOW action
      const expectedFinalValue = intermediateValue2 / 2;
      console.log(`${logPrefix} Third operation: Halving counter to ${expectedFinalValue} using SLOW action`);
      console.log(`${logPrefix} Time before third slow action: ${new Date().toISOString()}`);

      const startTime3 = new Date().getTime();
      await dispatch('COUNTER:SET:SLOW', expectedFinalValue);
      const endTime3 = new Date().getTime();
      const duration3 = endTime3 - startTime3;

      console.log(`${logPrefix} Third slow action completed in ${duration3}ms`);
      console.log(`${logPrefix} Time after third slow action: ${new Date().toISOString()}`);

      // Log final state
      const finalValue = await getCounter();
      console.log(`${logPrefix} After final operation: counter value is ${finalValue}`);

      // Verify result - the expected value after double → double → halve is initialCounter * 2
      // For example: 2 → 4 → 8 → 4
      if (finalValue === initialCounter * 2) {
        console.log(`${logPrefix} Test PASSED: Got expected value: ${finalValue}`);
      } else {
        console.log(`${logPrefix} Test FAILED: Got unexpected value: ${finalValue}, expected ${initialCounter * 2}`);
      }

      return finalValue;
    } catch (error) {
      console.error(`${logPrefix} Error executing slow thunk:`, error);
      throw error;
    }
  };
};
