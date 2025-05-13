import { getCounterValue } from './windowUtils';
import { TIMING } from '../constants';
import { browser } from 'wdio-electron-service';

/**
 * Waits for the counter value to change from its initial value.
 * @param {number} [initialValue] - The initial value of the counter
 * @param {number} [timeout] - How long to wait for a change (ms)
 * @param {number} [interval] - How often to check (ms)
 * @returns {Promise<number>} - Resolves with the new value once it changes
 */
export async function waitForCounterChange(
  initialValue?: number,
  timeout = TIMING.THUNK_WAIT_TIME,
  interval = 100,
): Promise<number> {
  if (initialValue === undefined) {
    initialValue = await getCounterValue();
  }
  let newValue = initialValue;

  console.log(
    `Waiting for counter value to change from ${initialValue} with timeout ${timeout} and interval ${interval}`,
  );

  await browser.waitUntil(
    async () => {
      newValue = await getCounterValue();
      console.log(`Counter value is now ${newValue}`);
      return newValue !== initialValue;
    },
    {
      timeout,
      timeoutMsg: `Counter value did not change from ${initialValue} after ${timeout}ms`,
      interval,
    },
  );
  return newValue;
}
