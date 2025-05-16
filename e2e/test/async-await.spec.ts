import { expect } from '@wdio/globals';
import { it, describe, before } from 'mocha';
import { browser } from 'wdio-electron-service';
import { setupTestEnvironment } from '../utils/window.js';
import { getCounterValue, resetCounter } from '../utils/counter.js';
import { TIMING } from '../constants.js';
import { waitForSpecificValue } from '../utils/counter.js';

// Names of core windows for easier reference in tests
const CORE_WINDOW_NAMES = ['Main', 'DirectWebContents'];
const CORE_WINDOW_COUNT = CORE_WINDOW_NAMES.length;

/**
 * Test suite for verifying proper async action awaiting behavior
 */
describe('Async action awaiting behavior', () => {
  before(async () => {
    try {
      // Use a single function to set up the test environment
      await setupTestEnvironment(CORE_WINDOW_COUNT);
    } catch (error) {
      // If setup fails, try to recover or throw to stop tests
      throw new Error(`Test setup failed: ${error}`);
    }
  });

  /**
   * Test that verifies that async actions (with built-in delays) are properly awaited when using dispatch directly
   */
  it('should properly await async actions using direct dispatch', async () => {
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

    // Click the Slow Object button which uses COUNTER:SET:SLOW directly
    console.log('[ASYNC TEST] Clicking Slow Object button (uses COUNTER:SET:SLOW directly)');
    const slowObjectButton = await browser.$('button=Double (Slow Object)');

    // Record the time before clicking the button
    const timeBeforeClick = new Date();

    // Click the button and wait for the counter to change to 4
    await slowObjectButton.click();

    // Wait for the specific value (4) we expect after doubling
    await waitForSpecificValue(4);

    // Record the time after the counter changed
    const timeAfterChange = new Date();
    const changeDuration = timeAfterChange.getTime() - timeBeforeClick.getTime();

    console.log(`[ASYNC TEST] Counter changed to 4 after ${changeDuration}ms`);

    // The action should have taken at least 2000ms due to the built-in delay
    // This verifies that the UI waits for the async action to complete
    expect(changeDuration).toBeGreaterThan(2000);

    // Verify the final value
    const finalValue = await getCounterValue();
    expect(finalValue).toBe(4);
  });
});
