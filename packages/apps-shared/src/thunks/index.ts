import { debug } from '@zubridge/core';
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
 * Options to customize the doubleCounter thunk behavior
 */
export interface DoubleCounterOptions {
  /**
   * Whether to use the SLOW action variant that introduces intentional delays
   * Default: false
   */
  useSlow?: boolean;

  /**
   * Time in ms to delay between operations
   * Default: 500
   */
  delayBetweenOperations?: number;

  /**
   * Whether to include timestamps in logs
   * Default: false
   */
  includeTimestamps?: boolean;
}

/**
 * Creates a thunk that doubles the counter value
 * This thunk demonstrates multi-step async operations with logging
 *
 * @param initialCounter The initial counter value
 * @param context The thunk execution context
 * @param options Configuration options for the thunk behavior
 * @returns A thunk function
 */
export const createDoubleCounterThunk = <S extends BaseState = BaseState>(
  initialCounter: number,
  context: ThunkContext,
  options: DoubleCounterOptions = {},
): Thunk<Partial<S>> => {
  const { useSlow = false, delayBetweenOperations = 100, includeTimestamps = false } = options;

  const logPrefix = getLogPrefix(context);
  const actionType = useSlow ? 'COUNTER:SET:SLOW' : 'COUNTER:SET';
  const thunkType = useSlow ? 'SLOW' : 'REGULAR';

  return async (getState, dispatch) => {
    const getCounter = async () => {
      const state = await getState();
      // Debug the entire state object
      debug('thunk', `${logPrefix} [DEBUG] [${thunkType}] Full state: ${JSON.stringify(state)}`);
      return state.counter ?? initialCounter; // Use nullish coalescing to handle undefined counter
    };

    const logWithTimestamp = (message: string) => {
      const timestamp = new Date().toISOString();
      if (includeTimestamps) {
        debug('thunk', `${message} (time: ${timestamp})`);
      } else {
        debug('thunk', message);
      }
    };

    try {
      // Log initial state
      const actualInitialState = await getState();
      const actualInitialCounter = await getCounter();
      logWithTimestamp(`${logPrefix} [DEBUG] [${thunkType}] STARTING THUNK at ${new Date().toISOString()}`);
      logWithTimestamp(
        `${logPrefix} [DEBUG] [${thunkType}] Initial counter param: ${initialCounter}, actual state counter: ${actualInitialCounter}`,
      );

      // First async operation - double the value
      const targetValue1 = initialCounter * 2;
      logWithTimestamp(
        `${logPrefix} [DEBUG] [${thunkType}] First operation: Doubling counter to ${targetValue1} using ${actionType}`,
      );

      const timestamp1 = new Date().toISOString();
      logWithTimestamp(`${logPrefix} [DEBUG] [${thunkType}] Time before first action: ${timestamp1}`);

      const startTime1 = new Date().getTime();
      await dispatch(actionType, targetValue1);
      const endTime1 = new Date().getTime();

      const duration1 = endTime1 - startTime1;
      logWithTimestamp(`${logPrefix} [DEBUG] [${thunkType}] First action completed in ${duration1}ms`);

      // Add delay to simulate async work
      await new Promise((resolve) => setTimeout(resolve, delayBetweenOperations));

      // Log intermediate state after first operation
      const intermediateValue = await getCounter();
      logWithTimestamp(
        `${logPrefix} [DEBUG] [${thunkType}] After first operation: counter value is ${intermediateValue}`,
      );

      // Check if another window modified our value
      if (intermediateValue !== targetValue1) {
        logWithTimestamp(
          `${logPrefix} [DEBUG] [${thunkType}] STATE CHANGED! Intermediate value (${intermediateValue}) doesn't match expected value (${targetValue1}).`,
        );
      }

      // Second async operation - double the intermediateValue
      const expectedSecondValue = intermediateValue * 2;
      logWithTimestamp(
        `${logPrefix} [DEBUG] [${thunkType}] Second operation: Doubling counter from ${intermediateValue} to ${expectedSecondValue} using ${actionType}`,
      );

      const timestamp2 = new Date().toISOString();
      logWithTimestamp(`${logPrefix} [DEBUG] [${thunkType}] Time before second action: ${timestamp2}`);

      // Double-check state hasn't changed
      const preActionValue = await getCounter();
      if (preActionValue !== intermediateValue) {
        logWithTimestamp(
          `${logPrefix} [DEBUG] [${thunkType}] WARNING: State changed between getCounter() calls! Was ${intermediateValue}, now ${preActionValue}`,
        );
      }

      const startTime2 = new Date().getTime();
      await dispatch(actionType, expectedSecondValue);
      const endTime2 = new Date().getTime();

      const duration2 = endTime2 - startTime2;
      logWithTimestamp(`${logPrefix} [DEBUG] [${thunkType}] Second action completed in ${duration2}ms`);

      // Add delay to simulate async work
      await new Promise((resolve) => setTimeout(resolve, delayBetweenOperations));

      // Log intermediate state after second operation
      const intermediateValue2 = await getCounter();
      logWithTimestamp(
        `${logPrefix} [DEBUG] [${thunkType}] After second operation: counter value is ${intermediateValue2}`,
      );

      // Check if value matches what we expected
      if (intermediateValue2 !== expectedSecondValue) {
        logWithTimestamp(
          `${logPrefix} [DEBUG] [${thunkType}] STATE CHANGED! Second intermediate value (${intermediateValue2}) doesn't match expected value (${expectedSecondValue}).`,
        );
      }

      // Final operation - halve the counter value
      const expectedFinalValue = intermediateValue2 / 2;
      logWithTimestamp(
        `${logPrefix} [DEBUG] [${thunkType}] Third operation: Halving counter from ${intermediateValue2} to ${expectedFinalValue} using ${actionType}`,
      );

      const timestamp3 = new Date().toISOString();
      logWithTimestamp(`${logPrefix} [DEBUG] [${thunkType}] Time before third action: ${timestamp3}`);

      // Double-check state hasn't changed
      const preThirdActionValue = await getCounter();
      if (preThirdActionValue !== intermediateValue2) {
        logWithTimestamp(
          `${logPrefix} [DEBUG] [${thunkType}] WARNING: State changed between getCounter() calls! Was ${intermediateValue2}, now ${preThirdActionValue}`,
        );
      }

      const startTime3 = new Date().getTime();
      await dispatch(actionType, expectedFinalValue);
      const endTime3 = new Date().getTime();

      const duration3 = endTime3 - startTime3;
      logWithTimestamp(`${logPrefix} [DEBUG] [${thunkType}] Third action completed in ${duration3}ms`);

      // Add delay to simulate async work
      await new Promise((resolve) => setTimeout(resolve, delayBetweenOperations));

      // Log final state
      const finalValue = await getCounter();
      logWithTimestamp(`${logPrefix} [DEBUG] [${thunkType}] After final operation: counter value is ${finalValue}`);

      // Verify result - the expected value after double → double → halve is initialCounter * 2
      // For example: 2 → 4 → 8 → 4
      if (finalValue === initialCounter * 2) {
        logWithTimestamp(`${logPrefix} [DEBUG] [${thunkType}] Test PASSED: Got expected value: ${finalValue}`);
      } else {
        logWithTimestamp(
          `${logPrefix} [DEBUG] [${thunkType}] Test FAILED: Got unexpected value: ${finalValue}, expected ${initialCounter * 2}`,
        );
      }

      logWithTimestamp(`${logPrefix} [DEBUG] [${thunkType}] THUNK COMPLETED at ${new Date().toISOString()}`);
      return finalValue;
    } catch (error) {
      console.error(`${logPrefix} [DEBUG] [${thunkType}] Error executing thunk:`, error);
      throw error;
    }
  };
};

