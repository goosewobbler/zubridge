// Utility functions for E2E window and counter management
import { browser } from 'wdio-electron-service';
import { TIMING } from '../constants.js';
import { subscribeToAllState } from './subscription.js';

// Store windows by index rather than by title since all windows have the same title
export const windowHandles: string[] = [];

/**
 * Refresh the list of window handles
 * @returns The number of window handles found
 */
export const refreshWindowHandles = async () => {
  try {
    // For macOS, add extra retries
    const maxRetries = process.platform === 'darwin' ? 3 : 1;
    let handles: string[] = [];

    // Try multiple times on macOS
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        handles = await browser.getWindowHandles();
        if (handles.length > 0) break;

        // If we didn't get any handles, wait a bit and try again
        if (attempt < maxRetries - 1) {
          console.log(`No window handles found on attempt ${attempt + 1}, retrying...`);
          await browser.pause(TIMING.WINDOW_SWITCH_PAUSE);
        }
      } catch (error: any) {
        console.error(`Error getting window handles on attempt ${attempt + 1}: ${error}`);
        if (attempt < maxRetries - 1) {
          await browser.pause(TIMING.WINDOW_SWITCH_PAUSE);
        }
      }
    }

    windowHandles.length = 0;

    for (const handle of handles) {
      try {
        await browser.switchToWindow(handle);
        // Use platform-specific pause after switching
        await browser.pause(TIMING.WINDOW_SWITCH_PAUSE);
        windowHandles.push(handle);
      } catch (error: any) {
        // Skip window handle - might be closing
        console.log(`Skipping handle: ${error.message}`);
      }
    }

    console.log(`refreshWindowHandles found ${windowHandles.length} windows`);
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
            console.log(`Current window count: ${windowCount}, waiting for ${desiredWindows}`);
          }
          return windowCount === desiredWindows;
        } catch (error) {
          console.error(`Error in waitUntilWindowsAvailable: ${error}`);
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

      // For macOS, try multiple times
      const maxAttempts = process.platform === 'darwin' ? 3 : 1;
      let success = false;

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
          console.log(`Switching to window ${index} (attempt ${attempt + 1})`);
          await browser.switchToWindow(handle);
          await browser.pause(TIMING.WINDOW_SWITCH_PAUSE);

          // Verify switch worked by checking for a known element
          const pageTitle = await browser.getTitle();
          console.log(`Window ${index} title: ${pageTitle}`);
          success = true;
          break;
        } catch (error) {
          console.error(`Error switching to window ${index} on attempt ${attempt + 1}: ${error}`);
          if (attempt < maxAttempts - 1) {
            await browser.pause(TIMING.WINDOW_SWITCH_PAUSE * 2);
          }
        }
      }

      return success;
    } else {
      console.warn(`Cannot switch to window ${index}, only have ${windowHandles.length} handles`);
      return false;
    }
  } catch (error) {
    console.error(`Top-level error in switchToWindow(${index}): ${error}`);
    return false;
  }
};

