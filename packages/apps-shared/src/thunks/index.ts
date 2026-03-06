import { debug } from '@zubridge/core';
import type { Thunk } from '@zubridge/types';
import type { BaseState, ThunkContext } from '../types.js';

/**
 * Helper function to generate contextual logging prefix
 */
const getLogPrefix = (context: ThunkContext) => {
  const { environment, logPrefix } = context;
  const prefix =
    logPrefix ||
    (environment === 'main' ? 'MAIN_PROCESS' : environment === 'renderer' ? 'RENDERER' : 'TAURI');
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

  /**
   * If true, getState will be called with bypassAccessControl: true
   */
  bypassAccessControlOverride?: boolean;

  /**
   * Whether the handlers in the state manager are async
   * Set to false for redux and reducers modes
   * Default: true
   */
  asyncHandlers?: boolean;
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
  const {
    useSlow = false,
    delayBetweenOperations = 100,
    includeTimestamps = false,
    bypassAccessControlOverride = false,
    asyncHandlers = true,
  } = options;

  const logPrefix = getLogPrefix(context);
  const thunkType = useSlow ? 'SLOW' : 'REGULAR';

  return async (getState, dispatch) => {
    const getCounter = async () => {
      const now = new Date().toISOString();
      debug('thunk', `${logPrefix} [DEBUG] [${thunkType}] [${now}] Calling getState()`);

      const beforeStateTime = Date.now();
      const state = bypassAccessControlOverride
        ? await getState({ bypassAccessControl: true })
        : await getState();
      const afterStateTime = Date.now();
      const stateLatency = afterStateTime - beforeStateTime;

      debug(
        'thunk',
        `${logPrefix} [DEBUG] [${thunkType}] [${now}] Got state in ${stateLatency}ms: ${JSON.stringify(state)}`,
      );
      debug(
        'thunk',
        `${logPrefix} [DEBUG] [${thunkType}] [${now}] Counter value in state: ${state.counter}`,
      );

      if (state.counter === undefined || state.counter === null) {
        throw new Error('Counter is undefined');
      }

      return state.counter;
    };

    const logWithTimestamp = (message: string) => {
      const timestamp = new Date().toISOString();
      if (includeTimestamps) {
        debug('thunk', `${message} (time: ${timestamp})`);
      } else {
        debug('thunk', `${message}`);
      }
    };

    // Helper function to dispatch and handle non-async handlers
    const dispatchWithDelay = async (actionType: string, payload?: unknown) => {
      const startTime = Date.now();
      debug('thunk', `${logPrefix} [DEBUG] [${thunkType}] Dispatching action ${actionType}`);

      await dispatch(actionType, payload);

      // If using slow actions with non-async handlers, add a delay to simulate async behavior
      if (useSlow && !asyncHandlers && actionType.includes('SLOW')) {
        const delayTime = process.platform === 'linux' ? 5000 : 2500;
        logWithTimestamp(
          `${logPrefix} [DEBUG] [${thunkType}] Adding ${delayTime}ms delay after ${actionType} for non-async handler`,
        );
        await new Promise((resolve) => setTimeout(resolve, delayTime));
      }

      const endTime = Date.now();
      return endTime - startTime;
    };

    try {
      // Log initial state
      const actualInitialCounter = await getCounter();
      logWithTimestamp(
        `${logPrefix} [DEBUG] [${thunkType}] STARTING THUNK at ${new Date().toISOString()}`,
      );
      logWithTimestamp(
        `${logPrefix} [DEBUG] [${thunkType}] Initial counter param: ${initialCounter}, actual state counter: ${actualInitialCounter}`,
      );

      // First async operation - double the current value
      let currentValue = await getCounter();
      const doubleActionType = useSlow ? 'COUNTER:DOUBLE:SLOW' : 'COUNTER:DOUBLE';
      debug(
        'thunk',
        `${logPrefix} [DEBUG] [${thunkType}] [${new Date().toISOString()}] First operation validation - Current counter: ${currentValue}, Target: ${
          currentValue * 2
        }`,
      );
      logWithTimestamp(
        `${logPrefix} [DEBUG] [${thunkType}] First operation: Doubling counter from ${currentValue} using ${doubleActionType}`,
      );

      const timestamp1 = new Date().toISOString();
      logWithTimestamp(
        `${logPrefix} [DEBUG] [${thunkType}] Time before first action: ${timestamp1}`,
      );

      const duration1 = await dispatchWithDelay(doubleActionType);
      logWithTimestamp(
        `${logPrefix} [DEBUG] [${thunkType}] First action completed in ${duration1}ms`,
      );

      // Add delay to simulate async work
      await new Promise((resolve) => setTimeout(resolve, delayBetweenOperations));

      // Log intermediate state after first operation
      const intermediateValue = await getCounter();
      logWithTimestamp(
        `${logPrefix} [DEBUG] [${thunkType}] After first operation: counter value is ${intermediateValue}`,
      );

      // Check if another window modified our value
      if (intermediateValue !== currentValue * 2) {
        logWithTimestamp(
          `${logPrefix} [DEBUG] [${thunkType}] STATE CHANGED! Intermediate value (${intermediateValue}) doesn't match expected value (${
            currentValue * 2
          }).`,
        );
      }

      // Second async operation - double the latest value
      currentValue = await getCounter();
      debug(
        'thunk',
        `${logPrefix} [DEBUG] [${thunkType}] [${new Date().toISOString()}] Second operation validation - Current counter: ${currentValue}, Target: ${
          currentValue * 2
        }`,
      );
      logWithTimestamp(
        `${logPrefix} [DEBUG] [${thunkType}] Second operation: Doubling counter from ${currentValue} using ${doubleActionType}`,
      );

      const timestamp2 = new Date().toISOString();
      logWithTimestamp(
        `${logPrefix} [DEBUG] [${thunkType}] Time before second action: ${timestamp2}`,
      );

      const duration2 = await dispatchWithDelay(doubleActionType);
      logWithTimestamp(
        `${logPrefix} [DEBUG] [${thunkType}] Second action completed in ${duration2}ms`,
      );

      // Add delay to simulate async work
      await new Promise((resolve) => setTimeout(resolve, delayBetweenOperations));

      // Log intermediate state after second operation
      const intermediateValue2 = await getCounter();
      logWithTimestamp(
        `${logPrefix} [DEBUG] [${thunkType}] After second operation: counter value is ${intermediateValue2}`,
      );

      // Check if value matches what we expected
      if (intermediateValue2 !== currentValue * 2) {
        logWithTimestamp(
          `${logPrefix} [DEBUG] [${thunkType}] STATE CHANGED! Second intermediate value (${intermediateValue2}) doesn't match expected value (${
            currentValue * 2
          }).`,
        );
      }

      // Final operation - halve the latest value
      currentValue = await getCounter();
      const halveActionType = useSlow ? 'COUNTER:HALVE:SLOW' : 'COUNTER:HALVE';
      debug(
        'thunk',
        `${logPrefix} [DEBUG] [${thunkType}] [${new Date().toISOString()}] Final operation validation - Current counter: ${currentValue}, Target: ${Math.round(
          currentValue / 2,
        )}`,
      );
      logWithTimestamp(
        `${logPrefix} [DEBUG] [${thunkType}] Third operation: Halving counter from ${currentValue} using ${halveActionType}`,
      );

      const timestamp3 = new Date().toISOString();
      logWithTimestamp(
        `${logPrefix} [DEBUG] [${thunkType}] Time before third action: ${timestamp3}`,
      );

      const duration3 = await dispatchWithDelay(halveActionType);
      logWithTimestamp(
        `${logPrefix} [DEBUG] [${thunkType}] Third action completed in ${duration3}ms`,
      );

      // Add delay to simulate async work
      await new Promise((resolve) => setTimeout(resolve, delayBetweenOperations));

      // Log final state
      const finalValue = await getCounter();
      logWithTimestamp(
        `${logPrefix} [DEBUG] [${thunkType}] After final operation: counter value is ${finalValue}`,
      );

      // Verify result - the expected value after double → double → halve is currentValue (should be robust to bypass)
      logWithTimestamp(
        `${logPrefix} [DEBUG] [${thunkType}] THUNK COMPLETED at ${new Date().toISOString()}`,
      );
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
 * Convenience function to create a slow thunk for redux and reducers modes
 */
export const createDoubleCounterSlowThunkForSyncHandlers = <S extends BaseState = BaseState>(
  initialCounter: number,
  context: ThunkContext,
): Thunk<Partial<S>> => {
  return createDoubleCounterThunk(initialCounter, context, {
    useSlow: true,
    includeTimestamps: true,
    asyncHandlers: false,
  });
};

/**
 * Convenience function to create a double counter thunk with getState override (setting bypassAccessControl: true)
 */
export const createDoubleCounterWithGetStateOverrideThunk = <S extends BaseState = BaseState>(
  initialCounter: number,
  context: ThunkContext,
): Thunk<Partial<S>> => {
  return createDoubleCounterThunk(initialCounter, context, {
    bypassAccessControlOverride: true,
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
  const {
    useSlow = false,
    delayBetweenOperations = 100,
    includeTimestamps = false,
    asyncHandlers = true,
  } = options;

  const logPrefix = getLogPrefix(context);
  const actionType = useSlow ? 'COUNTER:SET:SLOW' : 'COUNTER:SET';
  const thunkType = useSlow ? 'DISTINCTIVE-SLOW' : 'DISTINCTIVE';

  return async (getState, dispatch) => {
    const getCounter = async () => {
      const now = new Date().toISOString();
      debug('thunk', `${logPrefix} [DEBUG] [${thunkType}] [${now}] Calling getState()`);

      const beforeStateTime = Date.now();
      const state = await getState();
      const afterStateTime = Date.now();
      const stateLatency = afterStateTime - beforeStateTime;

      debug(
        'thunk',
        `${logPrefix} [DEBUG] [${thunkType}] [${now}] Got state in ${stateLatency}ms: ${JSON.stringify(state)}`,
      );
      debug(
        'thunk',
        `${logPrefix} [DEBUG] [${thunkType}] [${now}] Counter value in state: ${state.counter}`,
      );

      return state.counter ?? initialCounter; // Use nullish coalescing to handle undefined counter
    };

    const logWithTimestamp = (message: string) => {
      const timestamp = new Date().toISOString();
      if (includeTimestamps) {
        debug('thunk', `${message} (time: ${timestamp})`);
      } else {
        debug('thunk', `${message}`);
      }
    };

    // Helper function to dispatch and handle non-async handlers
    const dispatchWithDelay = async (action: string, value: number) => {
      const startTime = Date.now();
      debug(
        'thunk',
        `${logPrefix} [DEBUG] [${thunkType}] Dispatching action ${action} with value ${value}`,
      );

      await dispatch(action, value);

      // If using slow actions with non-async handlers, add a delay to simulate async behavior
      if (useSlow && !asyncHandlers) {
        const delayTime = process.platform === 'linux' ? 5000 : 2500;
        logWithTimestamp(
          `${logPrefix} [DEBUG] [${thunkType}] Adding ${delayTime}ms delay after ${action} for non-async handler`,
        );
        await new Promise((resolve) => setTimeout(resolve, delayTime));
      }

      const endTime = Date.now();
      return endTime - startTime;
    };

    try {
      // Log initial state
      const _actualInitialState = await getState();
      const actualInitialCounter = await getCounter();
      logWithTimestamp(
        `${logPrefix} [DEBUG] [${thunkType}] STARTING THUNK at ${new Date().toISOString()}`,
      );
      logWithTimestamp(
        `${logPrefix} [DEBUG] [${thunkType}] Initial counter param: ${initialCounter}, actual state counter: ${actualInitialCounter}`,
      );

      // First async operation - multiply by 3
      const firstValue = initialCounter * 3;
      debug(
        'thunk',
        `${logPrefix} [DEBUG] [${thunkType}] [${new Date().toISOString()}] First operation validation - Initial counter: ${initialCounter}, Target: ${firstValue}`,
      );
      logWithTimestamp(
        `${logPrefix} [DEBUG] [${thunkType}] First operation: Multiplying counter by 3 to ${firstValue} using ${actionType}`,
      );

      const timestamp1 = new Date().toISOString();
      logWithTimestamp(
        `${logPrefix} [DEBUG] [${thunkType}] Time before first action: ${timestamp1}`,
      );

      const duration1 = await dispatchWithDelay(actionType, firstValue);
      logWithTimestamp(
        `${logPrefix} [DEBUG] [${thunkType}] First action completed in ${duration1}ms`,
      );

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
      debug(
        'thunk',
        `${logPrefix} [DEBUG] [${thunkType}] [${new Date().toISOString()}] Second operation validation - Current counter: ${intermediateValue}, Target: ${expectedSecondValue}`,
      );
      logWithTimestamp(
        `${logPrefix} [DEBUG] [${thunkType}] Second operation: Adding 2 to counter from ${intermediateValue} to get ${expectedSecondValue} using ${actionType}`,
      );

      const timestamp2 = new Date().toISOString();
      logWithTimestamp(
        `${logPrefix} [DEBUG] [${thunkType}] Time before second action: ${timestamp2}`,
      );

      // Double-check state hasn't changed
      const preActionValue = await getCounter();
      if (preActionValue !== intermediateValue) {
        logWithTimestamp(
          `${logPrefix} [DEBUG] [${thunkType}] WARNING: State changed between getCounter() calls! Was ${intermediateValue}, now ${preActionValue}`,
        );
      }

      const duration2 = await dispatchWithDelay(actionType, expectedSecondValue);
      logWithTimestamp(
        `${logPrefix} [DEBUG] [${thunkType}] Second action completed in ${duration2}ms`,
      );

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
      debug(
        'thunk',
        `${logPrefix} [DEBUG] [${thunkType}] [${new Date().toISOString()}] Final operation validation - Current counter: ${intermediateValue2}, Target: ${expectedFinalValue}`,
      );
      logWithTimestamp(
        `${logPrefix} [DEBUG] [${thunkType}] Third operation: Subtracting 1 from counter from ${intermediateValue2} to get ${expectedFinalValue} using ${actionType}`,
      );

      const timestamp3 = new Date().toISOString();
      logWithTimestamp(
        `${logPrefix} [DEBUG] [${thunkType}] Time before third action: ${timestamp3}`,
      );

      // Double-check state hasn't changed
      const preThirdActionValue = await getCounter();
      if (preThirdActionValue !== intermediateValue2) {
        logWithTimestamp(
          `${logPrefix} [DEBUG] [${thunkType}] WARNING: State changed between getCounter() calls! Was ${intermediateValue2}, now ${preThirdActionValue}`,
        );
      }

      const duration3 = await dispatchWithDelay(actionType, expectedFinalValue);
      logWithTimestamp(
        `${logPrefix} [DEBUG] [${thunkType}] Third action completed in ${duration3}ms`,
      );

      // Add delay to simulate async work
      await new Promise((resolve) => setTimeout(resolve, delayBetweenOperations));

      // Log final state
      const finalValue = await getCounter();
      logWithTimestamp(
        `${logPrefix} [DEBUG] [${thunkType}] After final operation: counter value is ${finalValue}`,
      );

      // For example, starting with 2: 2 → 6 → 8 → 7
      const expectedResult = initialCounter * 3 + 2 - 1;
      if (finalValue === expectedResult) {
        logWithTimestamp(
          `${logPrefix} [DEBUG] [${thunkType}] Test PASSED: Got expected value: ${finalValue}`,
        );
      } else {
        logWithTimestamp(
          `${logPrefix} [DEBUG] [${thunkType}] Test FAILED: Got unexpected value: ${finalValue}, expected ${expectedResult}`,
        );
      }

      logWithTimestamp(
        `${logPrefix} [DEBUG] [${thunkType}] THUNK COMPLETED at ${new Date().toISOString()}`,
      );
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

/**
 * Convenience function to create a slow distinctive thunk for redux and reducers modes
 */
export const createDistinctiveCounterSlowThunkForSyncHandlers = <S extends BaseState = BaseState>(
  initialCounter: number,
  context: ThunkContext,
): Thunk<Partial<S>> => {
  return createDistinctiveCounterThunk(initialCounter, context, {
    useSlow: true,
    includeTimestamps: true,
    asyncHandlers: false,
  });
};
