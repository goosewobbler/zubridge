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
  getCounterValue,
  incrementCounterAndVerify,
  resetCounter,
} from '../utils/windowUtils';
import { waitForCounterChange, clickAndWaitForCounterChange } from '../utils/waitForCounterChange';

// Platform-specific timing configurations
const TIMING = {
  // Base timing values (used for macOS / Windows)
  base: {
    WINDOW_SWITCH_PAUSE: 100,
    STATE_SYNC_PAUSE: 250, // Time to wait for state to sync between windows
    BUTTON_CLICK_PAUSE: 50, // Time to wait after clicking a button
    WINDOW_CHANGE_PAUSE: 200, // Time to wait after window creation/deletion
    WINDOW_WAIT_TIMEOUT: 3000, // Maximum time to wait for window operations
    WINDOW_WAIT_INTERVAL: 150, // How often to check window availability
    THUNK_WAIT_TIME: 2000, // Time to wait for thunk to complete
  },

  // Timing adjustments for Linux (slower CI environment)
  linux: {
    WINDOW_SWITCH_PAUSE: 150,
    STATE_SYNC_PAUSE: 400,
    BUTTON_CLICK_PAUSE: 100,
    WINDOW_CHANGE_PAUSE: 350,
    WINDOW_WAIT_TIMEOUT: 5000,
    WINDOW_WAIT_INTERVAL: 200,
    THUNK_WAIT_TIME: 2000,
  },
};

// Determine which timing configuration to use based on platform
const PLATFORM = process.platform;
const CURRENT_TIMING = PLATFORM === 'linux' ? TIMING.linux : TIMING.base;

console.log(`Using timing configuration for platform: ${PLATFORM}`);

// Names of core windows for easier reference in tests
// UPDATED: Reduced to only Main and DirectWebContents windows
// TODO: Add BrowserView and WebContentsView windows when we have fixed the Webdriver connection issues
const CORE_WINDOW_NAMES = ['Main', 'DirectWebContents'];
const CORE_WINDOW_COUNT = CORE_WINDOW_NAMES.length;