/**
 * Convenience function to create a slow thunk (uses COUNTER:SET:SLOW action)
 */
export const createDoubleCounterSlowThunk = <S extends BaseState = BaseState>(
  initialCounter: number,
  context: ThunkContext,
): Thunk<Partial<S>> => {
  return createDoubleCounterThunk(initialCounter, context, {
    useSlow: true,
    includeTimestamps: true,
  });
};

/**
 * Creates a thunk that multiplies by 3, adds 2, then subtracts 1
 * This thunk provides a distinctive operation pattern for testing bypass scenarios
 *
 * @param initialCounter The initial counter value
 * @param context The thunk execution context
 * @param options Configuration options for the thunk behavior
 * @returns A thunk function
 */
export const createDistinctiveCounterThunk = <S extends BaseState = BaseState>(
  initialCounter: number,
  context: ThunkContext,
  options: DoubleCounterOptions = {},
): Thunk<Partial<S>> => {
  const { useSlow = false, delayBetweenOperations = 100, includeTimestamps = false } = options;

  const logPrefix = getLogPrefix(context);
  const actionType = useSlow ? 'COUNTER:SET:SLOW' : 'COUNTER:SET';
  const thunkType = useSlow ? 'DISTINCTIVE-SLOW' : 'DISTINCTIVE';

  return async (getState, dispatch) => {
    const getCounter = async () => {
      const state = await getState();
      // Debug the entire state object
      debug('thunk', `${logPrefix} [DEBUG] [${thunkType}] Full state: ${JSON.stringify(state)}`);
      return state.counter ?? initialCounter; // Use nullish coalescing to handle undefined counter
    };

    const logWithTimestamp = (message: string) => {
      const timestamp = new Date().toISOString();
      if (includeTimestamps) {
        debug('thunk', `${message} (time: ${timestamp})`);
      } else {
        debug('thunk', message);
      }
    };

    try {
      // Log initial state
      const actualInitialState = await getState();
      const actualInitialCounter = await getCounter();
      logWithTimestamp(`${logPrefix} [DEBUG] [${thunkType}] STARTING THUNK at ${new Date().toISOString()}`);
      logWithTimestamp(
        `${logPrefix} [DEBUG] [${thunkType}] Initial counter param: ${initialCounter}, actual state counter: ${actualInitialCounter}`,
      );

      // First async operation - multiply by 3
      const firstValue = initialCounter * 3;
      logWithTimestamp(
        `${logPrefix} [DEBUG] [${thunkType}] First operation: Multiplying counter by 3 to ${firstValue} using ${actionType}`,
      );

      const timestamp1 = new Date().toISOString();
      logWithTimestamp(`${logPrefix} [DEBUG] [${thunkType}] Time before first action: ${timestamp1}`);

      const startTime1 = new Date().getTime();
      await dispatch(actionType, firstValue);
      const endTime1 = new Date().getTime();

      const duration1 = endTime1 - startTime1;
      logWithTimestamp(`${logPrefix} [DEBUG] [${thunkType}] First action completed in ${duration1}ms`);

      // Add delay to simulate async work
      await new Promise((resolve) => setTimeout(resolve, delayBetweenOperations));

      // Log intermediate state after first operation
      const intermediateValue = await getCounter();
      logWithTimestamp(
        `${logPrefix} [DEBUG] [${thunkType}] After first operation: counter value is ${intermediateValue}`,
      );

      // Check if another window modified our value
      if (intermediateValue !== firstValue) {
        logWithTimestamp(
          `${logPrefix} [DEBUG] [${thunkType}] STATE CHANGED! Intermediate value (${intermediateValue}) doesn't match expected value (${firstValue}).`,
        );
      }

      // Second async operation - add 2
      const expectedSecondValue = intermediateValue + 2;
      logWithTimestamp(
        `${logPrefix} [DEBUG] [${thunkType}] Second operation: Adding 2 to counter from ${intermediateValue} to get ${expectedSecondValue} using ${actionType}`,
      );

      const timestamp2 = new Date().toISOString();
      logWithTimestamp(`${logPrefix} [DEBUG] [${thunkType}] Time before second action: ${timestamp2}`);

      // Double-check state hasn't changed
      const preActionValue = await getCounter();
      if (preActionValue !== intermediateValue) {
        logWithTimestamp(
          `${logPrefix} [DEBUG] [${thunkType}] WARNING: State changed between getCounter() calls! Was ${intermediateValue}, now ${preActionValue}`,
        );
      }

      const startTime2 = new Date().getTime();
      await dispatch(actionType, expectedSecondValue);
      const endTime2 = new Date().getTime();

      const duration2 = endTime2 - startTime2;
      logWithTimestamp(`${logPrefix} [DEBUG] [${thunkType}] Second action completed in ${duration2}ms`);

      // Add delay to simulate async work
      await new Promise((resolve) => setTimeout(resolve, delayBetweenOperations));

      // Log intermediate state after second operation
      const intermediateValue2 = await getCounter();
      logWithTimestamp(
        `${logPrefix} [DEBUG] [${thunkType}] After second operation: counter value is ${intermediateValue2}`,
      );

      // Check if value matches what we expected
      if (intermediateValue2 !== expectedSecondValue) {
        logWithTimestamp(
          `${logPrefix} [DEBUG] [${thunkType}] STATE CHANGED! Second intermediate value (${intermediateValue2}) doesn't match expected value (${expectedSecondValue}).`,
        );
      }

      // Final operation - subtract 1
      const expectedFinalValue = intermediateValue2 - 1;
      logWithTimestamp(
        `${logPrefix} [DEBUG] [${thunkType}] Third operation: Subtracting 1 from counter from ${intermediateValue2} to get ${expectedFinalValue} using ${actionType}`,
      );

      const timestamp3 = new Date().toISOString();
      logWithTimestamp(`${logPrefix} [DEBUG] [${thunkType}] Time before third action: ${timestamp3}`);

      // Double-check state hasn't changed
      const preThirdActionValue = await getCounter();
      if (preThirdActionValue !== intermediateValue2) {
        logWithTimestamp(
          `${logPrefix} [DEBUG] [${thunkType}] WARNING: State changed between getCounter() calls! Was ${intermediateValue2}, now ${preThirdActionValue}`,
        );
      }

      const startTime3 = new Date().getTime();
      await dispatch(actionType, expectedFinalValue);
      const endTime3 = new Date().getTime();

      const duration3 = endTime3 - startTime3;
      logWithTimestamp(`${logPrefix} [DEBUG] [${thunkType}] Third action completed in ${duration3}ms`);

      // Add delay to simulate async work
      await new Promise((resolve) => setTimeout(resolve, delayBetweenOperations));

      // Log final state
      const finalValue = await getCounter();
      logWithTimestamp(`${logPrefix} [DEBUG] [${thunkType}] After final operation: counter value is ${finalValue}`);

      // For example, starting with 2: 2 → 6 → 8 → 7
      const expectedResult = initialCounter * 3 + 2 - 1;
      if (finalValue === expectedResult) {
        logWithTimestamp(`${logPrefix} [DEBUG] [${thunkType}] Test PASSED: Got expected value: ${finalValue}`);
      } else {
        logWithTimestamp(
          `${logPrefix} [DEBUG] [${thunkType}] Test FAILED: Got unexpected value: ${finalValue}, expected ${expectedResult}`,
        );
      }

      logWithTimestamp(`${logPrefix} [DEBUG] [${thunkType}] THUNK COMPLETED at ${new Date().toISOString()}`);
      return finalValue;
    } catch (error) {
      console.error(`${logPrefix} [DEBUG] [${thunkType}] Error executing thunk:`, error);
      throw error;
    }
  };
};

/**
 * Convenience function to create a slow distinctive thunk (uses COUNTER:SET:SLOW action)
 */
export const createDistinctiveCounterSlowThunk = <S extends BaseState = BaseState>(
  initialCounter: number,
  context: ThunkContext,
): Thunk<Partial<S>> => {
  return createDistinctiveCounterThunk(initialCounter, context, {
    useSlow: true,
    includeTimestamps: true,
  });
};
