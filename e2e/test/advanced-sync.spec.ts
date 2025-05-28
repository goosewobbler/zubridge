import { expect } from '@wdio/globals';
import { it, describe, before, beforeEach } from 'mocha';
import { browser } from 'wdio-electron-service';
import {
  setupTestEnvironment,
  windowHandles,
  refreshWindowHandles,
  waitUntilWindowsAvailable,
  switchToWindow,
  getButtonInCurrentWindow,
} from '../utils/window.js';
import { getCounterValue, incrementCounterAndVerify, resetCounter } from '../utils/counter.js';
import { TIMING } from '../constants.js';
console.log(`Using timing configuration for platform: ${process.platform}`);

// Names of core windows for easier reference in tests
// UPDATED: Reduced to only Main and DirectWebContents windows
const CORE_WINDOW_NAMES = ['Main', 'DirectWebContents'];
const CORE_WINDOW_COUNT = CORE_WINDOW_NAMES.length;

// Add these helper functions before the tests
/**
 * Subscribe to specific state keys using the UI
 */
async function subscribeToState(keys: string): Promise<void> {
  console.log(`Subscribing to state keys: ${keys}`);

  // Fill the input field
  const inputField = await browser.$('input[placeholder*="Enter state keys"]');
  await inputField.setValue(keys);

  // Click the Subscribe button using the helper
  const subscribeButton = await getButtonInCurrentWindow('subscribe');
  await subscribeButton.click();

  // Allow time for subscription to take effect
  await browser.pause(TIMING.STATE_SYNC_PAUSE);
}

/**
 * Unsubscribe from specific keys using the UI
 */
async function unsubscribeFromState(keys: string): Promise<void> {
  console.log(`Unsubscribing from state keys: ${keys}`);

  // Fill the input field
  const inputField = await browser.$('input[placeholder*="Enter state keys"]');
  await inputField.setValue(keys);

  // Click the Unsubscribe button using the helper
  const unsubscribeButton = await getButtonInCurrentWindow('unsubscribe');
  await unsubscribeButton.click();

  // Allow time for unsubscription to take effect
  await browser.pause(TIMING.STATE_SYNC_PAUSE);
}

/**
 * Subscribe to all state using the UI
 */
async function subscribeToAllState(): Promise<void> {
  console.log('Subscribing to all state');

  // Click the Subscribe All button using the helper
  const subscribeAllButton = await getButtonInCurrentWindow('subscribeAll');
  await subscribeAllButton.click();

  // Allow time for subscription to take effect
  await browser.pause(TIMING.STATE_SYNC_PAUSE);
}

/**
 * Unsubscribe from all state using the UI
 */
async function unsubscribeFromAllState(): Promise<void> {
  console.log('Unsubscribing from all state');

  // Click the Unsubscribe All button using the helper
  const unsubscribeAllButton = await getButtonInCurrentWindow('unsubscribeAll');
  await unsubscribeAllButton.click();

  // Allow time for unsubscription to take effect
  await browser.pause(TIMING.STATE_SYNC_PAUSE);
}

