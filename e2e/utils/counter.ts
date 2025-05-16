import { getCounterValue } from './window.js';
import { TIMING } from '../constants.js';
import { browser } from 'wdio-electron-service';

/**
 * Waits for the counter to reach a specific expected value.
 * This is more reliable than waiting for changes when there might be multiple rapid changes.
 *
 * @param {number} expectedValue - The value to wait for
 * @param {number} [timeout] - How long to wait (ms)
 * @param {number} [interval] - How often to check (ms)
 * @returns {Promise<boolean>} - Resolves with true when the value is reached
 */
export async function waitForSpecificValue(
  expectedValue: number,
  timeout = TIMING.THUNK_WAIT_TIME,
  interval = 50,
): Promise<boolean> {
  console.log(
    `Waiting for counter to reach specific value ${expectedValue} with timeout ${timeout} and interval ${interval}`,
  );

  return await browser.waitUntil(
    async () => {
      const currentValue = await getCounterValue();
      console.log(`Counter value is now ${currentValue}, waiting for ${expectedValue}`);
      return currentValue === expectedValue;
    },
    {
      timeout,
      timeoutMsg: `Counter value did not reach expected value ${expectedValue} after ${timeout}ms`,
      interval,
    },
  );
}
