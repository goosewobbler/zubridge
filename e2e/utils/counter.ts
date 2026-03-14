import { browser } from 'wdio-electron-service';
import { TIMING } from '../constants.js';
import { getButtonInCurrentWindow } from './window.js';

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

  let previousValue: number | undefined;
  let connectionErrors = 0;
  const maxConnectionErrors = process.platform === 'linux' ? 2 : 1; // Reduced threshold

  try {
    return await browser.waitUntil(
      async () => {
        try {
          const currentValue = await getCounterValue();

          // Reset connection error count on successful read
          connectionErrors = 0;

          // Only log if the counter has changed
          if (typeof previousValue === 'number' && currentValue !== previousValue) {
            console.log(
              `Counter changed from ${previousValue} to ${currentValue}, waiting for ${expectedValue}`,
            );
          }
          previousValue = currentValue;
          return currentValue === expectedValue;
        } catch (error) {
          // Linux-specific: Handle connection errors during long waits
          if (
            process.platform === 'linux' &&
            ((error as Error).message?.includes('UND_ERR_CLOSED') ||
              (error as Error).message?.includes('invalid session id'))
          ) {
            connectionErrors++;
            console.log(
              `Connection error ${connectionErrors}/${maxConnectionErrors} while waiting for value ${expectedValue}`,
            );

            if (connectionErrors >= maxConnectionErrors) {
              console.log('Max connection errors reached - ending wait with failure');
              return false;
            }

            // Wait before retrying
            await browser.pause(1000);
            return false;
          }

          // Re-throw other errors
          throw error;
        }
      },
      {
        timeout,
        timeoutMsg: `Counter value did not reach expected value ${expectedValue} after ${timeout}ms`,
        interval,
      },
    );
  } catch (error) {
    console.error(`waitForSpecificValue failed for value ${expectedValue}:`, error);
    return false;
  }
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
      if (currentValue !== previousValue) {
        console.log(
          `Counter changed from ${previousValue} to ${currentValue}, waiting for ${incrementedValue}`,
        );
      }
      previousValue = currentValue;
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
  const maxRetries = process.platform === 'linux' ? 2 : 1;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      // First try to get the counter from the UI
      const counterElement = await browser.$('h2');
      const isExisting = await counterElement.isExisting();

      if (isExisting) {
        const counterText = await counterElement.getText();
        // Fix: Add null/undefined check and ensure counterText is a string
        if (counterText && typeof counterText === 'string' && counterText.includes('Counter:')) {
          return Number.parseFloat(counterText.replace('Counter: ', ''));
        }
      }

      // If we can't get it from the UI (e.g., not subscribed), get it directly from the state
      console.log('Counter not visible in UI, getting from state directly');
      const state = await browser.execute(() => {
        // @ts-expect-error - zubridge is available in the browser context
        return window.zubridge?.getState ? window.zubridge.getState() : null;
      });

      if (state && typeof state.counter === 'number') {
        return state.counter;
      }

      return 0;
    } catch (error) {
      console.error('Error getting counter value:', error);

      // For Linux, try one more time on connection issues
      if (
        process.platform === 'linux' &&
        attempt < maxRetries - 1 &&
        ((error as Error).message?.includes('UND_ERR_CLOSED') ||
          (error as Error).message?.includes('invalid session id'))
      ) {
        console.log(`Linux connection issue on attempt ${attempt + 1}, retrying...`);
        await browser.pause(500);
        continue;
      }

      return 0;
    }
  }

  return 0;
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
  const currentCount = Number.parseInt(counterText.replace('Counter: ', ''), 10);
  if (currentCount > 0) {
    const decrementButton = await browser.$('button=-');
    for (let i = 0; i < currentCount; i++) {
      await decrementButton.click();
      await browser.pause(50);
    }
  }
  const newCounterElement = await browser.$('h2');
  const newCounterText = await newCounterElement.getText();
  return Number.parseInt(newCounterText.replace('Counter: ', ''), 10);
};