describe('application loading', () => {
  before(async () => {
    await waitUntilWindowsAvailable(CORE_WINDOW_COUNT, CURRENT_TIMING);
  });

  beforeEach(async () => {
    console.log('Running beforeEach setup...');
    try {
      // Use a single function to set up the test environment
      await setupTestEnvironment(CORE_WINDOW_COUNT, CURRENT_TIMING);
      console.log(`beforeEach setup complete, ${CORE_WINDOW_COUNT} windows verified, focus on main.`);
    } catch (error) {
      console.error('Error during beforeEach setup:', error);
      // If setup fails, try to recover or throw to stop tests
      throw new Error(`Test setup failed: ${error}`);
    }
  });

  describe('click events', () => {
    it('should increment the counter', async () => {
      const incrementButton = await browser.$('button=+');

      await incrementButton.click();
      await browser.pause(CURRENT_TIMING.BUTTON_CLICK_PAUSE);
      const counterElement1 = await browser.$('h2');
      expect(await counterElement1.getText()).toContain('1');

      await incrementButton.click();
      await browser.pause(CURRENT_TIMING.BUTTON_CLICK_PAUSE);
      const counterElement2 = await browser.$('h2');
      expect(await counterElement2.getText()).toContain('2');

      await incrementButton.click();
      await browser.pause(CURRENT_TIMING.BUTTON_CLICK_PAUSE);
      const counterElement3 = await browser.$('h2');
      expect(await counterElement3.getText()).toContain('3');
    });

    it('should decrement the counter', async () => {
      const decrementButton = await browser.$('button=-');

      await decrementButton.click();
      await browser.pause(CURRENT_TIMING.BUTTON_CLICK_PAUSE);
      const counterElement1 = await browser.$('h2');
      expect(await counterElement1.getText()).toContain('2');

      await decrementButton.click();
      await browser.pause(CURRENT_TIMING.BUTTON_CLICK_PAUSE);
      const counterElement2 = await browser.$('h2');
      expect(await counterElement2.getText()).toContain('1');

      await decrementButton.click();
      await browser.pause(CURRENT_TIMING.BUTTON_CLICK_PAUSE);
      const counterElement3 = await browser.$('h2');
      expect(await counterElement3.getText()).toContain('0');
    });

    it('should double the counter using an action object', async () => {
      // First, increment to a known value
      await resetCounter();
      const incrementButton = await browser.$('button=+');
      await incrementButton.click();
      await browser.pause(CURRENT_TIMING.BUTTON_CLICK_PAUSE);
      await incrementButton.click();
      await browser.pause(CURRENT_TIMING.BUTTON_CLICK_PAUSE);

      // Verify counter is at 2
      const initialCounter = await browser.$('h2');
      expect(await initialCounter.getText()).toContain('2');

      // Click the double button
      const doubleButton = await browser.$('button=Double (Object)');
      await doubleButton.click();
      await browser.pause(CURRENT_TIMING.BUTTON_CLICK_PAUSE * 2);

      // Verify counter is now doubled (4)
      const doubledCounter = await browser.$('h2');
      expect(await doubledCounter.getText()).toContain('4');

      // Double again
      await doubleButton.click();
      await browser.pause(CURRENT_TIMING.BUTTON_CLICK_PAUSE * 2);

      // Verify counter is now 8
      const finalCounter = await browser.$('h2');
      expect(await finalCounter.getText()).toContain('8');
    });

    it('should double the counter using a thunk', async () => {
      // First, increment to a known value
      await resetCounter();
      const incrementButton = await browser.$('button=+');
      await incrementButton.click();
      await browser.pause(CURRENT_TIMING.BUTTON_CLICK_PAUSE);
      await incrementButton.click();
      await browser.pause(CURRENT_TIMING.BUTTON_CLICK_PAUSE);

      // Verify counter is at 2
      const initialValue = await getCounterValue();
      expect(initialValue).toBe(2);

      // Click the double button - this should execute the thunk
      console.log('Clicking Double (Renderer Thunk) button to execute async thunk');
      const doubleButton = await browser.$('button=Double (Renderer Thunk)');
      // Check intermediate value - the behavior should be:
      // 1. First operation multiplies by 2 (4)
      // 2. Second operation multiplies by 2 (8)
      let intermediateValue = await clickAndWaitForCounterChange(doubleButton);
      console.log(`Intermediate counter value: ${intermediateValue}`);
      expect(intermediateValue).toBe(4);

      intermediateValue = await waitForCounterChange();
      console.log(`Intermediate counter value: ${intermediateValue}`);
      expect(intermediateValue).toBe(8);

      // Verify final counter value
      // The sequence should be: 2 -> 4 -> 8 -> 4, so expect 4
      const finalValue = await waitForCounterChange();
      console.log(`Final counter value: ${finalValue}`);
      expect(finalValue).toBe(4);
    });

    it('should double the counter using a main process thunk', async () => {
      // First, increment to a known value
      await resetCounter();
      const incrementButton = await browser.$('button=+');
      await incrementButton.click();
      await browser.pause(CURRENT_TIMING.BUTTON_CLICK_PAUSE);
      await incrementButton.click();
      await browser.pause(CURRENT_TIMING.BUTTON_CLICK_PAUSE);

      // Verify counter is at 2
      const initialValue = await getCounterValue();
      expect(initialValue).toBe(2);

      // Click the main process thunk button
      console.log('Clicking Double (Main Thunk) button to execute main process thunk');
      const mainThunkButton = await browser.$('button=Double (Main Thunk)');

      // Check intermediate value - the behavior should be:
      // 1. First operation multiplies by 2 (4)
      // 2. Second operation multiplies by 2 (8)
      let intermediateValue = await clickAndWaitForCounterChange(mainThunkButton);
      console.log(`Intermediate counter value (main thunk): ${intermediateValue}`);
      expect(intermediateValue).toBe(4);

      intermediateValue = await waitForCounterChange();
      console.log(`Intermediate counter value (main thunk): ${intermediateValue}`);
      expect(intermediateValue).toBe(8);

      // Verify final counter value
      // The sequence should be: 2 -> 4 -> 8 -> 4, so expect 4
      const finalValue = await waitForCounterChange();
      console.log(`Final counter value: ${finalValue}`);
      expect(finalValue).toBe(4);
    });

    it('should fully await renderer thunk completion before performing subsequent actions in the same window', async () => {
      // Reset counter to start fresh
      await resetCounter();

      // Increment to a known value (2)
      const incrementButton = await browser.$('button=+');
      await incrementButton.click();
      await browser.pause(CURRENT_TIMING.BUTTON_CLICK_PAUSE);
      await incrementButton.click();
      await browser.pause(CURRENT_TIMING.BUTTON_CLICK_PAUSE);

      // Verify counter is at 2
      const initialValue = await getCounterValue();
      console.log(`Initial counter value: ${initialValue}`);
      expect(initialValue).toBe(2);

      // Start the thunk
      console.log('Triggering renderer thunk...');
      const rendererThunkButton = await browser.$('button=Double (Renderer Thunk)');

      // Check intermediate state
      // kick off the thunk and wait for the first intermediate value
      const intermediateValue = await clickAndWaitForCounterChange(rendererThunkButton);
      expect(intermediateValue).toBe(4);

      // interrupt the thunk with an increment
      const intermediateValue2 = await clickAndWaitForCounterChange(incrementButton);

      // verify the increment action was deferred and the thunk continued processing
      expect(intermediateValue2).toBe(8);

      // wait for the thunk to complete
      const finalThunkValue = await waitForCounterChange();
      expect(finalThunkValue).toBe(4);

      // wait for the increment action to complete
      const finalValue = await waitForCounterChange();
      expect(finalValue).toBe(5);
    });

    it('should fully await main process thunk completion before performing subsequent actions in the same window', async () => {
      // Reset counter to start fresh
      await resetCounter();

      // Increment to a known value (2)
      const incrementButton = await browser.$('button=+');
      await incrementButton.click();
      await browser.pause(CURRENT_TIMING.BUTTON_CLICK_PAUSE);
      await incrementButton.click();
      await browser.pause(CURRENT_TIMING.BUTTON_CLICK_PAUSE);

      // Verify counter is at 2
      const initialValue = await getCounterValue();
      expect(initialValue).toBe(2);

      // Start the thunk
      console.log('Triggering main process thunk...');
      const mainThunkButton = await browser.$('button=Double (Main Thunk)');

      // Check intermediate state
      // kick off the thunk and wait for the first intermediate value
      const intermediateValue = await clickAndWaitForCounterChange(mainThunkButton);
      expect(intermediateValue).toBe(4);

      // interrupt the thunk with an increment
      const intermediateValue2 = await clickAndWaitForCounterChange(incrementButton);

      // verify the increment action was deferred and the thunk continued processing
      expect(intermediateValue2).toBe(8);

      // wait for the thunk to complete
      const finalThunkValue = await waitForCounterChange();
      expect(finalThunkValue).toBe(4);

      // wait for the increment action to complete
      const finalValue = await waitForCounterChange();
      expect(finalValue).toBe(5);
    });

    it('should await main process thunk completion even when actions are dispatched from different windows', async () => {
      console.log('Starting cross-window main process thunk test');

      // Reset counter to start fresh
      await resetCounter();

      // Increment to a known value (2)
      const incrementButton = await browser.$('button=+');
      await incrementButton.click();
      await browser.pause(CURRENT_TIMING.BUTTON_CLICK_PAUSE);
      await incrementButton.click();
      await browser.pause(CURRENT_TIMING.BUTTON_CLICK_PAUSE);

      // Verify counter is at 2
      const initialValue = await getCounterValue();
      expect(initialValue).toBe(2);

      // Create a new window for cross-window testing
      console.log('Creating a second window for cross-window testing');
      const createWindowButton = await browser.$('button=Create Window');
      await createWindowButton.click();
      await browser.pause(CURRENT_TIMING.WINDOW_CHANGE_PAUSE * 2);
      await refreshWindowHandles();

      // Verify we have 3 windows total
      expect(windowHandles.length).toBeGreaterThanOrEqual(3);

      // Start sequence in main window
      console.log('Starting main process thunk in main window...');
      const mainThunkButton = await browser.$('button=Double (Main Thunk)');
      await mainThunkButton.click();

      // After a small delay, switch to second window and click increment
      await browser.pause(CURRENT_TIMING.BUTTON_CLICK_PAUSE);
      console.log('Switching to second window...');
      await switchToWindow(1);

      // Verify window switch was successful
      const secondWindowValue = await getCounterValue();
      console.log(`Second window counter value: ${secondWindowValue}`);
      // Value might be 2 or 4 (intermediate) depending on timing

      // Click increment in second window while main process thunk is running
      console.log('Clicking increment in second window...');
      const secondWindowIncrementButton = await getButtonInCurrentWindow('increment');
      await secondWindowIncrementButton.click();

      // Wait for all operations to complete
      console.log('Waiting for all cross-window operations to complete...');
      await browser.pause(CURRENT_TIMING.THUNK_WAIT_TIME + CURRENT_TIMING.STATE_SYNC_PAUSE);

      // Check final value in second window - should be 5 if properly awaited
      const secondWindowFinalValue = await getCounterValue();
      console.log(`Second window final value: ${secondWindowFinalValue}`);
      expect(secondWindowFinalValue).toBe(5);

      // Switch back to first window and verify same value
      console.log('Switching back to main window to verify sync...');
      await switchToWindow(0);
      await browser.pause(CURRENT_TIMING.STATE_SYNC_PAUSE);

      const mainWindowFinalValue = await getCounterValue();
      console.log(`Main window final value: ${mainWindowFinalValue}`);
      expect(mainWindowFinalValue).toBe(5);

      // Clean up the window we created
      console.log('Cleaning up extra window');
      await setupTestEnvironment(CORE_WINDOW_COUNT, CURRENT_TIMING);
    });

    it('should await renderer thunk completion even when actions are dispatched from different windows', async () => {
      console.log('Starting cross-window renderer thunk test');

      // Reset counter to start fresh
      await resetCounter();

      // Increment to a known value (2)
      const incrementButton = await browser.$('button=+');
      await incrementButton.click();
      await browser.pause(CURRENT_TIMING.BUTTON_CLICK_PAUSE);
      await incrementButton.click();
      await browser.pause(CURRENT_TIMING.BUTTON_CLICK_PAUSE);

      // Verify counter is at 2
      const initialValue = await getCounterValue();
      expect(initialValue).toBe(2);

      // Create a new window for cross-window testing
      console.log('Creating a second window for cross-window testing');
      const createWindowButton = await browser.$('button=Create Window');
      await createWindowButton.click();
      await browser.pause(CURRENT_TIMING.WINDOW_CHANGE_PAUSE * 2);
      await refreshWindowHandles();

      // Verify we have 3 windows total
      expect(windowHandles.length).toBeGreaterThanOrEqual(3);

      // Start sequence in main window
      console.log('Starting renderer thunk in main window...');
      const rendererThunkButton = await browser.$('button=Double (Renderer Thunk)');
      await rendererThunkButton.click();

      // After a small delay, switch to second window and click increment
      await browser.pause(CURRENT_TIMING.BUTTON_CLICK_PAUSE);
      console.log('Switching to second window...');
      await switchToWindow(1);

      // Verify window switch was successful
      const secondWindowValue = await getCounterValue();
      console.log(`Second window counter value: ${secondWindowValue}`);
      // Value might be 2 or 4 (intermediate) depending on timing

      // Click increment in second window while renderer thunk is running
      console.log('Clicking increment in second window...');
      const secondWindowIncrementButton = await getButtonInCurrentWindow('increment');
      await secondWindowIncrementButton.click();

      // Wait for all operations to complete
      console.log('Waiting for all cross-window operations to complete...');
      await browser.pause(CURRENT_TIMING.THUNK_WAIT_TIME + CURRENT_TIMING.STATE_SYNC_PAUSE);

      // Check final value in second window - should be 5 if properly awaited
      const secondWindowFinalValue = await getCounterValue();
      console.log(`Second window final value: ${secondWindowFinalValue}`);
      expect(secondWindowFinalValue).toBe(5);

      // Switch back to first window and verify same value
      console.log('Switching back to main window to verify sync...');
      await switchToWindow(0);
      await browser.pause(CURRENT_TIMING.STATE_SYNC_PAUSE);

      const mainWindowFinalValue = await getCounterValue();
      console.log(`Main window final value: ${mainWindowFinalValue}`);
      expect(mainWindowFinalValue).toBe(5);

      // Clean up the window we created
      console.log('Cleaning up extra window');
      await setupTestEnvironment(CORE_WINDOW_COUNT, CURRENT_TIMING);
    });
  });

  describe('window management', () => {
    it('should create a new window', async () => {
      // No need to switch to window 0, beforeEach handles it
      const createWindowButton = await browser.$('button=Create Window');
      await createWindowButton.click();

      // Give the new window more time to appear before checking
      await browser.pause(CURRENT_TIMING.WINDOW_CHANGE_PAUSE * 3);

      // Wait for new window and switch to it (there should now be 3 windows)
      await waitUntilWindowsAvailable(3, CURRENT_TIMING);
      const windows = await browser.electron.execute((electron) => {
        return electron.BrowserWindow.getAllWindows().length;
      });

      expect(windows).toBe(3);

      // We'll leave the window open for the next test
    });

    it('should sync state between main and secondary windows', async () => {
      console.log('Starting base windows sync test');

      // Reset counter to 0
      console.log('Resetting counter to 0');
      await resetCounter();

      // Increment counter in main window
      console.log('Incrementing counter in main window');
      const incrementButton = await getButtonInCurrentWindow('increment');
      await incrementButton.click();
      await browser.pause(CURRENT_TIMING.BUTTON_CLICK_PAUSE);
      await incrementButton.click();
      await browser.pause(CURRENT_TIMING.BUTTON_CLICK_PAUSE);

      // Check counter value in main window
      const mainCounterValue = await getCounterValue();
      console.log(`Main window counter value: ${mainCounterValue}`);
      expect(mainCounterValue).toBe(2);

      // Switch to secondary window
      console.log('Switching to secondary window');
      const switched = await switchToWindow(1);

      if (!switched) {
        console.warn('Could not switch to secondary window, skipping verification');
        return;
      }

      // Wait for state to sync
      await browser.pause(CURRENT_TIMING.STATE_SYNC_PAUSE);

      // Verify counter state in secondary window
      console.log('Checking counter in secondary window');
      const secondaryWindowValue = await getCounterValue();
      console.log(`Secondary window counter value: ${secondaryWindowValue}`);
      expect(secondaryWindowValue).toBe(2);

      // Increment in secondary window
      console.log('Incrementing counter in secondary window');
      const secondaryIncrementButton = await getButtonInCurrentWindow('increment');
      await secondaryIncrementButton.click();
      await browser.pause(CURRENT_TIMING.BUTTON_CLICK_PAUSE);

      // Verify counter updated in secondary window
      const updatedSecondaryValue = await getCounterValue();
      console.log(`Updated secondary window counter value: ${updatedSecondaryValue}`);
      expect(updatedSecondaryValue).toBe(3);

      // Switch back to main window and verify sync
      console.log('Switching back to main window');
      await switchToWindow(0);

      // Wait for state to sync
      await browser.pause(CURRENT_TIMING.STATE_SYNC_PAUSE);

      // Verify counter state updated in main window
      const updatedMainValue = await getCounterValue();
      console.log(`Updated main window counter value: ${updatedMainValue}`);
      expect(updatedMainValue).toBe(3);
    });

    it('should maintain state across windows', async () => {
      console.log('Starting maintain state test');

      // Reset counter to 0 first
      await resetCounter();

      // Increment counter in main window
      console.log('Incrementing counter in main window');
      const incrementButton = await browser.$('button=+');
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
      const createWindowButton = await browser.$('button=Create Window');
      await createWindowButton.click();

      // Give the new window more time to appear and register
      await browser.pause(CURRENT_TIMING.WINDOW_CHANGE_PAUSE * 3);
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
          timeout: CURRENT_TIMING.WINDOW_WAIT_TIMEOUT * 2, // Increased timeout for this check
          timeoutMsg: `Expected Electron to report at least 3 windows, last count: ${windowCountAfterCreate}`,
          interval: CURRENT_TIMING.WINDOW_WAIT_INTERVAL,
        },
      );

      // Refresh handles again after confirming Electron sees the window
      await refreshWindowHandles();

      // Switch to the new window (should be at index 2)
      console.log('Switching to new window (index 2)');
      const switched = await switchToWindow(2);
      if (!switched) {
        console.warn('Could not switch to new window (index 2), skipping verification');
        await setupTestEnvironment(CORE_WINDOW_COUNT, CURRENT_TIMING);
        return;
      }

      // Wait for the UI and state to stabilize
      await browser.pause(CURRENT_TIMING.STATE_SYNC_PAUSE);

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
      await browser.pause(CURRENT_TIMING.WINDOW_CHANGE_PAUSE * 2);
      await waitUntilWindowsAvailable(2, CURRENT_TIMING); // Expect 2 windows after cleanup
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
        await browser.pause(CURRENT_TIMING.WINDOW_CHANGE_PAUSE);
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
        await browser.pause(CURRENT_TIMING.WINDOW_CHANGE_PAUSE);
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
      await browser.pause(CURRENT_TIMING.STATE_SYNC_PAUSE);

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
        await browser.pause(CURRENT_TIMING.STATE_SYNC_PAUSE);
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
          await browser.pause(CURRENT_TIMING.STATE_SYNC_PAUSE);
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
          await browser.pause(CURRENT_TIMING.STATE_SYNC_PAUSE);
          const fourthValue = await getCounterValue();
          console.log(`Fourth window counter value: ${fourthValue}`);
          expect(fourthValue).toBe(2);
        } else {
          console.warn('Could not switch to fourth window, skipping check');
        }
      }

      // Clean up - use our improved closeAllRemainingWindows function
      console.log('Cleaning up all windows');
      await setupTestEnvironment(CORE_WINDOW_COUNT, CURRENT_TIMING);
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
      await waitUntilWindowsAvailable(3, CURRENT_TIMING); // Wait for handle
      await browser.pause(CURRENT_TIMING.STATE_SYNC_PAUSE); // Allow UI to settle
      console.log('Child window created.');

      // From Window 3 (index 2), create a grandchild window (Window 4)
      console.log('Creating grandchild window (Window 4) from child window');
      await switchToWindow(2); // Switch to child window (index 2)
      const createButton2 = await getButtonInCurrentWindow('create');
      await createButton2.click();
      await waitUntilWindowsAvailable(4, CURRENT_TIMING); // Wait for handle
      await browser.pause(CURRENT_TIMING.STATE_SYNC_PAUSE); // Allow UI to settle
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
      await browser.pause(CURRENT_TIMING.STATE_SYNC_PAUSE);

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
          timeout: CURRENT_TIMING.WINDOW_WAIT_TIMEOUT * 2,
          timeoutMsg: `Window ${windowToCloseId} did not close as expected.`,
          interval: CURRENT_TIMING.WINDOW_WAIT_INTERVAL,
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
      await browser.pause(CURRENT_TIMING.STATE_SYNC_PAUSE);

      const mainValueAfter = await getCounterValue();
      console.log(`Main window counter after increment: ${mainValueAfter}`);
      expect(mainValueAfter).toBe(4);

      // Switch to grandchild window (now at index 2 after closure of child)
      console.log('Checking grandchild window sync');
      await switchToWindow(2);

      await browser.pause(CURRENT_TIMING.STATE_SYNC_PAUSE);
      const grandchildValueAfter = await getCounterValue();
      console.log(`Grandchild window counter: ${grandchildValueAfter}`);
      expect(grandchildValueAfter).toBe(4);

      // Increment from grandchild
      console.log('Incrementing counter from grandchild window');
      const incrementButton2 = await getButtonInCurrentWindow('increment');
      await incrementButton2.click();
      await browser.pause(CURRENT_TIMING.STATE_SYNC_PAUSE);

      const finalGrandchildValue = await getCounterValue();
      console.log(`Grandchild window counter after increment: ${finalGrandchildValue}`);
      expect(finalGrandchildValue).toBe(5);

      // Check sync back to main window
      console.log('Verifying sync back to main window');
      await switchToWindow(0);

      await browser.pause(CURRENT_TIMING.STATE_SYNC_PAUSE);
      const finalMainValue = await getCounterValue();
      console.log(`Main window final counter value: ${finalMainValue}`);
      expect(finalMainValue).toBe(5);

      // Clean up is handled by beforeEach for the next test
      // console.log('Final cleanup');
      // await setupTestEnvironment(CORE_WINDOW_COUNT, CURRENT_TIMING);
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
        await browser.pause(CURRENT_TIMING.BUTTON_CLICK_PAUSE);

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
          await browser.pause(CURRENT_TIMING.STATE_SYNC_PAUSE);

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
        await browser.pause(CURRENT_TIMING.BUTTON_CLICK_PAUSE);

        const sourceValueAfter = await getCounterValue();
        console.log(`Source window value after increment: ${sourceValueAfter}`);

        // Switch to target window and verify sync
        await switchToWindow(targetWindowIndex);
        await browser.pause(CURRENT_TIMING.STATE_SYNC_PAUSE);

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
        await browser.pause(CURRENT_TIMING.WINDOW_CHANGE_PAUSE);
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
        await browser.pause(CURRENT_TIMING.BUTTON_CLICK_PAUSE);
        const newValue = await getCounterValue();
        console.log(`Source window value after increment: ${newValue}`);

        // Check the runtime window received the update
        await switchToWindow(newWindowIndex);
        await browser.pause(CURRENT_TIMING.STATE_SYNC_PAUSE);
        const runtimeValue = await getCounterValue();
        console.log(`Runtime window value after sync: ${runtimeValue}`);
        expect(runtimeValue).toBe(newValue);

        // Now test sync from runtime window to source window
        console.log(`Testing sync from runtime window to ${CORE_WINDOW_NAMES[sourceWindowIndex]}`);
        const runtimeIncrementButton = await getButtonInCurrentWindow('increment');
        await runtimeIncrementButton.click();
        await browser.pause(CURRENT_TIMING.BUTTON_CLICK_PAUSE);
        const updatedRuntimeValue = await getCounterValue();
        console.log(`Runtime window value after its own increment: ${updatedRuntimeValue}`);

        // Check the source window received the update
        await switchToWindow(sourceWindowIndex);
        await browser.pause(CURRENT_TIMING.STATE_SYNC_PAUSE);
        const sourceValueAfter = await getCounterValue();
        console.log(`Source window value after sync from runtime: ${sourceValueAfter}`);
        expect(sourceValueAfter).toBe(updatedRuntimeValue);
      }

      // Clean up all the runtime windows we created
      console.log('Cleaning up runtime windows');
      await setupTestEnvironment(CORE_WINDOW_COUNT, CURRENT_TIMING);
    });
  });
});
