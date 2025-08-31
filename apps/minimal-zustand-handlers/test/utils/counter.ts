import { browser } from 'wdio-electron-service';
import { TIMING } from './constants.js';

/**
 * Get the current counter value from the UI
 */
export const getCounterValue = async (): Promise<number> => {
  // Look for the h2 element that contains "Counter: {value}"
  const counterElement = await browser.$('h2');
  await counterElement.waitForExist({ timeout: 5000 });

  const text = await counterElement.getText();
  console.log(`Counter element text: "${text}"`);

  // Extract number from text like "Counter: 5"
  const match = text.match(/Counter:\s*(\d+)/);
  if (!match) {
    throw new Error(`Could not parse counter value from text: "${text}"`);
  }

  const value = Number.parseInt(match[1], 10);
  console.log(`Current counter value: ${value}`);
  return value;
};

/**
 * Wait for the counter to reach a specific value
 */
export const waitForCounterValue = async (
  expectedValue: number,
  timeoutMs = 10000,
): Promise<void> => {
  console.log(`Waiting for counter to reach value: ${expectedValue}`);

  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    try {
      const currentValue = await getCounterValue();
      if (currentValue === expectedValue) {
        console.log(`Counter reached expected value: ${expectedValue}`);
        return;
      }
      console.log(`Counter is ${currentValue}, waiting for ${expectedValue}...`);
    } catch (error) {
      console.log(`Error getting counter value: ${error}`);
    }

    await browser.pause(200);
  }

  throw new Error(`Timeout waiting for counter value ${expectedValue} after ${timeoutMs}ms`);
};

/**
 * Reset the counter to 0 by getting current value and decrementing
 */
export const resetCounter = async (): Promise<void> => {
  console.log('Resetting counter to 0...');

  let currentValue = await getCounterValue();

  while (currentValue > 0) {
    const decrementButton = await browser.$('button=-');
    await decrementButton.click();
    await browser.pause(TIMING.BUTTON_CLICK_PAUSE);
    currentValue = await getCounterValue();
  }

  while (currentValue < 0) {
    const incrementButton = await browser.$('button=+');
    await incrementButton.click();
    await browser.pause(TIMING.BUTTON_CLICK_PAUSE);
    currentValue = await getCounterValue();
  }

  console.log('Counter reset to 0');
};
