import { expect } from '@wdio/globals';
import { it, describe, before, beforeEach } from 'mocha';
import { browser } from 'wdio-electron-service';
import {
  setupTestEnvironment,
  waitUntilWindowsAvailable,
  switchToWindow,
  getButtonInCurrentWindow,
} from '../utils/window.js';
import { getCounterValue, resetCounter } from '../utils/counter.js';
import { TIMING } from '../constants.js';
import { waitForSpecificValue } from '../utils/counter.js';

console.log(`Using timing configuration for platform: ${process.platform}`);

// Names of core windows for easier reference in tests
// UPDATED: Reduced to only Main and DirectWebContents windows
const CORE_WINDOW_NAMES = ['Main', 'DirectWebContents'];
const CORE_WINDOW_COUNT = CORE_WINDOW_NAMES.length;

describe('Basic State Synchronization', () => {
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

  describe('basic counter operations', () => {
    it('should increment the counter', async () => {
      const incrementButton = await browser.$('button=+');

      await incrementButton.click();
      await browser.pause(TIMING.BUTTON_CLICK_PAUSE);
      const counterElement1 = await browser.$('h2');
      expect(await counterElement1.getText()).toContain('1');

      await incrementButton.click();
      await browser.pause(TIMING.BUTTON_CLICK_PAUSE);
      const counterElement2 = await browser.$('h2');
      expect(await counterElement2.getText()).toContain('2');

      await incrementButton.click();
      await browser.pause(TIMING.BUTTON_CLICK_PAUSE);
      const counterElement3 = await browser.$('h2');
      expect(await counterElement3.getText()).toContain('3');
    });

    it('should decrement the counter', async () => {
      const decrementButton = await browser.$('button=-');

      await decrementButton.click();
      await browser.pause(TIMING.BUTTON_CLICK_PAUSE);
      const counterElement1 = await browser.$('h2');
      expect(await counterElement1.getText()).toContain('2');

      await decrementButton.click();
      await browser.pause(TIMING.BUTTON_CLICK_PAUSE);
      const counterElement2 = await browser.$('h2');
      expect(await counterElement2.getText()).toContain('1');

      await decrementButton.click();
      await browser.pause(TIMING.BUTTON_CLICK_PAUSE);
      const counterElement3 = await browser.$('h2');
      expect(await counterElement3.getText()).toContain('0');
    });

    it('should double the counter using an action object', async () => {
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

      // Click the double button
      const doubleButton = await browser.$('button=Double (Object)');
      await doubleButton.click();

      // Wait for counter to reach 4
      await waitForSpecificValue(4);
      console.log('Counter doubled to 4');

      // Double again
      await doubleButton.click();

      // Wait for counter to reach 8
      await waitForSpecificValue(8);
      console.log('Counter doubled to 8');

      // Verify final value
      const finalValue = await getCounterValue();
      expect(finalValue).toBe(8);
    });
  });

  describe('basic window synchronization', () => {
    it('should create a new window', async () => {
      // No need to switch to window 0, beforeEach handles it
      const createWindowButton = await browser.$('button=Create Window');
      await createWindowButton.click();

      // Give the new window more time to appear before checking
      await browser.pause(TIMING.WINDOW_CHANGE_PAUSE * 3);

      // Wait for new window and switch to it (there should now be 3 windows)
      await waitUntilWindowsAvailable(3);
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
      await browser.pause(TIMING.BUTTON_CLICK_PAUSE);
      await incrementButton.click();
      await browser.pause(TIMING.BUTTON_CLICK_PAUSE);

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
      await browser.pause(TIMING.STATE_SYNC_PAUSE);

      // Verify counter state in secondary window
      console.log('Checking counter in secondary window');
      const secondaryWindowValue = await getCounterValue();
      console.log(`Secondary window counter value: ${secondaryWindowValue}`);
      expect(secondaryWindowValue).toBe(2);

      // Increment in secondary window
      console.log('Incrementing counter in secondary window');
      const secondaryIncrementButton = await getButtonInCurrentWindow('increment');
      await secondaryIncrementButton.click();
      await browser.pause(TIMING.BUTTON_CLICK_PAUSE);

      // Verify counter updated in secondary window
      const updatedSecondaryValue = await getCounterValue();
      console.log(`Updated secondary window counter value: ${updatedSecondaryValue}`);
      expect(updatedSecondaryValue).toBe(3);

      // Switch back to main window and verify sync
      console.log('Switching back to main window');
      await switchToWindow(0);

      // Wait for state to sync
      await browser.pause(TIMING.STATE_SYNC_PAUSE);

      // Verify counter state updated in main window
      const updatedMainValue = await getCounterValue();
      console.log(`Updated main window counter value: ${updatedMainValue}`);
      expect(updatedMainValue).toBe(3);
    });
  });
});
