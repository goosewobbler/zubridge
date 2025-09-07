import { browser } from 'wdio-electron-service';
import { TIMING } from './constants.js';

// Global variable to track window handles
let windowHandles: string[] = [];

/**
 * Refresh the list of available window handles
 */
export const refreshWindowHandles = async (): Promise<void> => {
  windowHandles = await browser.getWindowHandles();
  console.log(`Current window handles: ${windowHandles.length}`);
};

/**
 * Wait until a specific number of windows are available
 */
export const waitUntilWindowsAvailable = async (expectedCount: number): Promise<void> => {
  console.log(`Waiting for ${expectedCount} windows to be available...`);

  let attempts = 0;
  const maxAttempts = 30; // 30 seconds max wait

  while (attempts < maxAttempts) {
    await refreshWindowHandles();

    if (windowHandles.length >= expectedCount) {
      console.log(`Found ${windowHandles.length} windows (expected ${expectedCount})`);
      return;
    }

    await browser.pause(1000);
    attempts++;
  }

  throw new Error(
    `Timeout waiting for ${expectedCount} windows. Only found ${windowHandles.length}`,
  );
};

/**
 * Switch to a specific window by index
 */
export const switchToWindow = async (index: number): Promise<boolean> => {
  await refreshWindowHandles();

  if (index >= windowHandles.length) {
    console.warn(
      `Cannot switch to window ${index}, only ${windowHandles.length} windows available`,
    );
    return false;
  }

  console.log(`Switching to window ${index}`);
  await browser.switchToWindow(windowHandles[index]);
  await browser.pause(TIMING.WINDOW_CHANGE_PAUSE);

  return true;
};

/**
 * Setup test environment - ensure we have the expected number of windows and focus on main
 */
export const setupTestEnvironment = async (expectedWindowCount: number): Promise<void> => {
  console.log(`Setting up test environment for ${expectedWindowCount} windows...`);

  // Wait for expected windows
  await waitUntilWindowsAvailable(expectedWindowCount);

  // Switch to main window (index 0)
  await switchToWindow(0);

  console.log('Test environment setup complete');
};

/**
 * Get a button by its text content in the current window
 * Simplified for minimal apps which have fewer button types
 */
export const getButtonInCurrentWindow = async (
  buttonType: 'increment' | 'decrement' | 'theme-toggle',
): Promise<WebdriverIO.Element> => {
  let selector = '';

  switch (buttonType) {
    case 'increment':
      selector = 'button=+';
      break;
    case 'decrement':
      selector = 'button=-';
      break;
    case 'theme-toggle':
      // Look for button containing "Switch Theme" or similar text
      selector = 'button*=Switch';
      break;
    default:
      throw new Error(`Unknown button type: ${buttonType}`);
  }

  console.log(`Looking for button with selector: ${selector}`);
  const button = await browser.$(selector);
  await button.waitForExist({ timeout: 10000 });

  return button;
};

/**
 * Get window count for debugging
 */
export const getWindowCount = async (): Promise<number> => {
  await refreshWindowHandles();
  return windowHandles.length;
};
