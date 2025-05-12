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
): Thunk<S> => {
  const { useSlow = false, delayBetweenOperations = 100, includeTimestamps = false } = options;

  const logPrefix = getLogPrefix(context);
  const actionType = useSlow ? 'COUNTER:SET:SLOW' : 'COUNTER:SET';

  return async (getState, dispatch) => {
    const getCounter = async () => {
      const state = await getState();
      return state.counter;
    };

    const logWithTimestamp = (message: string) => {
      if (includeTimestamps) {
        console.log(`${message} (time: ${new Date().toISOString()})`);
      } else {
        console.log(message);
      }
    };

    try {
      // Log initial state
      logWithTimestamp(`${logPrefix} Starting with counter value: ${initialCounter}`);

      // First async operation - double the value
      logWithTimestamp(`${logPrefix} First operation: Doubling counter to ${initialCounter * 2} using ${actionType}`);

      if (includeTimestamps) {
        logWithTimestamp(`${logPrefix} Time before first action: ${new Date().toISOString()}`);
      }

      const startTime1 = new Date().getTime();
      await dispatch(actionType, initialCounter * 2);
      const endTime1 = new Date().getTime();

      if (includeTimestamps || useSlow) {
        const duration1 = endTime1 - startTime1;
        logWithTimestamp(`${logPrefix} First action completed in ${duration1}ms`);
      }

      // Add delay to simulate async work
      await new Promise((resolve) => setTimeout(resolve, delayBetweenOperations));

      // Log intermediate state after first operation
      const intermediateValue = await getCounter();
      logWithTimestamp(`${logPrefix} After first operation: counter value is ${intermediateValue}`);

      // Check if another window modified our value
      if (intermediateValue !== initialCounter * 2) {
        logWithTimestamp(
          `${logPrefix} Warning: Intermediate value (${intermediateValue}) doesn't match expected value (${initialCounter * 2}). Another window may have modified the counter.`,
        );
      }

      // Second async operation - double the intermediateValue
      const expectedSecondValue = intermediateValue * 2;
      logWithTimestamp(`${logPrefix} Second operation: Doubling counter to ${expectedSecondValue} using ${actionType}`);

      if (includeTimestamps) {
        logWithTimestamp(`${logPrefix} Time before second action: ${new Date().toISOString()}`);
      }

      const startTime2 = new Date().getTime();
      await dispatch(actionType, expectedSecondValue);
      const endTime2 = new Date().getTime();

      if (includeTimestamps || useSlow) {
        const duration2 = endTime2 - startTime2;
        logWithTimestamp(`${logPrefix} Second action completed in ${duration2}ms`);
      }

      // Add delay to simulate async work
      await new Promise((resolve) => setTimeout(resolve, delayBetweenOperations));

      // Log intermediate state after second operation
      const intermediateValue2 = await getCounter();
      logWithTimestamp(`${logPrefix} After second operation: counter value is ${intermediateValue2}`);

      // Final operation - halve the counter value
      const expectedFinalValue = intermediateValue2 / 2;
      logWithTimestamp(`${logPrefix} Third operation: Halving counter to ${expectedFinalValue} using ${actionType}`);

      if (includeTimestamps) {
        logWithTimestamp(`${logPrefix} Time before third action: ${new Date().toISOString()}`);
      }

      const startTime3 = new Date().getTime();
      await dispatch(actionType, expectedFinalValue);
      const endTime3 = new Date().getTime();

      if (includeTimestamps || useSlow) {
        const duration3 = endTime3 - startTime3;
        logWithTimestamp(`${logPrefix} Third action completed in ${duration3}ms`);
      }

      // Add delay to simulate async work
      await new Promise((resolve) => setTimeout(resolve, delayBetweenOperations));

      // Log final state
      const finalValue = await getCounter();
      logWithTimestamp(`${logPrefix} After final operation: counter value is ${finalValue}`);

      // Verify result - the expected value after double → double → halve is initialCounter * 2
      // For example: 2 → 4 → 8 → 4
      if (finalValue === initialCounter * 2) {
        logWithTimestamp(`${logPrefix} Test PASSED: Got expected value: ${finalValue}`);
      } else {
        logWithTimestamp(
          `${logPrefix} Test FAILED: Got unexpected value: ${finalValue}, expected ${initialCounter * 2}`,
        );
      }

      return finalValue;
    } catch (error) {
      console.error(`${logPrefix} Error executing thunk:`, error);
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
): Thunk<S> => {
  return createDoubleCounterThunk(initialCounter, context, {
    useSlow: true,
    includeTimestamps: true,
  });
};
