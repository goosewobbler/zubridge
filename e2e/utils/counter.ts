import { getButtonInCurrentWindow } from './window.js';
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

export async function waitForIncrement(
  originalValue?: number,
  timeout = TIMING.THUNK_WAIT_TIME,
  interval = 50,
): Promise<boolean> {
  let previousValue = originalValue || (await getCounterValue());
  return await browser.waitUntil(
    async () => {
      const currentValue = await getCounterValue();
      const incrementedValue = previousValue + 1;
      previousValue = currentValue;
      console.log(`Counter value is now ${currentValue}, waiting for ${incrementedValue}`);
      return currentValue === incrementedValue;
    },
    {
      timeout,
      timeoutMsg: `Counter value did not increment from ${previousValue} after ${timeout}ms`,
      interval,
    },
  );
}

export const getCounterValue = async () => {
  try {
    // First try to get the counter from the UI
    const counterElement = await browser.$('h2');
    const isExisting = await counterElement.isExisting();

    if (isExisting) {
      const counterText = await counterElement.getText();
      if (counterText.includes('Counter:')) {
        return parseFloat(counterText.replace('Counter: ', ''));
      }
    }

    // If we can't get it from the UI (e.g., not subscribed), get it directly from the state
    console.log('Counter not visible in UI, getting from state directly');
    const state = await browser.execute(() => {
      // @ts-ignore - zubridge is available in the browser context
      return window.zubridge?.getState ? window.zubridge.getState() : null;
    });

    if (state && typeof state.counter === 'number') {
      return state.counter;
    }

    return 0;
  } catch (error) {
    console.error('Error getting counter value:', error);
    return 0;
  }
};

export const incrementCounterAndVerify = async (targetValue: number): Promise<number> => {
  let currentValue = await getCounterValue();
  const incrementButton = await getButtonInCurrentWindow('increment');
  while (currentValue < targetValue) {
    await incrementButton.click();
    await browser.pause(50);
    const newValue = await getCounterValue();
    if (newValue === currentValue) {
      await incrementButton.click();
      await browser.pause(100);
    }
    currentValue = await getCounterValue();
  }
  return currentValue;
};

export const resetCounter = async () => {
  const counterElement = await browser.$('h2');
  const counterText = await counterElement.getText();
  const currentCount = parseInt(counterText.replace('Counter: ', ''));
  if (currentCount > 0) {
    const decrementButton = await browser.$('button=-');
    for (let i = 0; i < currentCount; i++) {
      await decrementButton.click();
      await browser.pause(50);
    }
  }
  const newCounterElement = await browser.$('h2');
  const newCounterText = await newCounterElement.getText();
  return parseInt(newCounterText.replace('Counter: ', ''));
};