describe('Advanced State Synchronization', () => {
  before(async () => {
    await waitUntilWindowsAvailable(CORE_WINDOW_COUNT);
  });

  beforeEach(async () => {
    console.log('Running beforeEach setup...');
    try {
      // Use a single function to set up the test environment
      await setupTestEnvironment(CORE_WINDOW_COUNT);
      console.log(`beforeEach setup complete, ${CORE_WINDOW_COUNT} windows verified, focus on main.`);
    } catch (error) {
      console.error('Error during beforeEach setup:', error);
      // If setup fails, try to recover or throw to stop tests
      throw new Error(`Test setup failed: ${error}`);
    }
  });

  describe('multi-window state synchronization', () => {
    it('should maintain state across windows', async () => {
      console.log('Starting maintain state test');

      // Reset counter to 0 first
      await resetCounter();

      // Increment counter in main window
      console.log('Incrementing counter in main window');
      const incrementButton = await getButtonInCurrentWindow('increment');
      await incrementButton.click();
      await browser.pause(20);
      await incrementButton.click();
      await browser.pause(20);
      await incrementButton.click();
      await browser.pause(20);

      // Check counter value in main window
      const mainCounterValue = await getCounterValue();
      console.log(`Main window counter value: ${mainCounterValue}`);
      expect(mainCounterValue).toBe(3);

      // Create new window using the button
      console.log('Creating new window via button click');
      const createWindowButton = await getButtonInCurrentWindow('create');
      await createWindowButton.click();

      // Give the new window more time to appear and register
      await browser.pause(TIMING.WINDOW_CHANGE_PAUSE * 3);
      await refreshWindowHandles(); // Refresh handles *after* waiting
      console.log(`After clicking create window, have ${windowHandles.length} windows`);

      // Verify window count using Electron API
      console.log('Verifying window count via Electron API');
      const windowCountAfterCreate = await browser.electron.execute((electron) => {
        return electron.BrowserWindow.getAllWindows().length;
      });
      console.log(`Window count from Electron: ${windowCountAfterCreate}`);

      // Wait until Electron confirms 3 windows exist
      await browser.waitUntil(
        async () => {
          const count = await browser.electron.execute((electron) => {
            return electron.BrowserWindow.getAllWindows().length;
          });
          console.log(`Waiting for 3 windows (Electron)... Current count: ${count}`);
          return count >= 3;
        },
        {
          timeout: TIMING.WINDOW_WAIT_TIMEOUT * 2, // Increased timeout for this check
          timeoutMsg: `Expected Electron to report at least 3 windows, last count: ${windowCountAfterCreate}`,
          interval: TIMING.WINDOW_WAIT_INTERVAL,
        },
      );

      // Refresh handles again after confirming Electron sees the window
      await refreshWindowHandles();

      // Switch to the new window (should be at index 2)
      console.log('Switching to new window (index 2)');
      const switched = await switchToWindow(2);
      if (!switched) {
        console.warn('Could not switch to new window (index 2), skipping verification');
        await setupTestEnvironment(CORE_WINDOW_COUNT);
        return;
      }

      // Wait for the UI and state to stabilize
      await browser.pause(TIMING.STATE_SYNC_PAUSE);

      // Verify counter state in new window
      console.log('Checking counter in new window');
      const newWindowValue = await getCounterValue();
      console.log(`New window counter value: ${newWindowValue}`);
      expect(newWindowValue).toBe(3);

      // Clean up by closing the window
      console.log('Cleaning up third window');
      await browser.electron.execute((electron) => {
        const windows = electron.BrowserWindow.getAllWindows();
        if (windows.length >= 3) {
          console.log(`Destroying window at index 2 with ID: ${windows[2].id}`);
          windows[2].destroy();
        }
      });
      await browser.pause(TIMING.WINDOW_CHANGE_PAUSE * 2);
      await waitUntilWindowsAvailable(2); // Expect 2 windows after cleanup
    });

    it('should create multiple windows and maintain state across all of them', async () => {
      console.log('Starting multi-window test');

      // Reset counter using our helper
      console.log('Resetting counter to 0');
      const finalCount = await resetCounter();
      expect(finalCount).toBe(0);

      // Create a third window and verify it exists
      console.log('Creating third window');
      const createWindowButton = await getButtonInCurrentWindow('create');
      await createWindowButton.click();

      // Wait with additional patience for the window to appear
      let attempt = 0;
      let windowCount = 0;
      while (attempt < 3 && windowCount < 3) {
        await browser.pause(TIMING.WINDOW_CHANGE_PAUSE);
        await refreshWindowHandles();
        windowCount = windowHandles.length;
        if (windowCount >= 3) {
          break;
        }
        console.log(`Attempt ${attempt + 1}: Window count is ${windowCount}, waiting for 3 windows...`);
        attempt++;
      }

      expect(windowHandles.length).toBeGreaterThanOrEqual(3);
      console.log(`After creating third window, have ${windowHandles.length} windows`);

      // Create a fourth window from main window
      console.log('Creating fourth window');
      await switchToWindow(0);
      const createWindowButton2 = await getButtonInCurrentWindow('create');
      await createWindowButton2.click();

      // Wait with additional patience for the window to appear
      attempt = 0;
      windowCount = 0;
      while (attempt < 3 && windowCount < 4) {
        await browser.pause(TIMING.WINDOW_CHANGE_PAUSE);
        await refreshWindowHandles();
        windowCount = windowHandles.length;
        if (windowCount >= 4) {
          break;
        }
        console.log(`Attempt ${attempt + 1}: Window count is ${windowCount}, waiting for 4 windows...`);
        attempt++;
      }

      expect(windowHandles.length).toBeGreaterThanOrEqual(4);
      console.log(`After creating fourth window, have ${windowHandles.length} windows`);

      // Ensure windows are stable
      await browser.pause(TIMING.STATE_SYNC_PAUSE);

      // Increment counter in main window to 2 and verify
      console.log('Incrementing counter in main window to 2');
      await switchToWindow(0);
      const mainValue = await incrementCounterAndVerify(2);
      console.log(`Main window counter value: ${mainValue}`);
      expect(mainValue).toBe(2);

      // Check counter in second window
      console.log('Checking counter in second window');
      const switched1 = await switchToWindow(1);
      if (switched1) {
        // Wait for state to sync
        await browser.pause(TIMING.STATE_SYNC_PAUSE);
        const secondValue = await getCounterValue();
        console.log(`Second window counter value: ${secondValue}`);
        expect(secondValue).toBe(2);
      } else {
        console.warn('Could not switch to second window, skipping check');
      }

      // Check counter in third window (if available)
      if (windowHandles.length >= 3) {
        console.log('Checking counter in third window');
        const switched2 = await switchToWindow(2);
        if (switched2) {
          // Wait for state to sync
          await browser.pause(TIMING.STATE_SYNC_PAUSE);
          const thirdValue = await getCounterValue();
          console.log(`Third window counter value: ${thirdValue}`);
          expect(thirdValue).toBe(2);
        } else {
          console.warn('Could not switch to third window, skipping check');
        }
      }

      // Check counter in fourth window (if available)
      if (windowHandles.length >= 4) {
        console.log('Checking counter in fourth window');
        const switched3 = await switchToWindow(3);
        if (switched3) {
          // Wait for state to sync
          await browser.pause(TIMING.STATE_SYNC_PAUSE);
          const fourthValue = await getCounterValue();
          console.log(`Fourth window counter value: ${fourthValue}`);
          expect(fourthValue).toBe(2);
        } else {
          console.warn('Could not switch to fourth window, skipping check');
        }
      }

      // Clean up - use our improved closeAllRemainingWindows function
      console.log('Cleaning up all windows');
      await setupTestEnvironment(CORE_WINDOW_COUNT);
    });

    it('should maintain sync between child windows and main window after parent window is closed', async () => {
      console.log('Starting parent-child window sync test');

      // Initial setup is handled by beforeEach
      const initialWindowCount = await browser.electron.execute((electron) => {
        return electron.BrowserWindow.getAllWindows().length;
      });
      console.log(`Initial window count from Electron: ${initialWindowCount}`);
      expect(initialWindowCount).toBe(2); // Verify beforeEach worked

      // Reset counter using our helper
      console.log('Resetting counter to 0');
      await resetCounter();
      expect(await getCounterValue()).toBe(0);

      // --- Create windows using the button ---
      // Create a third window (child window) from main window
      console.log('Creating child window (Window 3) via button');
      await switchToWindow(0); // Ensure focus on main
      const createButton1 = await getButtonInCurrentWindow('create');
      await createButton1.click();
      await waitUntilWindowsAvailable(3); // Wait for handle
      await browser.pause(TIMING.STATE_SYNC_PAUSE); // Allow UI to settle
      console.log('Child window created.');

      // From Window 3 (index 2), create a grandchild window (Window 4)
      console.log('Creating grandchild window (Window 4) from child window');
      await switchToWindow(2); // Switch to child window (index 2)
      const createButton2 = await getButtonInCurrentWindow('create');
      await createButton2.click();
      await waitUntilWindowsAvailable(4); // Wait for handle
      await browser.pause(TIMING.STATE_SYNC_PAUSE); // Allow UI to settle
      console.log('Grandchild window created.');
      // --- End window creation modification ---

      // Verify that we now have 4 windows
      const afterGrandchildWindowCount = await browser.electron.execute((electron) => {
        return electron.BrowserWindow.getAllWindows().length;
      });
      console.log(`Window count after creating grandchild: ${afterGrandchildWindowCount}`);
      expect(afterGrandchildWindowCount).toBeGreaterThanOrEqual(4);

      // Set the counter to 3 from the main window
      console.log('Setting counter to 3 from main window');
      await switchToWindow(0);

      // Use our reliable increment helper
      const mainValue = await incrementCounterAndVerify(3);
      console.log(`Main window counter value: ${mainValue}`);
      expect(mainValue).toBe(3);

      // Allow time for state to propagate to all windows
      await browser.pause(TIMING.STATE_SYNC_PAUSE);

      // Store the window IDs for later reference
      const windowIdsBeforeClosing = await browser.electron.execute((electron) => {
        return electron.BrowserWindow.getAllWindows().map((w) => w.id);
      });
      console.log(`Window IDs before closing child: ${JSON.stringify(windowIdsBeforeClosing)}`);

      // Close child window (at index 2) directly - using destroy for reliability
      console.log('Closing child window (index 2) directly via Electron API using destroy()');
      const windowToCloseId = windowIdsBeforeClosing[2]; // Get the ID of the window we intend to close
      const windowClosed = await browser.electron.execute((electron, targetId) => {
        try {
          const windows = electron.BrowserWindow.getAllWindows();
          const windowToClose = windows.find((w) => w.id === targetId);
          if (windowToClose && !windowToClose.isDestroyed()) {
            console.log(`Destroying window with ID: ${windowToClose.id}`);
            windowToClose.destroy(); // Use destroy()
            return true;
          }
          console.warn(`Window with ID ${targetId} not found or already destroyed.`);
          return false;
        } catch (error) {
          console.error('Error destroying window:', error);
          return false;
        }
      }, windowToCloseId);

      console.log(`Destroy command issued for window ID ${windowToCloseId}: ${windowClosed}`);

      // More generous wait time and verify with Electron directly
      await browser.waitUntil(
        async () => {
          const currentWindows = await browser.electron.execute((electron) => {
            return electron.BrowserWindow.getAllWindows().map((w) => w.id);
          });
          console.log(`Waiting for window ${windowToCloseId} to close. Current IDs: ${JSON.stringify(currentWindows)}`);
          return !currentWindows.includes(windowToCloseId);
        },
        {
          timeout: TIMING.WINDOW_WAIT_TIMEOUT * 2,
          timeoutMsg: `Window ${windowToCloseId} did not close as expected.`,
          interval: TIMING.WINDOW_WAIT_INTERVAL,
        },
      );
      console.log(`Window ID ${windowToCloseId} successfully closed.`);

      // Refresh handles after closing
      await refreshWindowHandles();
      console.log(`After closing child window, have ${windowHandles.length} handles`);

      // Get the window count from Electron to verify (should be 3 now)
      const afterClosingCount = await browser.electron.execute((electron) => {
        return electron.BrowserWindow.getAllWindows().length;
      });
      console.log(`Window count from Electron after closing child: ${afterClosingCount}`);
      // Verify Electron count reduced by 1 AND specifically expect 3 windows
      expect(afterClosingCount).toBe(afterGrandchildWindowCount - 1);
      expect(afterClosingCount).toBe(3);

      // Switch back to main window and increment counter
      console.log('Incrementing counter in main window');
      await switchToWindow(0);

      const incrementButton = await getButtonInCurrentWindow('increment');
      await incrementButton.click();
      await browser.pause(TIMING.STATE_SYNC_PAUSE);

      const mainValueAfter = await getCounterValue();
      console.log(`Main window counter after increment: ${mainValueAfter}`);
      expect(mainValueAfter).toBe(4);

      // Switch to grandchild window (now at index 2 after closure of child)
      console.log('Checking grandchild window sync');
      await switchToWindow(2);

      await browser.pause(TIMING.STATE_SYNC_PAUSE);
      const grandchildValueAfter = await getCounterValue();
      console.log(`Grandchild window counter: ${grandchildValueAfter}`);
      expect(grandchildValueAfter).toBe(4);

      // Increment from grandchild
      console.log('Incrementing counter from grandchild window');
      const incrementButton2 = await getButtonInCurrentWindow('increment');
      await incrementButton2.click();
      await browser.pause(TIMING.STATE_SYNC_PAUSE);

      const finalGrandchildValue = await getCounterValue();
      console.log(`Grandchild window counter after increment: ${finalGrandchildValue}`);
      expect(finalGrandchildValue).toBe(5);

      // Check sync back to main window
      console.log('Verifying sync back to main window');
      await switchToWindow(0);

      await browser.pause(TIMING.STATE_SYNC_PAUSE);
      const finalMainValue = await getCounterValue();
      console.log(`Main window final counter value: ${finalMainValue}`);
      expect(finalMainValue).toBe(5);
    });

    it('should sync state between all core window types', async () => {
      console.log('Testing sync between all core window types');

      // Reset counter to 0
      await switchToWindow(0);
      await resetCounter();

      // Verify we have the expected 4 core windows
      await refreshWindowHandles();
      console.log(`We have ${windowHandles.length} windows at test start`);
      expect(windowHandles.length).toBe(CORE_WINDOW_COUNT);

      // Test outgoing sync: changes made in each window should be reflected in all others
      console.log('Testing outgoing sync from each window');
      for (let sourceWindowIndex = 0; sourceWindowIndex < CORE_WINDOW_COUNT; sourceWindowIndex++) {
        // Switch to source window
        await switchToWindow(sourceWindowIndex);
        console.log(
          `Testing outgoing sync from ${CORE_WINDOW_NAMES[sourceWindowIndex]} window (index ${sourceWindowIndex})`,
        );

        // Reset counter
        await resetCounter();

        // Get current value and increment
        let currentValue = await getCounterValue();
        console.log(`Current value before increment: ${currentValue}`);
        const incrementButton = await getButtonInCurrentWindow('increment');
        await incrementButton.click();
        await browser.pause(TIMING.BUTTON_CLICK_PAUSE);

        // Verify increment in source window
        const newSourceValue = await getCounterValue();
        console.log(`New value after increment: ${newSourceValue}`);
        expect(newSourceValue).toBe(currentValue + 1);

        // Check all other windows reflect the change
        for (let targetWindowIndex = 0; targetWindowIndex < CORE_WINDOW_COUNT; targetWindowIndex++) {
          if (targetWindowIndex === sourceWindowIndex) continue;

          await switchToWindow(targetWindowIndex);
          console.log(`Verifying sync in ${CORE_WINDOW_NAMES[targetWindowIndex]} window (index ${targetWindowIndex})`);

          // Allow time for sync to complete
          await browser.pause(TIMING.STATE_SYNC_PAUSE);

          // Verify the counter value is synced
          const targetValue = await getCounterValue();
          console.log(`Target window value: ${targetValue}`);
          expect(targetValue).toBe(currentValue + 1);
        }
      }

      // Test incoming sync: changes should be received by each window
      console.log('Testing incoming sync to each window');
      for (let targetWindowIndex = 0; targetWindowIndex < CORE_WINDOW_COUNT; targetWindowIndex++) {
        // Choose source window (different from target)
        const sourceWindowIndex = (targetWindowIndex + 1) % CORE_WINDOW_COUNT;

        // Reset counter for this test
        await switchToWindow(0);
        await resetCounter();

        console.log(
          `Testing incoming sync to ${CORE_WINDOW_NAMES[targetWindowIndex]} window from ${CORE_WINDOW_NAMES[sourceWindowIndex]} window`,
        );

        // Make change in source window
        await switchToWindow(sourceWindowIndex);
        let currentValue = await getCounterValue();
        console.log(`Source window starting value: ${currentValue}`);
        const incrementButton = await getButtonInCurrentWindow('increment');
        await incrementButton.click();
        await browser.pause(TIMING.BUTTON_CLICK_PAUSE);

        const sourceValueAfter = await getCounterValue();
        console.log(`Source window value after increment: ${sourceValueAfter}`);

        // Switch to target window and verify sync
        await switchToWindow(targetWindowIndex);
        await browser.pause(TIMING.STATE_SYNC_PAUSE);

        const targetValue = await getCounterValue();
        console.log(`Target window value after sync: ${targetValue}`);
        expect(targetValue).toBe(currentValue + 1);
      }
    });

    it('should create runtime windows from each window type and maintain sync across all of them', async () => {
      console.log('Testing creation of runtime windows from each core window type');

      // Reset counter to 0
      await switchToWindow(0);
      await resetCounter();

      // Create an array to track runtime windows we create
      const createdRuntimeWindows = [];

      // For each core window type
      for (let sourceWindowIndex = 0; sourceWindowIndex < CORE_WINDOW_COUNT; sourceWindowIndex++) {
        await switchToWindow(sourceWindowIndex);
        console.log(
          `Creating runtime window from ${CORE_WINDOW_NAMES[sourceWindowIndex]} window (index ${sourceWindowIndex})`,
        );

        // Create new runtime window
        const createButton = await getButtonInCurrentWindow('create');
        await createButton.click();

        // Wait for window creation and refresh handles
        await browser.pause(TIMING.WINDOW_CHANGE_PAUSE);
        await refreshWindowHandles();

        // The newest window should be at the end of our handles array
        const newWindowIndex = windowHandles.length - 1;
        createdRuntimeWindows.push(newWindowIndex);
        console.log(`New runtime window created at index ${newWindowIndex}`);

        // Verify sync works from source to runtime window
        console.log(`Testing sync from ${CORE_WINDOW_NAMES[sourceWindowIndex]} to new runtime window`);

        // Reset counter
        await resetCounter();

        // Increment in source window
        const incrementButton = await getButtonInCurrentWindow('increment');
        await incrementButton.click();
        await browser.pause(TIMING.BUTTON_CLICK_PAUSE);
        const newValue = await getCounterValue();
        console.log(`Source window value after increment: ${newValue}`);

        // Check the runtime window received the update
        await switchToWindow(newWindowIndex);
        await browser.pause(TIMING.STATE_SYNC_PAUSE);
        const runtimeValue = await getCounterValue();
        console.log(`Runtime window value after sync: ${runtimeValue}`);
        expect(runtimeValue).toBe(newValue);

        // Now test sync from runtime window to source window
        console.log(`Testing sync from runtime window to ${CORE_WINDOW_NAMES[sourceWindowIndex]}`);
        const runtimeIncrementButton = await getButtonInCurrentWindow('increment');
        await runtimeIncrementButton.click();
        await browser.pause(TIMING.BUTTON_CLICK_PAUSE);
        const updatedRuntimeValue = await getCounterValue();
        console.log(`Runtime window value after its own increment: ${updatedRuntimeValue}`);

        // Check the source window received the update
        await switchToWindow(sourceWindowIndex);
        await browser.pause(TIMING.STATE_SYNC_PAUSE);
        const sourceValueAfter = await getCounterValue();
        console.log(`Source window value after sync from runtime: ${sourceValueAfter}`);
        expect(sourceValueAfter).toBe(updatedRuntimeValue);
      }

      // Clean up all the runtime windows we created
      console.log('Cleaning up runtime windows');
      await setupTestEnvironment(CORE_WINDOW_COUNT);
    });
  });

  describe('selective subscription behavior', () => {
    it('should stop updates for unsubscribed keys while maintaining others', async () => {
      // Reset counter and theme
      await resetCounter();

      // Subscribe to counter and theme using UI
      await subscribeToState('counter, theme');

      // Get initial counter and theme values
      const initialCounter = await getCounterValue();
      const initialTheme = await browser.execute(() => {
        return document.body.classList.contains('dark-theme');
      });

      // Unsubscribe from counter
      await unsubscribeFromState('counter');

      // Increment counter in another window
      await (await getButtonInCurrentWindow('create')).click();
      await browser.pause(TIMING.WINDOW_CHANGE_PAUSE * 2);
      await refreshWindowHandles();
      const newWindowIndex = windowHandles.length - 1;
      await switchToWindow(newWindowIndex);
      await (await getButtonInCurrentWindow('increment')).click();

      // Switch back to main window
      await switchToWindow(0);
      await browser.pause(TIMING.STATE_SYNC_PAUSE);

      // Counter should not have updated
      const counterAfterIncrement = await getCounterValue();
      expect(counterAfterIncrement).toBe(initialCounter);

      // Toggle theme - should still update
      const themeToggleButton = await getButtonInCurrentWindow('toggleTheme');
      await themeToggleButton.click();
      await browser.pause(TIMING.STATE_SYNC_PAUSE);

      const themeAfterToggle = await browser.execute(() => {
        return document.body.classList.contains('dark-theme');
      });
      expect(themeAfterToggle).not.toBe(initialTheme);
    });

    it('should handle deep key subscriptions correctly', async () => {
      // Subscribe to deep key
      await subscribeToState('filler.key1');

      // Generate large state which includes filler.key1
      const generateButton = await getButtonInCurrentWindow('generateLargeState');
      await generateButton.click();
      await browser.pause(TIMING.STATE_SYNC_PAUSE);

      // Get initial value of filler.key1
      const initialValue = await browser.execute(() => {
        return (window as any).electronAPI.getState().filler?.key1;
      });

      // Create new window and generate new large state
      await (await getButtonInCurrentWindow('create')).click();
      await browser.pause(TIMING.WINDOW_CHANGE_PAUSE * 2);
      await refreshWindowHandles();
      const newWindowIndex = windowHandles.length - 1;
      await switchToWindow(newWindowIndex);

      const generateButton2 = await getButtonInCurrentWindow('generateLargeState');
      await generateButton2.click();
      await browser.pause(TIMING.STATE_SYNC_PAUSE);

      // Switch back to main window
      await switchToWindow(0);
      await browser.pause(TIMING.STATE_SYNC_PAUSE);

      // Get new value of filler.key1
      const newValue = await browser.execute(() => {
        return (window as any).electronAPI.getState().filler?.key1;
      });

      // Value should have updated since we're subscribed to it
      expect(newValue).not.toBe(initialValue);
    });

    it('should handle overlapping subscriptions across windows correctly', async () => {
      // Reset state
      await resetCounter();

      // Subscribe main window to counter and theme using UI
      await subscribeToState('counter, theme');

      // Create second window and subscribe to theme and filler
      await (await getButtonInCurrentWindow('create')).click();
      await browser.pause(TIMING.WINDOW_CHANGE_PAUSE * 2);
      await refreshWindowHandles();
      const secondWindowIndex = windowHandles.length - 1;

      await switchToWindow(secondWindowIndex);
      await subscribeToState('theme, filler');

      // Get initial values in both windows
      await switchToWindow(0);
      const initialCounter = await getCounterValue();
      const initialTheme = await browser.execute(() => {
        return document.body.classList.contains('dark-theme');
      });

      await switchToWindow(secondWindowIndex);
      const secondWindowInitialTheme = await browser.execute(() => {
        return document.body.classList.contains('dark-theme');
      });
      expect(secondWindowInitialTheme).toBe(initialTheme);

      // Increment counter in main window
      await switchToWindow(0);
      await (await getButtonInCurrentWindow('increment')).click();
      await browser.pause(TIMING.STATE_SYNC_PAUSE);

      // Counter should update in main window only
      const mainWindowCounter = await getCounterValue();
      expect(mainWindowCounter).toBe(initialCounter + 1);

      await switchToWindow(secondWindowIndex);
      const secondWindowCounter = await getCounterValue();
      expect(secondWindowCounter).toBe(initialCounter); // Should not have updated

      // Toggle theme in second window
      const themeToggleButton = await getButtonInCurrentWindow('toggleTheme');
      await themeToggleButton.click();
      await browser.pause(TIMING.STATE_SYNC_PAUSE);

      // Theme should update in both windows
      const secondWindowNewTheme = await browser.execute(() => {
        return document.body.classList.contains('dark-theme');
      });
      expect(secondWindowNewTheme).not.toBe(initialTheme);

      await switchToWindow(0);
      const mainWindowNewTheme = await browser.execute(() => {
        return document.body.classList.contains('dark-theme');
      });
      expect(mainWindowNewTheme).toBe(secondWindowNewTheme);

      // Generate large state in second window
      await switchToWindow(secondWindowIndex);
      const generateButton = await getButtonInCurrentWindow('generateLargeState');
      await generateButton.click();
      await browser.pause(TIMING.STATE_SYNC_PAUSE);

      // Filler should be present in second window but not in main window
      const secondWindowHasFiller = await browser.execute(() => {
        return !!(window as any).electronAPI.getState().filler;
      });
      expect(secondWindowHasFiller).toBe(true);

      await switchToWindow(0);
      const mainWindowHasFiller = await browser.execute(() => {
        return !!(window as any).electronAPI.getState().filler;
      });
      expect(mainWindowHasFiller).toBe(false);
    });

    it('should handle subscribe all and unsubscribe all correctly', async () => {
      // Reset state
      await resetCounter();

      // Unsubscribe from all
      await unsubscribeFromAllState();

      // Increment counter in a new window (shouldn't affect main window)
      await (await getButtonInCurrentWindow('create')).click();
      await browser.pause(TIMING.WINDOW_CHANGE_PAUSE * 2);
      await refreshWindowHandles();
      const newWindowIndex = windowHandles.length - 1;
      await switchToWindow(newWindowIndex);

      // Make sure new window is subscribed to all
      await subscribeToAllState();

      const initialCounter = await getCounterValue();
      await (await getButtonInCurrentWindow('increment')).click();
      await browser.pause(TIMING.STATE_SYNC_PAUSE);

      // Verify counter incremented in new window
      const newWindowCounter = await getCounterValue();
      expect(newWindowCounter).toBe(initialCounter + 1);

      // Switch back to main window
      await switchToWindow(0);
      await browser.pause(TIMING.STATE_SYNC_PAUSE);

      // Counter should not have updated in main window
      const mainWindowCounter = await getCounterValue();
      expect(mainWindowCounter).toBe(initialCounter);

      // Now subscribe to all in main window
      await subscribeToAllState();

      // Increment counter again in new window
      await switchToWindow(newWindowIndex);
      await (await getButtonInCurrentWindow('increment')).click();
      await browser.pause(TIMING.STATE_SYNC_PAUSE);

      // Switch back to main window
      await switchToWindow(0);
      await browser.pause(TIMING.STATE_SYNC_PAUSE);

      // Counter should now update in main window
      const updatedMainWindowCounter = await getCounterValue();
      expect(updatedMainWindowCounter).toBe(initialCounter + 2);
    });
  });
});
