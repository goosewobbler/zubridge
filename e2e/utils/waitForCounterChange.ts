import { getCounterValue } from './windowUtils';
import { TIMING } from '../constants';
import { browser } from 'wdio-electron-service';

/**
 * Waits for the counter value to change from its initial value.
 * @param {number} [timeout] - How long to wait for a change (ms)
 * @param {number} [interval] - How often to check (ms)
 * @returns {Promise<number>} - Resolves with the new value once it changes
 */
export async function waitForCounterChange(
  timeout = TIMING.THUNK_WAIT_TIME,
  interval = 100,
  initialValue?: number,
): Promise<number> {
  if (initialValue === undefined) {
    initialValue = await getCounterValue();
  }
  let newValue = initialValue;

  console.log(`Waiting for counter value to change from ${initialValue}`);

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

/**
 * Clicks a button and waits for the counter value to change from its initial value.
 * @param {WebdriverIO.Element} button - The button element to click
 * @param {number} [timeout] - How long to wait for a change (ms)
 * @param {number} [interval] - How often to check (ms)
 * @returns {Promise<number>} - Resolves with the new value once it changes
 */
export async function clickAndWaitForCounterChange(
  button: WebdriverIO.Element,
  timeout = TIMING.THUNK_WAIT_TIME,
  interval = 10,
): Promise<number> {
  const initialValue = await getCounterValue();
  await button.click();
  return await waitForCounterChange(timeout, interval, initialValue);
}
