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
import { waitForSpecificValue, getCounterValue, resetCounter } from '../utils/counter.js';
import { TIMING } from '../constants.js';

console.log(`Using timing configuration for platform: ${process.platform}`);

// Names of core windows for easier reference in tests
// UPDATED: Reduced to only Main and DirectWebContents windows
const CORE_WINDOW_NAMES = ['Main', 'DirectWebContents'];
const CORE_WINDOW_COUNT = CORE_WINDOW_NAMES.length;

describe('Thunk Execution and Behavior', () => {
  before(async () => {
    await waitUntilWindowsAvailable(CORE_WINDOW_COUNT);
  });

  beforeEach(async () => {
    console.log('Running beforeEach setup...');
    try {
      // Use a single function to set up the test environment
      await setupTestEnvironment(CORE_WINDOW_COUNT);
      console.log(`beforeEach setup complete, ${CORE_WINDOW_COUNT} windows verified, focus on main.`);
      // reset counter to 0
      await resetCounter();
      // increment to a known value
      const incrementButton = await getButtonInCurrentWindow('increment');
      await incrementButton.click();
      await browser.pause(TIMING.BUTTON_CLICK_PAUSE);
      await incrementButton.click();
      await browser.pause(TIMING.BUTTON_CLICK_PAUSE);
    } catch (error) {
      console.error('Error during beforeEach setup:', error);
      // If setup fails, try to recover or throw to stop tests
      throw new Error(`Test setup failed: ${error}`);
    }
  });

  describe('basic thunk execution', () => {
    it('should double the counter using a thunk', async () => {
      // Verify counter is at 2
      const initialValue = await getCounterValue();
      expect(initialValue).toBe(2);

      // Click the double button - this should execute the thunk
      console.log('Clicking Double (Renderer Thunk) button to execute async thunk');
      const doubleButton = await getButtonInCurrentWindow('doubleRenderer');
      // Check intermediate value - the behavior should be:
      // 1. First operation multiplies by 2 (4)
      // 2. Second operation multiplies by 2 (8)
      await doubleButton.click();

      // Wait for first expected value (4)
      await waitForSpecificValue(4);
      console.log(`Intermediate counter value: 4`);

      // Wait for second expected value (8)
      await waitForSpecificValue(8);
      console.log(`Intermediate counter value: 8`);

      // Verify final counter value
      // The sequence should be: 2 -> 4 -> 8 -> 4, so expect 4
      await waitForSpecificValue(4);
      console.log(`Final counter value: 4`);

      // Check the final value
      const finalValue = await getCounterValue();
      expect(finalValue).toBe(4);
    });

    it('should double the counter using a main process thunk', async () => {
      // Verify counter is at 2
      const initialValue = await getCounterValue();
      expect(initialValue).toBe(2);

      // Click the main process thunk button
      console.log('Clicking Double (Main Thunk) button to execute main process thunk');
      const mainThunkButton = await getButtonInCurrentWindow('doubleMain');

      // Check intermediate value - the behavior should be:
      // 1. First operation multiplies by 2 (4)
      // 2. Second operation multiplies by 2 (8)
      await mainThunkButton.click();

      // Wait for first expected value (4)
      await waitForSpecificValue(4);
      console.log(`Intermediate counter value (main thunk): 4`);

      // Wait for second expected value (8)
      await waitForSpecificValue(8);
      console.log(`Intermediate counter value (main thunk): 8`);

      // Verify final counter value
      // The sequence should be: 2 -> 4 -> 8 -> 4, so expect 4
      await waitForSpecificValue(4);
      console.log(`Final counter value: 4`);

      // Check the final value
      const finalValue = await getCounterValue();
      expect(finalValue).toBe(4);
    });
  });

  describe('thunk execution order and completion', () => {
    it('should fully await renderer thunk completion before performing subsequent actions in the same window', async () => {
      // Verify counter is at 2
      const initialValue = await getCounterValue();
      console.log(`Initial counter value: ${initialValue}`);
      expect(initialValue).toBe(2);

      // Start the thunk
      console.log('Triggering renderer thunk...');
      const rendererThunkButton = await getButtonInCurrentWindow('doubleRenderer');

      // Kick off the thunk sequence
      rendererThunkButton.click();

      // Wait for thunk to reach its first intermediate value (4)
      await waitForSpecificValue(4);

      // Interrupt the thunk with an increment
      const incrementButton = await getButtonInCurrentWindow('increment');
      await incrementButton.click();
      await browser.pause(TIMING.BUTTON_CLICK_PAUSE);

      // Wait for thunk to continue to its next value (8)
      await waitForSpecificValue(8);

      // Wait for thunk to finish (value 4)
      await waitForSpecificValue(4);

      // Now wait for the increment action to be processed, resulting in 5
      await waitForSpecificValue(5);

      // Verify the final state
      const finalValue = await getCounterValue();
      expect(finalValue).toBe(5);
    });

    it('should fully await main process thunk completion before performing subsequent actions in the same window', async () => {
      // Verify counter is at 2
      const initialValue = await getCounterValue();
      expect(initialValue).toBe(2);

      // Start the thunk
      console.log('Triggering main process thunk...');
      const mainThunkButton = await getButtonInCurrentWindow('doubleMain');

      // Kick off the thunk sequence
      await mainThunkButton.click();

      // Wait for thunk to reach its first intermediate value (4)
      await waitForSpecificValue(4);

      // Interrupt the thunk with an increment
      const incrementButton = await getButtonInCurrentWindow('increment');
      await incrementButton.click();
      await browser.pause(TIMING.BUTTON_CLICK_PAUSE);

      // Wait for thunk to continue to its next value (8)
      await waitForSpecificValue(8);

      // Wait for thunk to finish (value 4)
      await waitForSpecificValue(4);

      // Now wait for the increment action to be processed, resulting in 5
      await waitForSpecificValue(5);

      // Verify the final state
      const finalValue = await getCounterValue();
      expect(finalValue).toBe(5);
    });
  });

  describe('cross-window thunk execution', () => {
    it('should await main process thunk completion even when actions are dispatched from different windows', async () => {
      // Verify counter is at 2
      const initialValue = await getCounterValue();
      expect(initialValue).toBe(2);

      // Create a new window for cross-window testing
      console.log('Creating a second window for cross-window testing');
      const createWindowButton = await getButtonInCurrentWindow('create');
      await createWindowButton.click();
      await browser.pause(TIMING.WINDOW_CHANGE_PAUSE * 2);
      await refreshWindowHandles();

      // Verify we have 3 windows total
      expect(windowHandles.length).toBeGreaterThanOrEqual(3);

      // Start sequence in main window
      console.log('Starting main process thunk in main window...');
      const mainThunkButton = await getButtonInCurrentWindow('doubleMain');
      await mainThunkButton.click();

      // After a small delay, switch to second window and click increment
      await browser.pause(TIMING.BUTTON_CLICK_PAUSE);
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
      await browser.pause(TIMING.THUNK_WAIT_TIME + TIMING.STATE_SYNC_PAUSE);

      // Check final value in second window - should be 5 if properly awaited
      const secondWindowFinalValue = await getCounterValue();
      console.log(`Second window final value: ${secondWindowFinalValue}`);
      expect(secondWindowFinalValue).toBe(5);

      // Switch back to first window and verify same value
      console.log('Switching back to main window to verify sync...');
      await switchToWindow(0);
      await browser.pause(TIMING.STATE_SYNC_PAUSE);

      const mainWindowFinalValue = await getCounterValue();
      console.log(`Main window final value: ${mainWindowFinalValue}`);
      expect(mainWindowFinalValue).toBe(5);

      // Clean up the window we created
      console.log('Cleaning up extra window');
      await setupTestEnvironment(CORE_WINDOW_COUNT);
    });

    it('should await renderer thunk completion even when actions are dispatched from different windows', async () => {
      // Verify counter is at 2
      const initialValue = await getCounterValue();
      expect(initialValue).toBe(2);

      // Create a new window for cross-window testing
      console.log('Creating a second window for cross-window testing');
      const createWindowButton = await getButtonInCurrentWindow('create');
      await createWindowButton.click();
      await browser.pause(TIMING.WINDOW_CHANGE_PAUSE * 2);
      await refreshWindowHandles();

      // Verify we have 3 windows total
      expect(windowHandles.length).toBeGreaterThanOrEqual(3);

      // Start sequence in main window
      console.log('Starting renderer thunk in main window...');
      const rendererThunkButton = await getButtonInCurrentWindow('doubleRenderer');
      await rendererThunkButton.click();

      // After a small delay, switch to second window and click increment
      await browser.pause(TIMING.BUTTON_CLICK_PAUSE);
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
      await browser.pause(TIMING.THUNK_WAIT_TIME + TIMING.STATE_SYNC_PAUSE);

      // Check final value in second window - should be 5 if properly awaited
      const secondWindowFinalValue = await getCounterValue();
      console.log(`Second window final value: ${secondWindowFinalValue}`);
      expect(secondWindowFinalValue).toBe(5);

      // Switch back to first window and verify same value
      console.log('Switching back to main window to verify sync...');
      await switchToWindow(0);
      await browser.pause(TIMING.STATE_SYNC_PAUSE);

      const mainWindowFinalValue = await getCounterValue();
      console.log(`Main window final value: ${mainWindowFinalValue}`);
      expect(mainWindowFinalValue).toBe(5);

      // Clean up the window we created
      console.log('Cleaning up extra window');
      await setupTestEnvironment(CORE_WINDOW_COUNT);
    });
  });

  describe('async action handling in thunks', () => {
    it('should properly wait for async actions to complete in renderer process thunks', async () => {
      // Verify counter is at 2
      const initialValue = await getCounterValue();
      expect(initialValue).toBe(2);

      // Click the Double button which now uses COUNTER:SET:SLOW in its sequence
      console.log('[ASYNC TEST] Clicking Double button which uses SLOW action in its sequence');
      const doubleButton = await getButtonInCurrentWindow('doubleRendererSlow');

      // The first change should happen quickly (regular COUNTER:SET)
      console.log('[ASYNC TEST] Waiting for first counter change (should be fast)');
      await doubleButton.click();

      // Wait for first expected value (4)
      await waitForSpecificValue(4);
      const timeAfterFirstChange = new Date();
      console.log(`[ASYNC TEST] First value change: 4 at ${timeAfterFirstChange.toISOString()}`);

      // The second change should take ~2500ms because of the SLOW action
      console.log('[ASYNC TEST] Waiting for second counter change (should take ~2500ms)');
      const timeBeforeSecondChange = new Date();

      // Wait for second expected value (8)
      await waitForSpecificValue(8);
      const timeAfterSecondChange = new Date();

      const secondChangeDuration = timeAfterSecondChange.getTime() - timeBeforeSecondChange.getTime();
      console.log(`[ASYNC TEST] Second value change: 8 at ${timeAfterSecondChange.toISOString()}`);
      console.log(`[ASYNC TEST] Second change took ${secondChangeDuration}ms`);

      // The slow action should have taken at least 2000ms
      // This is a key verification of our fix - without the fix, the action would complete immediately
      expect(secondChangeDuration).toBeGreaterThan(2000);

      // Final operation - halve the counter
      console.log('[ASYNC TEST] Waiting for third counter change');

      // Wait for final value (4)
      await waitForSpecificValue(4);
      console.log(`[ASYNC TEST] Third value change: 4`);

      // Verify the final value
      const finalValue = await getCounterValue();
      expect(finalValue).toBe(4);
    });

    it('should properly wait for async actions to complete in main process thunks', async () => {
      // Verify counter is at 2
      const initialValue = await getCounterValue();
      expect(initialValue).toBe(2);

      // Click the Double button which now uses COUNTER:SET:SLOW in its sequence
      console.log('[ASYNC TEST] Clicking Double button which uses SLOW action in its sequence');
      const doubleButton = await getButtonInCurrentWindow('doubleMainSlow');

      // The first change should happen quickly (regular COUNTER:SET)
      console.log('[ASYNC TEST] Waiting for first counter change (should be fast)');
      await doubleButton.click();

      // Wait for first expected value (4)
      await waitForSpecificValue(4);
      const timeAfterFirstChange = new Date();
      console.log(`[ASYNC TEST] First value change: 4 at ${timeAfterFirstChange.toISOString()}`);

      // The second change should take ~2500ms because of the SLOW action
      console.log('[ASYNC TEST] Waiting for second counter change (should take ~2500ms)');
      const timeBeforeSecondChange = new Date();

      // Wait for second expected value (8)
      await waitForSpecificValue(8);
      const timeAfterSecondChange = new Date();

      const secondChangeDuration = timeAfterSecondChange.getTime() - timeBeforeSecondChange.getTime();
      console.log(`[ASYNC TEST] Second value change: 8 at ${timeAfterSecondChange.toISOString()}`);
      console.log(`[ASYNC TEST] Second change took ${secondChangeDuration}ms`);

      // The slow action should have taken at least 2000ms
      // This is a key verification of our fix - without the fix, the action would complete immediately
      expect(secondChangeDuration).toBeGreaterThan(2000);

      // Final operation - halve the counter
      console.log('[ASYNC TEST] Waiting for third counter change');

      // Wait for final value (4)
      await waitForSpecificValue(4);
      console.log(`[ASYNC TEST] Third value change: 4`);

      // Verify the final value
      const finalValue = await getCounterValue();
      expect(finalValue).toBe(4);
    });
  });

  describe('concurrent thunk execution', () => {
    it('should process actions sequentially from two renderer slow thunks dispatched from different windows', async () => {
      // Verify counter is at 2
      const initialValue = await getCounterValue();
      expect(initialValue).toBe(2);

      await (await getButtonInCurrentWindow('create')).click();
      await browser.pause(TIMING.WINDOW_CHANGE_PAUSE * 2);
      await refreshWindowHandles();
      expect(windowHandles.length).toBeGreaterThanOrEqual(CORE_WINDOW_COUNT + 1);

      // Dispatch first thunk from window 1
      const rendererSlowThunkButtonWindow1 = await getButtonInCurrentWindow('doubleRendererSlow');
      rendererSlowThunkButtonWindow1.click();

      // Wait for the first thunk to start (counter should change to 4)
      await waitForSpecificValue(4);

      // Immediately switch to window 2 and dispatch the second thunk
      const newWindowIndex = windowHandles.length - 1;
      await switchToWindow(newWindowIndex);
      await browser.pause(TIMING.STATE_SYNC_PAUSE);

      const rendererSlowThunkButtonWindow2 = await getButtonInCurrentWindow('doubleRendererSlow');
      rendererSlowThunkButtonWindow2.click();

      // Sequence: 1 (start)
      // Thunk 1: 4 (first doubling)
      // Thunk 1: 8 (second doubling)
      // Thunk 1: 4 (halving, thunk 1 done)
      // Thunk 2: 8 (first doubling)
      // Thunk 2: 16 (second doubling)
      // Thunk 2: 8 (halving, thunk 2 done)

      await waitForSpecificValue(8); // Thunk 1, second doubling
      await waitForSpecificValue(4); // Thunk 1, halving
      await waitForSpecificValue(8); // Thunk 2, first doubling
      await waitForSpecificValue(16); // Thunk 2, second doubling
      await waitForSpecificValue(8); // Thunk 2, halving

      let finalValueInNewWindow = await getCounterValue();
      expect(finalValueInNewWindow).toBe(8);

      await switchToWindow(0);
      await browser.pause(TIMING.STATE_SYNC_PAUSE);
      let finalValueInMainWindow = await getCounterValue();
      expect(finalValueInMainWindow).toBe(8);
    });

    it('should process actions sequentially from a renderer slow thunk and a main slow thunk dispatched from the same window', async () => {
      // Verify counter is at 2
      const initialValue = await getCounterValue();
      expect(initialValue).toBe(2);

      const rendererSlowThunkButton = await getButtonInCurrentWindow('doubleRendererSlow');
      const mainSlowThunkButton = await getButtonInCurrentWindow('doubleMainSlow');

      // Dispatch the first thunk (renderer)
      rendererSlowThunkButton.click();

      // Wait for the first thunk to start (counter should change to 4)
      await waitForSpecificValue(4);

      // Immediately dispatch the second thunk (main)
      mainSlowThunkButton.click();

      // Sequence: 1 (start)
      // Thunk 1: 4 (first doubling)
      // Thunk 1: 8 (second doubling)
      // Thunk 1: 4 (halving, thunk 1 done)
      // Thunk 2: 8 (first doubling)
      // Thunk 2: 16 (second doubling)
      // Thunk 2: 8 (halving, thunk 2 done)

      await waitForSpecificValue(8); // Thunk 1, second doubling
      await waitForSpecificValue(4); // Thunk 1, halving
      await waitForSpecificValue(8); // Thunk 2, first doubling
      await waitForSpecificValue(16); // Thunk 2, second doubling
      await waitForSpecificValue(8); // Thunk 2, halving

      const finalValue = await getCounterValue();
      expect(finalValue).toBe(8);
    });

    it('should process actions sequentially from two main slow thunks dispatched from different windows', async () => {
      // Verify counter is at 2
      const initialValue = await getCounterValue();
      expect(initialValue).toBe(2);

      // Create a new window for cross-window testing
      await (await getButtonInCurrentWindow('create')).click();
      await browser.pause(TIMING.WINDOW_CHANGE_PAUSE * 2);
      await refreshWindowHandles();
      expect(windowHandles.length).toBeGreaterThanOrEqual(CORE_WINDOW_COUNT + 1);

      // Dispatch first thunk from window 1
      const mainSlowThunkButtonWindow1 = await getButtonInCurrentWindow('doubleMainSlow');
      mainSlowThunkButtonWindow1.click();

      // Wait for the first thunk to start (counter should change to 4)
      await waitForSpecificValue(4);

      // Immediately switch to window 2 and dispatch the second thunk
      const newWindowIndex = windowHandles.length - 1;
      await switchToWindow(newWindowIndex);
      await browser.pause(TIMING.STATE_SYNC_PAUSE);

      const mainSlowThunkButtonWindow2 = await getButtonInCurrentWindow('doubleMainSlow');
      mainSlowThunkButtonWindow2.click();

      // Sequence: 1 (start)
      // Thunk 1: 4 (first doubling)
      // Thunk 1: 8 (second doubling)
      // Thunk 1: 4 (halving, thunk 1 done)
      // Thunk 2: 8 (first doubling)
      // Thunk 2: 16 (second doubling)
      // Thunk 2: 8 (halving, thunk 2 done)

      await waitForSpecificValue(8); // Thunk 1, second doubling
      await waitForSpecificValue(4); // Thunk 1, halving
      await waitForSpecificValue(8); // Thunk 2, first doubling
      await waitForSpecificValue(16); // Thunk 2, second doubling
      await waitForSpecificValue(8); // Thunk 2, halving

      let finalValueInNewWindowCtx = await getCounterValue();
      expect(finalValueInNewWindowCtx).toBe(8);

      await switchToWindow(0);
      await browser.pause(TIMING.STATE_SYNC_PAUSE);
      let finalValueInMainWindowCtx = await getCounterValue();
      expect(finalValueInMainWindowCtx).toBe(8);
    });

    it('should not defer thunks with non-overlapping keys', async () => {
      // Verify counter is at 2
      const initialValue = await getCounterValue();
      expect(initialValue).toBe(2);

      // Create a new window for cross-window testing
      await (await getButtonInCurrentWindow('create')).click();
      await browser.pause(TIMING.WINDOW_CHANGE_PAUSE * 2);
      await refreshWindowHandles();
      expect(windowHandles.length).toBeGreaterThanOrEqual(CORE_WINDOW_COUNT + 1);

      // Subscribe main window to counter only
      await browser.electron.execute((electron) => {
        const mainWindow = electron.BrowserWindow.getAllWindows()[0];
        mainWindow.webContents.send('zubridge:subscribe', ['counter']);
      });

      // Subscribe new window to theme only
      const newWindowIndex = windowHandles.length - 1;
      await browser.electron.execute((electron, idx) => {
        const newWindow = electron.BrowserWindow.getAllWindows()[idx];
        newWindow.webContents.send('zubridge:subscribe', ['theme']);
      }, newWindowIndex);

      // Start a slow thunk in main window that affects counter
      const mainSlowThunkButton = await getButtonInCurrentWindow('doubleMainSlow');
      mainSlowThunkButton.click();

      // Switch to new window and toggle theme - should not be deferred
      await switchToWindow(newWindowIndex);
      const themeToggleButton = await browser.$('button=Toggle Theme');
      const beforeToggleTime = Date.now();
      await themeToggleButton.click();
      const afterToggleTime = Date.now();

      // Theme toggle should complete quickly (under 1 second)
      expect(afterToggleTime - beforeToggleTime).toBeLessThan(1000);

      // Switch back to main window and verify thunk completed
      await switchToWindow(0);
      await waitForSpecificValue(4); // Final value after thunk completes
    });

    it('should not defer actions with non-overlapping keys during thunk execution', async () => {
      // Verify counter is at 2
      const initialValue = await getCounterValue();
      expect(initialValue).toBe(2);

      // Create a new window for cross-window testing
      await (await getButtonInCurrentWindow('create')).click();
      await browser.pause(TIMING.WINDOW_CHANGE_PAUSE * 2);
      await refreshWindowHandles();
      expect(windowHandles.length).toBeGreaterThanOrEqual(CORE_WINDOW_COUNT + 1);

      // Subscribe main window to counter only
      await browser.electron.execute((electron) => {
        const mainWindow = electron.BrowserWindow.getAllWindows()[0];
        mainWindow.webContents.send('zubridge:subscribe', ['counter']);
      });

      // Subscribe new window to theme only
      const newWindowIndex = windowHandles.length - 1;
      await browser.electron.execute((electron, idx) => {
        const newWindow = electron.BrowserWindow.getAllWindows()[idx];
        newWindow.webContents.send('zubridge:subscribe', ['theme']);
      }, newWindowIndex);

      // Start a slow thunk in main window that affects counter
      const mainSlowThunkButton = await getButtonInCurrentWindow('doubleMainSlow');
      mainSlowThunkButton.click();

      // Switch to new window and perform multiple theme toggles - should not be deferred
      await switchToWindow(newWindowIndex);
      const themeToggleButton = await browser.$('button=Toggle Theme');

      const toggleTimes = [];
      for (let i = 0; i < 3; i++) {
        const beforeToggle = Date.now();
        await themeToggleButton.click();
        await browser.pause(100); // Small pause between toggles
        toggleTimes.push(Date.now() - beforeToggle);
      }

      // Each toggle should complete quickly (under 1 second)
      toggleTimes.forEach((time) => {
        expect(time).toBeLessThan(1000);
      });

      // Switch back to main window and verify thunk completed
      await switchToWindow(0);
      await waitForSpecificValue(4); // Final value after thunk completes
    });
  });
});
