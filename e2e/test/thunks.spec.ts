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
    } catch (error) {
      console.error('Error during beforeEach setup:', error);
      // If setup fails, try to recover or throw to stop tests
      throw new Error(`Test setup failed: ${error}`);
    }
  });

  describe('basic thunk execution', () => {
    it('should double the counter using a thunk', async () => {
      // First, increment to a known value
      await resetCounter();
      const incrementButton = await browser.$('button=+');
      await incrementButton.click();
      await browser.pause(TIMING.BUTTON_CLICK_PAUSE);
      await incrementButton.click();
      await browser.pause(TIMING.BUTTON_CLICK_PAUSE);

      // Verify counter is at 2
      const initialValue = await getCounterValue();
      expect(initialValue).toBe(2);

      // Click the double button - this should execute the thunk
      console.log('Clicking Double (Renderer Thunk) button to execute async thunk');
      const doubleButton = await browser.$('button=Double (Renderer Thunk)');
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
      // First, increment to a known value
      await resetCounter();
      const incrementButton = await browser.$('button=+');
      await incrementButton.click();
      await browser.pause(TIMING.BUTTON_CLICK_PAUSE);
      await incrementButton.click();
      await browser.pause(TIMING.BUTTON_CLICK_PAUSE);

      // Verify counter is at 2
      const initialValue = await getCounterValue();
      expect(initialValue).toBe(2);

      // Click the main process thunk button
      console.log('Clicking Double (Main Thunk) button to execute main process thunk');
      const mainThunkButton = await browser.$('button=Double (Main Thunk)');

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
      // Reset counter to start fresh
      await resetCounter();

      // Increment to a known value (2)
      const incrementButton = await browser.$('button=+');
      await incrementButton.click();
      await browser.pause(TIMING.BUTTON_CLICK_PAUSE);
      await incrementButton.click();
      await browser.pause(TIMING.BUTTON_CLICK_PAUSE);

      // Verify counter is at 2
      const initialValue = await getCounterValue();
      console.log(`Initial counter value: ${initialValue}`);
      expect(initialValue).toBe(2);

      // Start the thunk
      console.log('Triggering renderer thunk...');
      const rendererThunkButton = await browser.$('button=Double (Renderer Thunk)');

      // Kick off the thunk sequence
      rendererThunkButton.click();

      // Wait for thunk to reach its first intermediate value (4)
      await waitForSpecificValue(4);

      // Interrupt the thunk with an increment
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
      // Reset counter to start fresh
      await resetCounter();

      // Increment to a known value (2)
      const incrementButton = await browser.$('button=+');
      await incrementButton.click();
      await browser.pause(TIMING.BUTTON_CLICK_PAUSE);
      await incrementButton.click();
      await browser.pause(TIMING.BUTTON_CLICK_PAUSE);

      // Verify counter is at 2
      const initialValue = await getCounterValue();
      expect(initialValue).toBe(2);

      // Start the thunk
      console.log('Triggering main process thunk...');
      const mainThunkButton = await browser.$('button=Double (Main Thunk)');

      // Kick off the thunk sequence
      await mainThunkButton.click();

      // Wait for thunk to reach its first intermediate value (4)
      await waitForSpecificValue(4);

      // Interrupt the thunk with an increment
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
      console.log('Starting cross-window main process thunk test');

      // Reset counter to start fresh
      await resetCounter();

      // Increment to a known value (2)
      const incrementButton = await browser.$('button=+');
      await incrementButton.click();
      await browser.pause(TIMING.BUTTON_CLICK_PAUSE);
      await incrementButton.click();
      await browser.pause(TIMING.BUTTON_CLICK_PAUSE);

      // Verify counter is at 2
      const initialValue = await getCounterValue();
      expect(initialValue).toBe(2);

      // Create a new window for cross-window testing
      console.log('Creating a second window for cross-window testing');
      const createWindowButton = await browser.$('button=Create Window');
      await createWindowButton.click();
      await browser.pause(TIMING.WINDOW_CHANGE_PAUSE * 2);
      await refreshWindowHandles();

      // Verify we have 3 windows total
      expect(windowHandles.length).toBeGreaterThanOrEqual(3);

      // Start sequence in main window
      console.log('Starting main process thunk in main window...');
      const mainThunkButton = await browser.$('button=Double (Main Thunk)');
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
      console.log('Starting cross-window renderer thunk test');

      // Reset counter to start fresh
      await resetCounter();

      // Increment to a known value (2)
      const incrementButton = await browser.$('button=+');
      await incrementButton.click();
      await browser.pause(TIMING.BUTTON_CLICK_PAUSE);
      await incrementButton.click();
      await browser.pause(TIMING.BUTTON_CLICK_PAUSE);

      // Verify counter is at 2
      const initialValue = await getCounterValue();
      expect(initialValue).toBe(2);

      // Create a new window for cross-window testing
      console.log('Creating a second window for cross-window testing');
      const createWindowButton = await browser.$('button=Create Window');
      await createWindowButton.click();
      await browser.pause(TIMING.WINDOW_CHANGE_PAUSE * 2);
      await refreshWindowHandles();

      // Verify we have 3 windows total
      expect(windowHandles.length).toBeGreaterThanOrEqual(3);

      // Start sequence in main window
      console.log('Starting renderer thunk in main window...');
      const rendererThunkButton = await browser.$('button=Double (Renderer Thunk)');
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
      // Reset counter to start fresh
      await resetCounter();

      // Increment to a known value (2)
      const incrementButton = await browser.$('button=+');
      await incrementButton.click();
      await browser.pause(TIMING.BUTTON_CLICK_PAUSE);
      await incrementButton.click();
      await browser.pause(TIMING.BUTTON_CLICK_PAUSE);

      // Verify counter is at 2
      const initialValue = await getCounterValue();
      expect(initialValue).toBe(2);

      // Click the Double button which now uses COUNTER:SET:SLOW in its sequence
      console.log('[ASYNC TEST] Clicking Double button which uses SLOW action in its sequence');
      const doubleButton = await browser.$('button=Double (Renderer Slow Thunk)');

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
      // Reset counter to start fresh
      await resetCounter();

      // Increment to a known value (2)
      const incrementButton = await browser.$('button=+');
      await incrementButton.click();
      await browser.pause(TIMING.BUTTON_CLICK_PAUSE);
      await incrementButton.click();
      await browser.pause(TIMING.BUTTON_CLICK_PAUSE);

      // Verify counter is at 2
      const initialValue = await getCounterValue();
      expect(initialValue).toBe(2);

      // Click the Double button which now uses COUNTER:SET:SLOW in its sequence
      console.log('[ASYNC TEST] Clicking Double button which uses SLOW action in its sequence');
      const doubleButton = await browser.$('button=Double (Main Slow Thunk)');

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
    beforeEach(async () => {
      await setupTestEnvironment(CORE_WINDOW_COUNT);
      await resetCounter();
    });

    it('should process actions sequentially from two renderer slow thunks dispatched from different windows', async () => {
      console.log('Test: Concurrent renderer slow thunks (different windows) - expecting sequential processing');
      await (await browser.$('button=+')).click(); // Counter to 1
      await browser.pause(TIMING.BUTTON_CLICK_PAUSE);
      await waitForSpecificValue(1);

      await (await browser.$('button=Create Window')).click();
      await browser.pause(TIMING.WINDOW_CHANGE_PAUSE * 2);
      await refreshWindowHandles();
      expect(windowHandles.length).toBeGreaterThanOrEqual(CORE_WINDOW_COUNT + 1);

      const rendererSlowThunkButtonWindow1 = await browser.$('button=Double (Renderer Slow Thunk)');
      rendererSlowThunkButtonWindow1.click();

      const newWindowIndex = windowHandles.length - 1;
      await switchToWindow(newWindowIndex);
      await browser.pause(TIMING.STATE_SYNC_PAUSE);

      const rendererSlowThunkButtonWindow2 = await getButtonInCurrentWindow('doubleRendererSlow');
      rendererSlowThunkButtonWindow2.click();

      await browser.pause(TIMING.THUNK_WAIT_TIME * 2.5);

      let finalValueInNewWindow = await getCounterValue();
      console.log(`Final counter value in New Window: ${finalValueInNewWindow}`);
      expect(finalValueInNewWindow).toBe(4);

      await switchToWindow(0);
      await browser.pause(TIMING.STATE_SYNC_PAUSE);
      let finalValueInMainWindow = await getCounterValue();
      console.log(`Final counter value in Main Window: ${finalValueInMainWindow}`);
      expect(finalValueInMainWindow).toBe(4);
      console.log('Result: Concurrent renderer thunks (different windows) processed sequentially.');
    });

    it('should process actions sequentially from a renderer slow thunk and a main slow thunk dispatched from the same window', async () => {
      console.log('Test: Concurrent renderer and main slow thunks (same window) - expecting sequential processing');
      await (await browser.$('button=+')).click(); // Counter to 1
      await browser.pause(TIMING.BUTTON_CLICK_PAUSE);
      await waitForSpecificValue(1);

      const rendererSlowThunkButton = await browser.$('button=Double (Renderer Slow Thunk)');
      const mainSlowThunkButton = await browser.$('button=Double (Main Slow Thunk)');

      rendererSlowThunkButton.click();
      mainSlowThunkButton.click();

      await browser.pause(TIMING.THUNK_WAIT_TIME * 2.5);

      const finalValue = await getCounterValue();
      console.log(`Final counter value: ${finalValue}`);
      expect(finalValue).toBe(4);
      console.log('Result: Concurrent renderer/main thunks (same window) processed sequentially.');
    });

    it('should process actions sequentially from two main slow thunks dispatched from different windows', async () => {
      console.log('Test: Concurrent main slow thunks (different windows) - expecting sequential processing');
      await (await browser.$('button=+')).click(); // Counter to 1
      await browser.pause(TIMING.BUTTON_CLICK_PAUSE);
      await waitForSpecificValue(1);

      await (await browser.$('button=Create Window')).click();
      await browser.pause(TIMING.WINDOW_CHANGE_PAUSE * 2);
      await refreshWindowHandles();
      expect(windowHandles.length).toBeGreaterThanOrEqual(CORE_WINDOW_COUNT + 1);

      const mainSlowThunkButtonWindow1 = await browser.$('button=Double (Main Slow Thunk)');
      mainSlowThunkButtonWindow1.click();

      const newWindowIndex = windowHandles.length - 1;
      await switchToWindow(newWindowIndex);
      await browser.pause(TIMING.STATE_SYNC_PAUSE);

      const mainSlowThunkButtonWindow2 = await getButtonInCurrentWindow('doubleMainSlow');
      mainSlowThunkButtonWindow2.click();

      await browser.pause(TIMING.THUNK_WAIT_TIME * 2.5);

      let finalValueInNewWindowCtx = await getCounterValue();
      console.log(`Final counter value in New Window: ${finalValueInNewWindowCtx}`);
      expect(finalValueInNewWindowCtx).toBe(4);

      await switchToWindow(0);
      await browser.pause(TIMING.STATE_SYNC_PAUSE);
      let finalValueInMainWindowCtx = await getCounterValue();
      console.log(`Final counter value in Main Window: ${finalValueInMainWindowCtx}`);
      expect(finalValueInMainWindowCtx).toBe(4);
      console.log('Result: Concurrent main thunks (different windows) processed sequentially.');
    });
  });
});