// Helper to get a button by its type in the current window
export const getButtonInCurrentWindow = async (
  buttonType:
    | 'increment'
    | 'decrement'
    | 'create'
    | 'close'
    | 'doubleRendererSlow'
    | 'doubleRendererGetStateOverride'
    | 'doubleMainSlow'
    | 'doubleRenderer'
    | 'doubleMain'
    | 'subscribe'
    | 'unsubscribe'
    | 'subscribeAll'
    | 'unsubscribeAll'
    | 'toggleTheme'
    | 'generateLargeState'
    | 'doubleObject'
    | 'slowObject'
    | 'dispatch-invalid-btn'
    | 'access-nonexistent-btn'
    | 'verify-unsubscribed-btn'
    | 'trigger-main-error-btn'
    | 'thunk-error-btn'
    | 'clear-errors-btn'
    | 'update-unsubscribed-btn'
    | 'bypass-thunk-lock-btn'
    | 'bypass-access-control-btn'
    | 'distinctive-pattern-btn'
    | 'distinctive-pattern-slow-btn',
) => {
  let selector = '';
  switch (buttonType) {
    case 'increment':
      selector = 'button=+';
      break;
    case 'decrement':
      selector = 'button=-';
      break;
    case 'create':
      selector = 'button=Create Window';
      break;
    case 'close':
      selector = 'button=Close Window';
      break;
    case 'doubleRendererSlow':
      selector = 'button=Double (Renderer Slow Thunk)';
      break;
    case 'doubleMainSlow':
      selector = 'button=Double (Main Slow Thunk)';
      break;
    case 'doubleRenderer':
      selector = 'button=Double (Renderer Thunk)';
      break;
    case 'doubleMain':
      selector = 'button=Double (Main Thunk)';
      break;
    case 'subscribe':
      selector = 'button=Subscribe';
      break;
    case 'unsubscribe':
      selector = 'button=Unsubscribe';
      break;
    case 'subscribeAll':
      selector = 'button=Subscribe All';
      break;
    case 'unsubscribeAll':
      selector = 'button=Unsubscribe All';
      break;
    case 'toggleTheme':
      selector = 'button*=Switch Theme';
      break;
    case 'generateLargeState':
      selector = 'button=Generate Large State';
      break;
    case 'doubleObject':
      selector = 'button=Double (Object)';
      break;
    case 'slowObject':
      selector = 'button=Double (Slow Object)';
      break;
    case 'dispatch-invalid-btn':
      selector = '[data-testid="dispatch-invalid-btn"]';
      break;
    case 'access-nonexistent-btn':
      selector = '[data-testid="access-nonexistent-btn"]';
      break;
    case 'verify-unsubscribed-btn':
      selector = '[data-testid="verify-unsubscribed-btn"]';
      break;
    case 'trigger-main-error-btn':
      selector = '[data-testid="trigger-main-error-btn"]';
      break;
    case 'thunk-error-btn':
      selector = '[data-testid="thunk-error-btn"]';
      break;
    case 'clear-errors-btn':
      selector = '[data-testid="clear-errors-btn"]';
      break;
    case 'update-unsubscribed-btn':
      selector = '[data-testid="update-unsubscribed-btn"]';
      break;
    case 'bypass-thunk-lock-btn':
      selector = 'button=Bypass Thunk Lock';
      break;
    case 'bypass-access-control-btn':
      selector = 'button=Bypass Access Control';
      break;
    case 'distinctive-pattern-btn':
      selector = '[data-testid="distinctive-pattern-btn"]';
      break;
    case 'distinctive-pattern-slow-btn':
      selector = '[data-testid="distinctive-pattern-slow-btn"]';
      break;
    case 'doubleRendererGetStateOverride':
      selector = '[data-testid="doubleRendererGetStateOverride"]';
      break;
    default:
      // Ensure all cases are handled, or throw an error for an unhandled button type.
      // This helps catch issues if new button types are added to the union type but not here.
      throw new Error(`Unknown button type: ${buttonType}`);
  }

  // For macOS, add retries
  const maxAttempts = process.platform === 'darwin' ? 3 : 1;
  let element;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      element = await browser.$(selector);

      if (element) {
        // Verify element is present
        await element.waitForExist({ timeout: TIMING.WINDOW_WAIT_INTERVAL * 2 });
        return element;
      }
    } catch (error) {
      console.error(`Error finding ${buttonType} button on attempt ${attempt + 1}: ${error}`);
      if (attempt < maxAttempts - 1) {
        await browser.pause(TIMING.WINDOW_SWITCH_PAUSE);
      }
    }
  }

  throw new Error(`Failed to find ${buttonType} button after ${maxAttempts} attempts`);
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

  // subscribe to all state
  await subscribeToAllState();
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

/**
 * Gets a mapping between window indices (used in the tests) and actual Electron window IDs
 * This helps debug why window indices and window IDs in headers might not match
 */
export const getWindowIndexToIdMapping = async (): Promise<{ [index: number]: number }> => {
  await refreshWindowHandles();

  const mapping: { [index: number]: number } = {};

  // For each window handle, get the actual window ID
  for (let i = 0; i < windowHandles.length; i++) {
    try {
      await browser.switchToWindow(windowHandles[i]);
      // Get the window ID from the window info displayed in the header
      const windowId = await browser.execute(() => {
        // Find the window ID element in the header
        const idElement = document.querySelector('.window-type');
        if (idElement) {
          // Extract the ID from text like "ID: 123"
          const idText = idElement.textContent || '';
          const match = idText.match(/ID:\s*(\d+)/);
          return match ? parseInt(match[1], 10) : null;
        }
        return null;
      });

      if (windowId !== null) {
        mapping[i] = windowId;
      }
    } catch (error) {
      console.error(`Error getting window ID for index ${i}:`, error);
    }
  }

  console.log('Window index to ID mapping:', mapping);
  return mapping;
};

/**
 * Logs window information to help debug tests
 * Includes the relationship between window indices and IDs
 */
export const logWindowInfo = async (): Promise<void> => {
  console.log('--- Window Information ---');
  const mapping = await getWindowIndexToIdMapping();

  // Print each window's information
  for (let i = 0; i < windowHandles.length; i++) {
    try {
      await browser.switchToWindow(windowHandles[i]);
      const title = await browser.getTitle();
      const id = mapping[i] || 'unknown';
      console.log(`Window[${i}]: ID=${id}, Title="${title}"`);

      // Get subscription info if available
      const subscriptions = await browser.execute(() => {
        const subscriptionElement = document.querySelector('.header-right span.text-xs');
        return subscriptionElement ? subscriptionElement.textContent : null;
      });

      if (subscriptions) {
        console.log(`  Subscriptions: ${subscriptions}`);
      }
    } catch (error) {
      console.log(`Window[${i}]: Error getting info - ${error}`);
    }
  }
  console.log('-------------------------');
};
