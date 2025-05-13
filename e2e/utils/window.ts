// Utility functions for E2E window and counter management
import { browser } from 'wdio-electron-service';
import { TIMING } from '../constants';

// Store windows by index rather than by title since all windows have the same title
export const windowHandles: string[] = [];

/**
 * Refresh the list of window handles
 * @returns The number of window handles found
 */
export const refreshWindowHandles = async () => {
  try {
    const handles = await browser.getWindowHandles();
    windowHandles.length = 0;

    for (const handle of handles) {
      try {
        await browser.switchToWindow(handle);
        await browser.pause(50);
        windowHandles.push(handle);
      } catch (error) {
        // Skip window handle - might be closing
      }
    }
    return handles.length;
  } catch (error) {
    console.error(`Error refreshing window handles: ${error}`);
    return windowHandles.length;
  }
};

/**
 * Waits until the desired number of windows are available
 * @param {number} desiredWindows - Number of windows to wait for
 */
export const waitUntilWindowsAvailable = async (desiredWindows: number) => {
  let lastCount = 0;

  try {
    await browser.waitUntil(
      async () => {
        try {
          const windowCount = await refreshWindowHandles();
          if (windowCount !== lastCount) {
            lastCount = windowCount;
          }
          return windowCount === desiredWindows;
        } catch (error) {
          return desiredWindows === 0;
        }
      },
      {
        timeout: TIMING.WINDOW_WAIT_TIMEOUT,
        timeoutMsg: `Expected ${desiredWindows} windows, found ${lastCount}`,
        interval: TIMING.WINDOW_WAIT_INTERVAL,
      },
    );
    return true;
  } catch (error) {
    console.error(`Failed waiting for ${desiredWindows} windows: ${error}`);
    throw error;
  }
};

export const switchToWindow = async (index: number) => {
  try {
    await refreshWindowHandles();
    if (index >= 0 && index < windowHandles.length) {
      const handle = windowHandles[index];
      try {
        await browser.switchToWindow(handle);
        await browser.pause(100);
        return true;
      } catch (error) {
        return false;
      }
    } else {
      return false;
    }
  } catch (error) {
    return false;
  }
};

export const getButtonInCurrentWindow = async (buttonType: 'increment' | 'decrement' | 'create' | 'close') => {
  switch (buttonType) {
    case 'increment':
      return await browser.$('button=+');
    case 'decrement':
      return await browser.$('button=-');
    case 'create':
      return await browser.$('button=Create Window');
    case 'close':
      return await browser.$('button=Close Window');
    default:
      throw new Error(`Unknown button type: ${buttonType}`);
  }
};

export const getCounterValue = async () => {
  const counterElement = await browser.$('h2');
  const counterText = await counterElement.getText();
  return parseInt(counterText.replace('Counter: ', ''));
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

/**
 * Sets up the test environment for each test
 * Makes sure we have exactly coreWindowCount windows and focuses on the main window
 *
 * @param {number} coreWindowCount - Number of core windows required (typically 2)
 * @param {TimingConfig} timing - Timing configuration for waits
 */
export const setupTestEnvironment = async (coreWindowCount: number): Promise<void> => {
  await refreshWindowHandles();

  // Check if we need to handle extra or missing windows
  if (windowHandles.length < coreWindowCount) {
    // Try to create additional windows if needed
    await createMissingCoreWindows(coreWindowCount);
  } else if (windowHandles.length > coreWindowCount) {
    // Close excess windows
    await closeExcessWindows(coreWindowCount);
  }

  // Final verification
  await refreshWindowHandles();
  if (windowHandles.length !== coreWindowCount) {
    console.warn(`Warning: Expected ${coreWindowCount} windows, but found ${windowHandles.length}`);
  }

  // Switch to main window
  if (windowHandles.length > 0) {
    await switchToWindow(0);
  }
};

/**
 * Creates any missing core windows
 */
async function createMissingCoreWindows(targetCount: number): Promise<void> {
  // We're missing windows - try to create them
  const windowsToCreate = targetCount - windowHandles.length;

  if (windowsToCreate <= 0) return;

  try {
    // First switch to an existing window
    if (windowHandles.length > 0) {
      await switchToWindow(0);
    }

    // Try to create missing windows using the Electron API
    // This is the most reliable way to create new windows
    await browser.electron.execute((electron, count) => {
      for (let i = 0; i < count; i++) {
        const win = new electron.BrowserWindow({
          width: 800,
          height: 600,
          webPreferences: { nodeIntegration: true, contextIsolation: false },
        });
        win.loadURL('about:blank');
      }
      return `Created ${count} windows`;
    }, windowsToCreate);

    // Wait for windows to be created
    await browser.pause(500);
  } catch (error) {
    console.error(`Error creating windows: ${error}`);
  }
}

/**
 * Closes excess windows beyond the core count
 */
async function closeExcessWindows(coreCount: number): Promise<void> {
  // We have too many windows - close the excess ones
  if (windowHandles.length <= coreCount) return;

  try {
    // Try using Electron API first (most reliable method)
    await browser.electron.execute((electron, coreCount) => {
      const windows = electron.BrowserWindow.getAllWindows();
      // Keep the first coreCount windows, close the rest
      for (let i = coreCount; i < windows.length; i++) {
        try {
          windows[i].close();
        } catch (e) {}
      }
    }, coreCount);

    await browser.pause(TIMING.WINDOW_CHANGE_PAUSE);

    // Backup approach: close one by one using WebdriverIO
    await refreshWindowHandles();
    if (windowHandles.length > coreCount) {
      for (let i = windowHandles.length - 1; i >= coreCount; i--) {
        try {
          await switchToWindow(i);
          await browser.execute(() => window.close());
          await browser.pause(100);
        } catch (e) {}
      }
    }
  } catch (error) {
    console.error(`Error closing windows: ${error}`);
  }
}
