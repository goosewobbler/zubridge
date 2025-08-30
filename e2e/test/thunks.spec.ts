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

// Add these helper functions before the describe blocks
/**
 * Subscribe to specific keys using the UI
 */
async function subscribeToKeys(keys: string): Promise<void> {
  console.log(`Subscribing to keys: ${keys}`);

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
async function unsubscribeFromKeys(keys: string): Promise<void> {
  console.log(`Unsubscribing from keys: ${keys}`);

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
async function subscribeToAll(): Promise<void> {
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
async function unsubscribeFromAll(): Promise<void> {
  console.log('Unsubscribing from all state');

  // Click the Unsubscribe All button using the helper
  const unsubscribeAllButton = await getButtonInCurrentWindow('unsubscribeAll');
  await unsubscribeAllButton.click();

  // Allow time for unsubscription to take effect
  await browser.pause(TIMING.STATE_SYNC_PAUSE);
}

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
    it.skip('should fully await renderer thunk completion before performing subsequent actions in the same window', async () => {
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

    it.skip('should fully await main process thunk completion before performing subsequent actions in the same window', async () => {
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
    it.skip('should await main process thunk completion even when actions are dispatched from different windows', async () => {
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

    it.skip('should await renderer thunk completion even when actions are dispatched from different windows', async () => {
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
    it.skip('should properly wait for async actions to complete in renderer process thunks', async () => {
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

    it.skip('should properly wait for async actions to complete in main process thunks', async () => {
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
    it.skip('should process actions sequentially from two renderer slow thunks dispatched from different windows', async () => {
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

      // Sequence: 2 (start)
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

    it.skip('should process actions sequentially from a renderer slow thunk and a main slow thunk dispatched from the same window', async () => {
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

      // Sequence: 2 (start)
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

    it.skip('should process actions sequentially from two main slow thunks dispatched from different windows', async () => {
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

      // Sequence: 2 (start)
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
      console.log(`Initial counter value: ${initialValue}`);
      expect(initialValue).toBe(2);

      // Create a new window for cross-window testing
      await (await getButtonInCurrentWindow('create')).click();
      await browser.pause(TIMING.WINDOW_CHANGE_PAUSE * 2);
      await refreshWindowHandles();
      console.log(`Created new window, total windows: ${windowHandles.length}`);
      expect(windowHandles.length).toBeGreaterThanOrEqual(CORE_WINDOW_COUNT + 1);

      // First unsubscribe from all state in main window
      await switchToWindow(0);
      console.log('Unsubscribing from all state in main window');
      await unsubscribeFromAll();

      // Then subscribe main window to counter only using UI
      console.log('Subscribing main window to counter only');
      await subscribeToKeys('counter');

      // First unsubscribe from all state in new window
      const newWindowIndex = windowHandles.length - 1;
      await switchToWindow(newWindowIndex);
      console.log(`Unsubscribing from all state in window ${newWindowIndex}`);
      await unsubscribeFromAll();

      // Then subscribe new window to theme only using UI
      console.log(`Subscribing window ${newWindowIndex} to theme only`);
      await subscribeToKeys('theme');

      // Switch back to main window
      await switchToWindow(0);
      console.log('Switched back to main window');

      // Linux: Add verification that subscription setup worked correctly
      if (process.platform === 'linux') {
        console.log(`[LINUX DEBUG] Verifying subscription setup...`);

        // Give subscriptions time to fully initialize
        await browser.pause(TIMING.STATE_SYNC_PAUSE);

        // Wait for initial state sync to ensure the subscription is active
        // This prevents the race condition where thunk executes before subscription is established
        await browser.pause(TIMING.STATE_SYNC_PAUSE);

        console.log(`[LINUX DEBUG] Subscription setup complete, ready for thunk execution`);
      }

      // Start a slow thunk in main window that affects counter
      console.log('Starting slow thunk in main window');
      const mainSlowThunkButton = await getButtonInCurrentWindow('doubleMainSlow');

      // Linux: Add verification that button is clickable
      if (process.platform === 'linux') {
        const isDisplayed = await mainSlowThunkButton.isDisplayed();
        const isEnabled = await mainSlowThunkButton.isEnabled();
        const isClickable = await mainSlowThunkButton.isClickable();
        console.log(
          `[LINUX DEBUG] Button state - displayed: ${isDisplayed}, enabled: ${isEnabled}, clickable: ${isClickable}`,
        );

        // Check if window.counter.executeMainThunkSlow is available
        const ipcAvailable = await browser.execute(() => {
          return {
            hasCounter: !!window.counter,
            hasExecuteMainThunkSlow: !!window.counter?.executeMainThunkSlow,
            counterType: typeof window.counter,
          };
        });
        console.log(`[LINUX DEBUG] IPC availability:`, JSON.stringify(ipcAvailable));
      }

      // Capture button click and potential IPC response
      if (process.platform === 'linux') {
        console.log(`[LINUX DEBUG] About to click button - this should trigger IPC call to main process`);
      }

      await mainSlowThunkButton.click();
      console.log('Slow thunk started');

      // Wait briefly to ensure thunk has started
      await browser.pause(TIMING.THUNK_START_PAUSE);

      // Linux: Add extra verification that thunk is progressing
      if (process.platform === 'linux') {
        const afterStartValue = await getCounterValue();
        console.log(`[LINUX DEBUG] Counter value after thunk start: ${afterStartValue}`);

        // Check the thunk manager state to see if locks are preventing execution
        console.log(`[LINUX DEBUG] Checking thunk manager state...`);
        const thunkState = await browser.execute(async () => {
          try {
            // Check what methods are available on window.zubridge
            const zubridgeKeys = window.zubridge ? Object.keys(window.zubridge) : [];
            return { success: true, result: { availableMethods: zubridgeKeys }, error: null };
          } catch (error) {
            return { success: false, result: null, error: String(error) };
          }
        });
        console.log(`[LINUX DEBUG] Available zubridge methods:`, JSON.stringify(thunkState));

        if (thunkState.success && thunkState.result && thunkState.result.availableMethods) {
          console.log(`[LINUX DEBUG] Zubridge methods:`, thunkState.result.availableMethods.join(', '));
        }

        // Linux: Simplified check - just wait for thunk to potentially complete
        console.log(`[LINUX DEBUG] Waiting for main process thunk to complete (~2500ms + buffer)...`);
        await browser.pause(4000);

        const afterWait = await getCounterValue();
        console.log(`[LINUX DEBUG] Counter after 4 second wait: ${afterWait}`);

        if (afterWait === 4) {
          console.log(`[LINUX DEBUG] Thunk completed successfully during wait period`);
          // Continue to the normal test flow - the thunk worked
        } else {
          console.log(`[LINUX DEBUG] Thunk did not complete as expected, current value: ${afterWait}`);
          // Continue anyway - let the normal waitForSpecificValue handle it
        }
      }

      // Switch to new window and toggle theme - should not be deferred
      await switchToWindow(newWindowIndex);
      console.log(`Switched to window ${newWindowIndex} to toggle theme`);
      const themeToggleButton = await getButtonInCurrentWindow('toggleTheme');
      const beforeToggleTime = Date.now();
      await themeToggleButton.click();
      const afterToggleTime = Date.now();
      const toggleDuration = afterToggleTime - beforeToggleTime;
      console.log(`Theme toggle took ${toggleDuration}ms`);

      // Theme toggle should complete quickly (under 1 second)
      expect(toggleDuration).toBeLessThan(1000);

      // Wait briefly to ensure thunk has finished
      await browser.pause(TIMING.THUNK_WAIT_TIME);

      // Switch back to main window and verify thunk completed
      await switchToWindow(0);
      console.log('Switched back to main window to check counter value');

      // Linux: Add additional debugging and more patient waiting
      if (process.platform === 'linux') {
        const currentValue = await getCounterValue();
        console.log(`[LINUX DEBUG] About to wait for value 4, current value is ${currentValue}`);

        if (currentValue === 2) {
          console.log(`[LINUX DEBUG] Counter has not changed from initial value - thunk may not be executing properly`);

          // Wait additional time for main process slow thunk to complete
          console.log(`[LINUX DEBUG] Waiting additional time for main process slow thunk to complete...`);
          await browser.pause(3000);

          const afterExtraWait = await getCounterValue();
          console.log(`[LINUX DEBUG] Counter value after waiting 3000ms: ${afterExtraWait}`);

          if (afterExtraWait === 4) {
            console.log(`[LINUX DEBUG] Thunk completed during wait period! Final value: ${afterExtraWait}`);
            const finalValue = await getCounterValue();
            console.log(`Final counter value: ${finalValue}`);
            expect(finalValue).toBe(4);
            return; // Skip waitForSpecificValue since we already have the right value
          } else if (afterExtraWait === 2) {
            console.log(`[LINUX DEBUG] Thunk still not completed after 3000ms wait`);
            // Continue to waitForSpecificValue which will likely timeout, but at least we've tried
          } else {
            console.log(`[LINUX DEBUG] Unexpected counter value ${afterExtraWait} after wait`);
          }
        }
      }

      // Wait for thunk to complete and check final value
      try {
        await waitForSpecificValue(4); // Final value after thunk completes
        const finalValue = await getCounterValue();
        console.log(`Final counter value: ${finalValue}`);
        expect(finalValue).toBe(4);
      } catch (error) {
        if (process.platform === 'linux') {
          console.log(`[LINUX DEBUG] waitForSpecificValue failed, checking current value...`);
          const currentValue = await getCounterValue();
          console.log(`[LINUX DEBUG] Current value after timeout: ${currentValue}`);
        }
        throw error;
      }
    });

    it('should not defer actions with non-overlapping keys during thunk execution', async () => {
      // Verify counter is at 2
      const initialValue = await getCounterValue();
      console.log(`Initial counter value: ${initialValue}`);
      expect(initialValue).toBe(2);

      // Create a new window for cross-window testing
      await (await getButtonInCurrentWindow('create')).click();
      await browser.pause(TIMING.WINDOW_CHANGE_PAUSE * 2);
      await refreshWindowHandles();
      console.log(`Created new window, total windows: ${windowHandles.length}`);
      expect(windowHandles.length).toBeGreaterThanOrEqual(CORE_WINDOW_COUNT + 1);

      // First unsubscribe from all state in main window
      await switchToWindow(0);
      console.log('Unsubscribing from all state in main window');
      await unsubscribeFromAll();

      // Then subscribe main window to counter only using UI
      console.log('Subscribing main window to counter only');
      await subscribeToKeys('counter');

      // First unsubscribe from all state in new window
      const newWindowIndex = windowHandles.length - 1;
      await switchToWindow(newWindowIndex);
      console.log(`Unsubscribing from all state in window ${newWindowIndex}`);
      await unsubscribeFromAll();

      // Then subscribe new window to theme only using UI
      console.log(`Subscribing window ${newWindowIndex} to theme only`);
      await subscribeToKeys('theme');

      // Switch back to main window
      await switchToWindow(0);
      console.log('Switched back to main window');

      // Linux: Add verification that subscription setup worked correctly
      if (process.platform === 'linux') {
        console.log(`[LINUX DEBUG] Verifying subscription setup...`);

        // Give subscriptions time to fully initialize
        await browser.pause(TIMING.STATE_SYNC_PAUSE);

        // Wait for initial state sync to ensure the subscription is active
        // This prevents the race condition where thunk executes before subscription is established
        await browser.pause(TIMING.STATE_SYNC_PAUSE);

        console.log(`[LINUX DEBUG] Subscription setup complete, ready for thunk execution`);
      }

      // Start a slow thunk in main window that affects counter
      console.log('Starting slow thunk in main window');
      const mainSlowThunkButton = await getButtonInCurrentWindow('doubleMainSlow');
      await mainSlowThunkButton.click();
      console.log('Slow thunk started');

      // Wait briefly to ensure thunk has started
      await browser.pause(TIMING.THUNK_START_PAUSE);

      // Switch to new window and perform multiple theme toggles - should not be deferred
      await switchToWindow(newWindowIndex);
      console.log(`Switched to window ${newWindowIndex} to toggle theme`);
      const themeToggleButton = await getButtonInCurrentWindow('toggleTheme');

      const toggleTimes = [];
      for (let i = 0; i < 3; i++) {
        console.log(`Performing theme toggle ${i + 1}`);
        const beforeToggle = Date.now();
        await themeToggleButton.click();
        const toggleTime = Date.now() - beforeToggle;
        toggleTimes.push(toggleTime);
        console.log(`Theme toggle ${i + 1} took ${toggleTime}ms`);
        await browser.pause(TIMING.BUTTON_CLICK_PAUSE); // Small pause between toggles
      }

      // Each toggle should complete quickly (under 1 second)
      toggleTimes.forEach((time, index) => {
        console.log(`Toggle ${index + 1} time: ${time}ms`);
        expect(time).toBeLessThan(1000);
      });

      // Switch back to main window and verify thunk completed
      await switchToWindow(0);
      console.log('Switched back to main window to check counter value');

      // Check current counter value
      const currentValue = await getCounterValue();
      console.log(`Current counter value: ${currentValue}`);

      // Linux: Add more debugging about thunk state
      if (process.platform === 'linux') {
        console.log(`[LINUX DEBUG] About to wait for value 4, current value is ${currentValue}`);
        if (currentValue === 2) {
          console.log(`[LINUX DEBUG] Counter has not changed from initial value - thunk may not be executing properly`);

          // Since this is a main process slow thunk (~2500ms), let's wait strategically
          console.log(`[LINUX DEBUG] Waiting additional time for main process slow thunk to complete...`);
          await browser.pause(3000); // Wait longer than the 2500ms thunk duration

          const afterLongWait = await getCounterValue();
          console.log(`[LINUX DEBUG] Counter value after waiting 3000ms: ${afterLongWait}`);

          if (afterLongWait !== 2) {
            console.log(`[LINUX DEBUG] Thunk completed during wait period! Final value: ${afterLongWait}`);
            // Update currentValue so the test can proceed with correct expectation
            if (afterLongWait === 4) {
              console.log(`[LINUX DEBUG] Thunk completed successfully, skipping waitForSpecificValue`);
              const finalValue = await getCounterValue();
              console.log(`Final counter value: ${finalValue}`);
              expect(finalValue).toBe(4);
              return; // Skip the waitForSpecificValue call
            }
          } else {
            console.log(`[LINUX DEBUG] Thunk still not completed after 3000ms wait`);
          }
        }
      }

      // Wait for thunk to complete and check final value
      await waitForSpecificValue(4); // Final value after thunk completes
      const finalValue = await getCounterValue();
      console.log(`Final counter value: ${finalValue}`);
      expect(finalValue).toBe(4);
    });
  });
});
