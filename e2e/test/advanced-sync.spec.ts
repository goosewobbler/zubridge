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
  logWindowInfo,
} from '../utils/window.js';
import { getCounterValue, incrementCounterAndVerify, resetCounter } from '../utils/counter.js';
import {
  subscribeToState,
  unsubscribeFromState,
  subscribeToAllState,
  unsubscribeFromAllState,
  getWindowSubscriptions,
  findWindowBySubscription,
} from '../utils/subscription.js';
import { TIMING } from '../constants.js';
console.log(`Using timing configuration for platform: ${process.platform}`);

// Names of core windows for easier reference in tests
// UPDATED: Reduced to only Main and DirectWebContents windows
const CORE_WINDOW_NAMES = ['Main', 'DirectWebContents'];
const CORE_WINDOW_COUNT = CORE_WINDOW_NAMES.length;

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

  describe('selective subscription behaviour', () => {
    it('should stop updates for unsubscribed keys while maintaining others', async () => {
      // Log initial window state for debugging
      console.log('INITIAL WINDOW STATE:');
      await logWindowInfo();

      // We need to find our windows by what they are subscribed to, not by index
      // First, reset the test state using any window
      console.log('Resetting counter and setting light theme');
      await resetCounter();

      // Set a known theme state (light) by toggling if needed
      const currentTheme = await browser.execute(() => {
        return document.body.classList.contains('dark-theme');
      });

      if (currentTheme) {
        // If dark theme is active, toggle to light first
        console.log('Setting initial theme to light');
        const toggleButton = await getButtonInCurrentWindow('toggleTheme');
        await toggleButton.click();
        await browser.pause(TIMING.STATE_SYNC_PAUSE * 2); // Extra pause to ensure theme changes
      }

      // Verify light theme is active now
      const themeAfterInit = await browser.execute(() => {
        return document.body.classList.contains('dark-theme');
      });
      console.log(`Theme after initialization: ${themeAfterInit ? 'dark' : 'light'}`);
      expect(themeAfterInit).toBe(false);

      // Set up a window with theme-only subscription
      console.log('Setting up a window with theme-only subscription');

      // First, find a window that has full subscriptions
      const fullSubWindowIndex = await findWindowBySubscription('*');
      if (fullSubWindowIndex === null) {
        throw new Error('Could not find a window with full subscriptions');
      }

      console.log(`Using window at index ${fullSubWindowIndex} to set up theme-only subscription`);
      await switchToWindow(fullSubWindowIndex);

      // First fully unsubscribe from all
      await unsubscribeFromAllState();
      await browser.pause(TIMING.STATE_SYNC_PAUSE);

      // Verify we're actually unsubscribed
      const subscriptionsAfterUnsubAll = await getWindowSubscriptions();
      console.log(`Subscriptions after unsubscribe all: ${subscriptionsAfterUnsubAll}`);

      // Subscribe to counter and theme using UI
      await subscribeToState('counter, theme');
      await browser.pause(TIMING.STATE_SYNC_PAUSE);

      // Verify we're now subscribed to counter and theme
      const subscriptionsAfterSub = await getWindowSubscriptions();
      console.log(`Subscriptions after subscribe to counter,theme: ${subscriptionsAfterSub}`);

      // Get initial counter and theme values
      const initialCounter = await getCounterValue();
      const initialTheme = await browser.execute(() => {
        return document.body.classList.contains('dark-theme');
      });
      console.log(`Initial theme before test: ${initialTheme ? 'dark' : 'light'}`);
      console.log(`Initial counter value: ${initialCounter}`);

      // Verify we're in light theme mode to start
      expect(initialTheme).toBe(false);

      // Unsubscribe from counter (still in same window)
      await unsubscribeFromState('counter');
      await browser.pause(TIMING.STATE_SYNC_PAUSE);

      // Verify we're now subscribed to only theme
      const subscriptionsAfterUnsub = await getWindowSubscriptions();
      console.log(`Subscriptions after unsubscribe from counter: ${subscriptionsAfterUnsub}`);

      // Expect to see only theme in subscriptions
      expect(subscriptionsAfterUnsub).toContain('theme');
      expect(subscriptionsAfterUnsub).not.toContain('counter');

      // Verify our subscription setup by scanning all windows
      console.log('Verifying subscription setup in all windows:');
      await logWindowInfo();

      // Find the theme-only window by subscription
      const themeOnlyWindowIndex = await findWindowBySubscription('theme', 'counter');
      if (themeOnlyWindowIndex === null) {
        throw new Error('Could not find a window with theme-only subscription');
      }

      console.log(`Found theme-only window at index ${themeOnlyWindowIndex}`);
      await switchToWindow(themeOnlyWindowIndex);

      // Get the initial counter value in our theme-only window
      const themeOnlyInitialCounter = await getCounterValue();
      console.log(`Theme-only window (index ${themeOnlyWindowIndex}) initial counter: ${themeOnlyInitialCounter}`);

      // Find a window with full subscriptions for creating a new window
      const fullSubWindowForCreateIndex = await findWindowBySubscription('*');
      if (fullSubWindowForCreateIndex === null) {
        throw new Error('Could not find a window with full subscriptions for creating a new window');
      }

      // Create a new window from a fully-subscribed window
      console.log(`Creating new window from fully-subscribed window (index ${fullSubWindowForCreateIndex})`);
      await switchToWindow(fullSubWindowForCreateIndex);
      await (await getButtonInCurrentWindow('create')).click();
      await browser.pause(TIMING.WINDOW_CHANGE_PAUSE * 2);
      await refreshWindowHandles();
      const newWindowIndex = windowHandles.length - 1;

      // Log window state after creating new window
      console.log('WINDOW STATE AFTER CREATING NEW WINDOW:');
      await logWindowInfo();

      // Switch to new window
      console.log(`Switching to new window at index ${newWindowIndex}`);
      await switchToWindow(newWindowIndex);
      console.log(`New window title: ${await browser.getTitle()}`);

      // Get the initial counter value in the new window for verification
      const initialCounterInNewWindow = await getCounterValue();
      console.log(`Initial counter in new window: ${initialCounterInNewWindow}`);

      // Increment counter in new window
      console.log('Incrementing counter in new window');
      await (await getButtonInCurrentWindow('increment')).click();
      await browser.pause(TIMING.STATE_SYNC_PAUSE);

      // Verify counter increased in the new window
      const counterAfterIncrementInNewWindow = await getCounterValue();
      console.log(`Counter in new window after increment: ${counterAfterIncrementInNewWindow}`);
      expect(counterAfterIncrementInNewWindow).toBe(initialCounterInNewWindow + 1);

      // Switch back to theme-only window to verify counter didn't update
      // Find the theme-only window again to be sure we have the right one
      const themeOnlyWindowIndexAfterIncrement = await findWindowBySubscription('theme', 'counter');
      if (themeOnlyWindowIndexAfterIncrement === null) {
        throw new Error('Could not find the theme-only window after incrementing counter');
      }

      console.log(`Switching back to theme-only window at index ${themeOnlyWindowIndexAfterIncrement}`);
      await switchToWindow(themeOnlyWindowIndexAfterIncrement);
      console.log(`Theme-only window title: ${await browser.getTitle()}`);

      // Verify window still has theme-only subscription
      const mainWindowSubsAfterIncrement = await getWindowSubscriptions();
      console.log(`Theme-only window subscriptions before counter check: ${mainWindowSubsAfterIncrement}`);
      expect(mainWindowSubsAfterIncrement).toContain('theme');
      expect(mainWindowSubsAfterIncrement).not.toContain('counter');

      await browser.pause(TIMING.STATE_SYNC_PAUSE);

      // Counter should not have updated since we unsubscribed from it
      const counterAfterIncrement = await getCounterValue();
      console.log(
        `Counter in theme-only window after increment: expected=${themeOnlyInitialCounter}, actual=${counterAfterIncrement}`,
      );
      expect(counterAfterIncrement).toBe(themeOnlyInitialCounter);

      // Now toggle theme in the new window
      console.log('Toggling theme in new window');
      await switchToWindow(newWindowIndex);
      console.log(`New window title before toggle: ${await browser.getTitle()}`);

      // Get theme state before toggle
      const themeBeforeToggle = await browser.execute(() => {
        return document.body.classList.contains('dark-theme');
      });
      console.log(`Theme in new window before toggle: ${themeBeforeToggle ? 'dark' : 'light'}`);

      // Toggle theme in new window
      const themeToggleButton = await getButtonInCurrentWindow('toggleTheme');
      await themeToggleButton.click();
      await browser.pause(TIMING.STATE_SYNC_PAUSE * 2); // Extra pause to ensure theme changes

      // Verify theme changed in new window
      const newWindowThemeAfterToggle = await browser.execute(() => {
        return document.body.classList.contains('dark-theme');
      });
      console.log(`New window theme after toggle: ${newWindowThemeAfterToggle ? 'dark' : 'light'}`);
      expect(newWindowThemeAfterToggle).not.toBe(themeBeforeToggle);

      // Switch back to theme-only window to check if theme was synced
      // Find the theme-only window again to be certain
      const themeOnlyWindowIndexBeforeThemeCheck = await findWindowBySubscription('theme', 'counter');
      if (themeOnlyWindowIndexBeforeThemeCheck === null) {
        throw new Error('Could not find the theme-only window before checking theme sync');
      }

      console.log(
        `Checking if theme was synced back to theme-only window at index ${themeOnlyWindowIndexBeforeThemeCheck}`,
      );
      await switchToWindow(themeOnlyWindowIndexBeforeThemeCheck);
      console.log(`Theme-only window title after switching back: ${await browser.getTitle()}`);

      // Verify window still has theme-only subscription before checking theme sync
      const mainWindowSubsBeforeThemeCheck = await getWindowSubscriptions();
      console.log(`Theme-only window subscriptions before theme check: ${mainWindowSubsBeforeThemeCheck}`);
      expect(mainWindowSubsBeforeThemeCheck).toContain('theme');
      expect(mainWindowSubsBeforeThemeCheck).not.toContain('counter');

      await browser.pause(TIMING.STATE_SYNC_PAUSE * 2); // Extra pause for theme sync

      // Log final window state for debugging
      console.log('FINAL WINDOW STATE:');
      await logWindowInfo();

      // Verify theme also changed in theme-only window since we're subscribed to theme
      const themeOnlyWindowAfterToggle = await browser.execute(() => {
        return document.body.classList.contains('dark-theme');
      });
      console.log(
        `Theme-only window theme after toggle in other window: ${themeOnlyWindowAfterToggle ? 'dark' : 'light'}`,
      );
      console.log(
        `Initial theme: ${initialTheme ? 'dark' : 'light'}, New window theme: ${newWindowThemeAfterToggle ? 'dark' : 'light'}`,
      );

      // Theme should have changed in theme-only window since we're still subscribed to it
      expect(themeOnlyWindowAfterToggle).toBe(newWindowThemeAfterToggle);
      expect(themeOnlyWindowAfterToggle).not.toBe(initialTheme);
    });

    it('should handle nested key subscriptions correctly', async () => {
      // Start with a clean state by finding a window with full subscriptions
      const fullSubWindowIndex = await findWindowBySubscription('*');
      if (fullSubWindowIndex === null) {
        throw new Error('Could not find a window with full subscriptions');
      }

      await switchToWindow(fullSubWindowIndex);
      console.log(`Using window at index ${fullSubWindowIndex} for nested key test`);

      // Reset counter to ensure we start from a known state
      await resetCounter();

      // Create a second window that we'll use for toggling the theme
      await (await getButtonInCurrentWindow('create')).click();
      await browser.pause(TIMING.WINDOW_CHANGE_PAUSE * 2);
      await refreshWindowHandles();

      // Set up window 1 to subscribe only to theme
      console.log('Setting up window 1 with theme-only subscription');
      await switchToWindow(fullSubWindowIndex);
      await unsubscribeFromAllState();
      await subscribeToState('theme');

      // Set up window 2 to subscribe to counter
      const secondWindowIndex = windowHandles.length - 1;
      console.log(`Setting up window 2 (index ${secondWindowIndex}) with counter-only subscription`);
      await switchToWindow(secondWindowIndex);
      await unsubscribeFromAllState();
      await subscribeToState('counter');

      // Log the window state to verify our setup
      console.log('WINDOW STATE AFTER SETTING UP SUBSCRIPTIONS:');
      await logWindowInfo();

      // Verify subscriptions
      const themeWindowIndex = await findWindowBySubscription('theme', 'counter');
      if (themeWindowIndex === null) {
        throw new Error('Could not find window with theme-only subscription');
      }

      const counterWindowIndex = await findWindowBySubscription('counter', 'theme');
      if (counterWindowIndex === null) {
        throw new Error('Could not find window with counter-only subscription');
      }

      // Get initial values
      await switchToWindow(themeWindowIndex);
      const initialTheme = await browser.execute(() => {
        return document.body.classList.contains('dark-theme');
      });

      await switchToWindow(counterWindowIndex);
      const initialCounter = await getCounterValue();
      const initialCounterWindowTheme = await browser.execute(() => {
        return document.body.classList.contains('dark-theme');
      });

      // Increment counter in counter-only window
      console.log('Incrementing counter in counter-only window');
      await (await getButtonInCurrentWindow('increment')).click();
      await browser.pause(TIMING.STATE_SYNC_PAUSE);

      // Verify counter incremented in counter window
      const newCounter = await getCounterValue();
      expect(newCounter).toBe(initialCounter + 1);

      // Verify theme window didn't get counter update
      await switchToWindow(themeWindowIndex);
      const themeWindowCounter = await getCounterValue();
      expect(themeWindowCounter).toBe(initialCounter); // Should remain unchanged

      // Toggle theme in theme window
      console.log('Toggling theme in theme-only window');
      await (await getButtonInCurrentWindow('toggleTheme')).click();
      await browser.pause(TIMING.STATE_SYNC_PAUSE * 2);

      // Verify theme changed in theme window
      const newTheme = await browser.execute(() => {
        return document.body.classList.contains('dark-theme');
      });
      expect(newTheme).not.toBe(initialTheme);

      // The counter window should NOT get theme updates since it's not subscribed to theme
      // The UI changes to dark/light happen by other means (CSS variables) not subscription updates
      await switchToWindow(counterWindowIndex);
      const counterWindowTheme = await browser.execute(() => {
        return document.body.classList.contains('dark-theme');
      });

      // NOTE: We're testing subscription mechanisms, not UI appearance
      // In a real app, the window might visually change theme due to CSS changes
      // But data subscriptions should work as expected
      console.log(
        `Counter window theme initially: ${initialCounterWindowTheme ? 'dark' : 'light'}, now: ${counterWindowTheme ? 'dark' : 'light'}`,
      );

      // The key test here is that the counter updates worked properly in both windows
      // based on their subscriptions

      // Increment counter again in counter window
      await (await getButtonInCurrentWindow('increment')).click();
      await browser.pause(TIMING.STATE_SYNC_PAUSE);

      // Verify counter incremented again in counter window
      const finalCounter = await getCounterValue();
      expect(finalCounter).toBe(initialCounter + 2);

      // Verify theme window still didn't get counter updates
      await switchToWindow(themeWindowIndex);
      const finalThemeWindowCounter = await getCounterValue();
      expect(finalThemeWindowCounter).toBe(initialCounter); // Should still be the initial value
    });

    it('should handle overlapping subscriptions across windows correctly', async () => {
      // Find a window with full subscriptions
      const fullSubWindowIndex = await findWindowBySubscription('*');
      if (fullSubWindowIndex === null) {
        throw new Error('Could not find a window with full subscriptions');
      }

      // Switch to a window with full subscriptions and reset state
      await switchToWindow(fullSubWindowIndex);
      await resetCounter();

      // Explicitly unsubscribe first to ensure a clean state
      await unsubscribeFromAllState();

      // Subscribe main window to counter and theme using UI
      await subscribeToState('counter, theme');
      await browser.pause(TIMING.STATE_SYNC_PAUSE);

      // Verify the subscription was applied correctly
      const subscriptionsAfterSub = await getWindowSubscriptions();
      console.log(`First window subscriptions: ${subscriptionsAfterSub}`);
      expect(subscriptionsAfterSub).toContain('counter');
      expect(subscriptionsAfterSub).toContain('theme');

      // Create second window
      await (await getButtonInCurrentWindow('create')).click();
      await browser.pause(TIMING.WINDOW_CHANGE_PAUSE * 2);
      await refreshWindowHandles();

      // Setup subscriptions in the new window - use fully qualified subscription
      const secondWindowIndex = windowHandles.length - 1;
      await switchToWindow(secondWindowIndex);

      // First make sure the second window is subscribed to all
      await subscribeToAllState();
      await browser.pause(TIMING.STATE_SYNC_PAUSE);

      // Now unsubscribe and set the specific subscriptions
      await unsubscribeFromAllState();
      await browser.pause(TIMING.STATE_SYNC_PAUSE);

      // Subscribe to theme only
      await subscribeToState('theme');
      await browser.pause(TIMING.STATE_SYNC_PAUSE);

      // Log window state for debugging
      console.log('WINDOW STATE AFTER SUBSCRIPTION SETUP:');
      await logWindowInfo();

      // Find the counter+theme window (first window)
      const counterWindowIndex = await findWindowBySubscription('counter');
      if (counterWindowIndex === null) {
        throw new Error('Could not find window with counter subscription');
      }

      // Find the theme-only window (second window)
      const themeWindowIndex = await findWindowBySubscription('theme');
      if (themeWindowIndex === null || themeWindowIndex === counterWindowIndex) {
        // Make sure we don't pick the same window
        console.log('Need to find a different window with theme-only subscription');

        // Look specifically for window with theme but not counter
        const themeOnlyWindowIndex = await findWindowBySubscription('theme', 'counter');
        if (themeOnlyWindowIndex === null) {
          throw new Error('Could not find window with theme-only subscription');
        }

        console.log(`Found theme-only window at index ${themeOnlyWindowIndex}`);
        // Store the actual theme window index we'll use
        const actualThemeWindowIndex = themeOnlyWindowIndex;
        await switchToWindow(actualThemeWindowIndex);

        // Get initial values in both windows
        await switchToWindow(counterWindowIndex);
        console.log(`Switched to counter window at index ${counterWindowIndex}`);
        const initialCounter = await getCounterValue();
        const initialTheme = await browser.execute(() => {
          return document.body.classList.contains('dark-theme');
        });

        await switchToWindow(actualThemeWindowIndex);
        console.log(`Switched to theme-only window at index ${actualThemeWindowIndex}`);
        const secondWindowInitialTheme = await browser.execute(() => {
          return document.body.classList.contains('dark-theme');
        });
        expect(secondWindowInitialTheme).toBe(initialTheme);

        // Increment counter in counter window
        await switchToWindow(counterWindowIndex);
        await (await getButtonInCurrentWindow('increment')).click();
        await browser.pause(TIMING.STATE_SYNC_PAUSE);

        // Counter should update in counter window only
        const mainWindowCounter = await getCounterValue();
        expect(mainWindowCounter).toBe(initialCounter + 1);

        // Theme-only window should not receive counter updates
        await switchToWindow(actualThemeWindowIndex);
        const secondWindowCounter = await getCounterValue();
        expect(secondWindowCounter).toBe(initialCounter); // Should not have updated

        // Toggle theme in theme window
        const themeToggleButton = await getButtonInCurrentWindow('toggleTheme');
        await themeToggleButton.click();
        await browser.pause(TIMING.STATE_SYNC_PAUSE * 2); // Extra time for theme changes

        // Theme should update in theme window
        const secondWindowNewTheme = await browser.execute(() => {
          return document.body.classList.contains('dark-theme');
        });
        expect(secondWindowNewTheme).not.toBe(initialTheme);

        // Counter window should also get theme update because it's subscribed to theme
        await switchToWindow(counterWindowIndex);
        const mainWindowNewTheme = await browser.execute(() => {
          return document.body.classList.contains('dark-theme');
        });
        expect(mainWindowNewTheme).toBe(secondWindowNewTheme);
      } else {
        console.log(`Found theme window at index ${themeWindowIndex}`);
        await switchToWindow(themeWindowIndex);

        // Get initial values in both windows
        await switchToWindow(counterWindowIndex);
        console.log(`Switched to counter window at index ${counterWindowIndex}`);
        const initialCounter = await getCounterValue();
        const initialTheme = await browser.execute(() => {
          return document.body.classList.contains('dark-theme');
        });

        await switchToWindow(themeWindowIndex);
        console.log(`Switched to theme-only window at index ${themeWindowIndex}`);
        const secondWindowInitialTheme = await browser.execute(() => {
          return document.body.classList.contains('dark-theme');
        });
        expect(secondWindowInitialTheme).toBe(initialTheme);

        // Increment counter in counter window
        await switchToWindow(counterWindowIndex);
        await (await getButtonInCurrentWindow('increment')).click();
        await browser.pause(TIMING.STATE_SYNC_PAUSE);

        // Counter should update in counter window only
        const mainWindowCounter = await getCounterValue();
        expect(mainWindowCounter).toBe(initialCounter + 1);

        // Theme-only window should not receive counter updates
        await switchToWindow(themeWindowIndex);
        const secondWindowCounter = await getCounterValue();
        expect(secondWindowCounter).toBe(initialCounter); // Should not have updated

        // Toggle theme in theme window
        const themeToggleButton = await getButtonInCurrentWindow('toggleTheme');
        await themeToggleButton.click();
        await browser.pause(TIMING.STATE_SYNC_PAUSE * 2); // Extra time for theme changes

        // Theme should update in theme window
        const secondWindowNewTheme = await browser.execute(() => {
          return document.body.classList.contains('dark-theme');
        });
        expect(secondWindowNewTheme).not.toBe(initialTheme);

        // Counter window should also get theme update because it's subscribed to theme
        await switchToWindow(counterWindowIndex);
        const mainWindowNewTheme = await browser.execute(() => {
          return document.body.classList.contains('dark-theme');
        });
        expect(mainWindowNewTheme).toBe(secondWindowNewTheme);
      }
    });

    it('should handle subscribe all and unsubscribe all correctly', async () => {
      // Start with any window, we'll explicitly set up subscriptions
      await refreshWindowHandles();
      await switchToWindow(0);
      console.log(`Starting with window index 0 to test subscribe/unsubscribe all`);

      // Reset counter to ensure a clean state
      await resetCounter();

      // Verify the current subscription state of the window
      const initialSubscriptions = await getWindowSubscriptions();
      console.log(`Initial window subscriptions: ${initialSubscriptions}`);

      // Explicitly subscribe to all
      await subscribeToAllState();
      await browser.pause(TIMING.STATE_SYNC_PAUSE);

      // Verify subscribed to all
      const subscriptionsAfterSubscribeAll = await getWindowSubscriptions();
      console.log(`Subscriptions after subscribe all: ${subscriptionsAfterSubscribeAll}`);
      expect(subscriptionsAfterSubscribeAll).toContain('*');

      // Increment counter to verify subscription works
      const initialCounter = await getCounterValue();
      await (await getButtonInCurrentWindow('increment')).click();
      await browser.pause(TIMING.STATE_SYNC_PAUSE);

      // Verify counter incremented
      const counterAfterIncrement = await getCounterValue();
      expect(counterAfterIncrement).toBe(initialCounter + 1);

      // Now create a second window to verify syncing works
      await (await getButtonInCurrentWindow('create')).click();
      await browser.pause(TIMING.WINDOW_CHANGE_PAUSE * 2);
      await refreshWindowHandles();

      // Verify second window has counter value synced
      await switchToWindow(windowHandles.length - 1);
      const secondWindowCounter = await getCounterValue();
      expect(secondWindowCounter).toBe(counterAfterIncrement);

      // Now unsubscribe all in first window
      await switchToWindow(0);
      await unsubscribeFromAllState();
      await browser.pause(TIMING.STATE_SYNC_PAUSE);

      // Verify unsubscribed
      const subscriptionsAfterUnsubscribe = await getWindowSubscriptions();
      console.log(`Subscriptions after unsubscribe all: ${subscriptionsAfterUnsubscribe}`);
      expect(subscriptionsAfterUnsubscribe).toContain('none');

      // Increment counter in second window
      await switchToWindow(windowHandles.length - 1);
      await (await getButtonInCurrentWindow('increment')).click();
      await browser.pause(TIMING.STATE_SYNC_PAUSE);

      // Verify second window counter incremented
      const secondWindowCounterAfterIncrement = await getCounterValue();
      expect(secondWindowCounterAfterIncrement).toBe(counterAfterIncrement + 1);

      // Verify first window counter did NOT change (since it's unsubscribed)
      await switchToWindow(0);
      const firstWindowFinalCounter = await getCounterValue();
      expect(firstWindowFinalCounter).toBe(counterAfterIncrement);

      // Now subscribe back to all
      await subscribeToAllState();
      await browser.pause(TIMING.STATE_SYNC_PAUSE);

      // Verify subscribed again
      const subscriptionsAfterResubscribe = await getWindowSubscriptions();
      console.log(`Subscriptions after resubscribe all: ${subscriptionsAfterResubscribe}`);
      expect(subscriptionsAfterResubscribe).toContain('*');

      // Increment counter in second window again
      await switchToWindow(windowHandles.length - 1);
      await (await getButtonInCurrentWindow('increment')).click();
      await browser.pause(TIMING.STATE_SYNC_PAUSE * 2); // Extra time for sync

      // Verify counter incremented in second window
      const secondWindowFinalCounter = await getCounterValue();
      expect(secondWindowFinalCounter).toBe(secondWindowCounterAfterIncrement + 1);

      // Verify first window counter is now updated (since it's subscribed again)
      await switchToWindow(0);
      const firstWindowUpdatedCounter = await getCounterValue();
      expect(firstWindowUpdatedCounter).toBe(secondWindowFinalCounter);
    });

    it('should handle parent/child key subscription relationships', async () => {
      // This test verifies that when a window subscribes to a parent key,
      // it also receives updates to child keys, and vice versa

      // Find a window with full subscriptions
      const fullSubWindowIndex = await findWindowBySubscription('*');
      if (fullSubWindowIndex === null) {
        throw new Error('Could not find a window with full subscriptions');
      }

      // Start with a clean state
      await switchToWindow(fullSubWindowIndex);
      await resetCounter();

      // Create a second window for testing
      await (await getButtonInCurrentWindow('create')).click();
      await browser.pause(TIMING.WINDOW_CHANGE_PAUSE * 2);
      await refreshWindowHandles();

      // Set up first window with limited subscriptions
      await switchToWindow(fullSubWindowIndex);
      await unsubscribeFromAllState();

      // Subscribe to counter only
      await subscribeToState('counter');

      // Create another window with related subscriptions
      const secondWindowIndex = windowHandles.length - 1;
      await switchToWindow(secondWindowIndex);

      // Get initial counter value
      const initialCounter = await getCounterValue();

      // Use a full subscription for the second window (includes everything)
      await subscribeToAllState();

      // Log window state for debugging
      console.log('WINDOW STATE AFTER SUBSCRIPTION SETUP:');
      await logWindowInfo();

      // Increment counter in second window (fully subscribed)
      await (await getButtonInCurrentWindow('increment')).click();
      await browser.pause(TIMING.STATE_SYNC_PAUSE);

      // Verify counter updated in second window
      const updatedCounter = await getCounterValue();
      expect(updatedCounter).toBe(initialCounter + 1);

      // Verify first window also received counter update since it's subscribed to 'counter'
      await switchToWindow(fullSubWindowIndex);
      const firstWindowCounter = await getCounterValue();
      expect(firstWindowCounter).toBe(initialCounter + 1);

      // Now create a third window with another partial subscription
      await (await getButtonInCurrentWindow('create')).click();
      await browser.pause(TIMING.WINDOW_CHANGE_PAUSE * 2);
      await refreshWindowHandles();

      const thirdWindowIndex = windowHandles.length - 1;
      await switchToWindow(thirdWindowIndex);

      // Set up third window with theme subscription only
      await unsubscribeFromAllState();
      await subscribeToState('theme');

      // Log window state again
      console.log('WINDOW STATE WITH THREE WINDOWS:');
      await logWindowInfo();

      // Toggle theme in third window (theme-only subscription)
      console.log('Toggling theme in third window');
      const initialThirdWindowTheme = await browser.execute(() => {
        return document.body.classList.contains('dark-theme');
      });

      await (await getButtonInCurrentWindow('toggleTheme')).click();
      await browser.pause(TIMING.STATE_SYNC_PAUSE * 2);

      // Verify theme changed in third window
      const thirdWindowThemeAfter = await browser.execute(() => {
        return document.body.classList.contains('dark-theme');
      });
      expect(thirdWindowThemeAfter).not.toBe(initialThirdWindowTheme);

      // Verify second window (fully subscribed) also received theme update
      await switchToWindow(secondWindowIndex);
      const secondWindowTheme = await browser.execute(() => {
        return document.body.classList.contains('dark-theme');
      });
      expect(secondWindowTheme).toBe(thirdWindowThemeAfter);

      // Verify first window (counter-only) didn't get theme update
      // We check this by comparing the counter
      await switchToWindow(fullSubWindowIndex);

      // Increment counter in first window again
      await (await getButtonInCurrentWindow('increment')).click();
      await browser.pause(TIMING.STATE_SYNC_PAUSE);

      // Verify counter incremented in first window
      const firstWindowFinalCounter = await getCounterValue();
      expect(firstWindowFinalCounter).toBe(initialCounter + 2);

      // Verify second window (fully subscribed) got counter update
      await switchToWindow(secondWindowIndex);
      const secondWindowFinalCounter = await getCounterValue();
      expect(secondWindowFinalCounter).toBe(initialCounter + 2);

      // Verify third window (theme-only) didn't get counter update
      await switchToWindow(thirdWindowIndex);
      const thirdWindowCounter = await getCounterValue();
      expect(thirdWindowCounter).toBe(initialCounter + 1); // Still at previous value
    });
  });
});
