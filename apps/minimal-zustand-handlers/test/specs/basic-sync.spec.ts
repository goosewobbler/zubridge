import { expect } from '@wdio/globals';
import { it, describe, before, beforeEach } from 'mocha';
import { browser } from 'wdio-electron-service';
import { setupTestEnvironment, getButtonInCurrentWindow, switchToWindow } from '../utils/window.js';
import { getCounterValue, resetCounter } from '../utils/counter.js';
import { getCurrentTheme, waitForTheme } from '../utils/theme.js';
import { TIMING } from '../utils/constants.js';

console.log(`Using timing configuration for platform: ${process.platform}`);

// Constants for the minimal app windows
const MAIN_WINDOW_INDEX = 0;
const SECONDARY_WINDOW_INDEX = 1;
const EXPECTED_WINDOW_COUNT = 2;

describe('Minimal App Basic Synchronization', () => {
  before(async () => {
    // Minimal apps create two windows: main and secondary
    await setupTestEnvironment(EXPECTED_WINDOW_COUNT);
  });

  beforeEach(async () => {
    console.log('Running beforeEach setup...');
    try {
      // Set up the test environment and reset to known state
      await setupTestEnvironment(EXPECTED_WINDOW_COUNT);
      await resetCounter();
      console.log('beforeEach setup complete, counter reset to 0');
    } catch (error) {
      console.error('Error during beforeEach setup:', error);
      throw new Error(`Test setup failed: ${error}`);
    }
  });

  describe('UI counter operations', () => {
    it('should increment the counter in the UI', async () => {
      const incrementButton = await getButtonInCurrentWindow('increment');

      // Test multiple increments
      await incrementButton.click();
      await browser.pause(TIMING.BUTTON_CLICK_PAUSE);
      expect(await getCounterValue()).toBe(1);

      await incrementButton.click();
      await browser.pause(TIMING.BUTTON_CLICK_PAUSE);
      expect(await getCounterValue()).toBe(2);

      await incrementButton.click();
      await browser.pause(TIMING.BUTTON_CLICK_PAUSE);
      expect(await getCounterValue()).toBe(3);
    });

    it('should decrement the counter in the UI', async () => {
      // First increment to have something to decrement
      const incrementButton = await getButtonInCurrentWindow('increment');
      await incrementButton.click();
      await incrementButton.click();
      await incrementButton.click();
      await browser.pause(TIMING.BUTTON_CLICK_PAUSE);
      expect(await getCounterValue()).toBe(3);

      // Now test decrementing
      const decrementButton = await getButtonInCurrentWindow('decrement');

      await decrementButton.click();
      await browser.pause(TIMING.BUTTON_CLICK_PAUSE);
      expect(await getCounterValue()).toBe(2);

      await decrementButton.click();
      await browser.pause(TIMING.BUTTON_CLICK_PAUSE);
      expect(await getCounterValue()).toBe(1);

      await decrementButton.click();
      await browser.pause(TIMING.BUTTON_CLICK_PAUSE);
      expect(await getCounterValue()).toBe(0);
    });
  });

  describe('UI theme operations', () => {
    it('should toggle the theme in the UI', async () => {
      // Get initial theme
      const initialTheme = await getCurrentTheme();
      console.log(`Initial theme: ${initialTheme}`);

      // Toggle theme
      const themeButton = await getButtonInCurrentWindow('theme-toggle');
      await themeButton.click();
      await browser.pause(TIMING.BUTTON_CLICK_PAUSE);

      // Verify theme changed
      const expectedTheme = initialTheme === 'dark' ? 'light' : 'dark';
      await waitForTheme(expectedTheme);

      const newTheme = await getCurrentTheme();
      expect(newTheme).toBe(expectedTheme);
      console.log(`Theme changed from ${initialTheme} to ${newTheme}`);
    });
  });

  describe('window synchronization', () => {
    it('should sync state changes between main and secondary windows', async () => {
      console.log('Testing state sync between main and secondary windows...');

      // Start in main window (index 0)
      await switchToWindow(MAIN_WINDOW_INDEX);

      // Increment counter in main window
      const incrementButton = await getButtonInCurrentWindow('increment');
      await incrementButton.click();
      await browser.pause(TIMING.BUTTON_CLICK_PAUSE);

      // Verify main window shows counter = 1
      expect(await getCounterValue()).toBe(1);

      // Switch to secondary window
      await switchToWindow(SECONDARY_WINDOW_INDEX);
      await browser.pause(TIMING.STATE_SYNC_PAUSE);

      // Verify secondary window also shows counter = 1
      expect(await getCounterValue()).toBe(1);

      // Increment in secondary window
      const secondaryIncrementButton = await getButtonInCurrentWindow('increment');
      await secondaryIncrementButton.click();
      await browser.pause(TIMING.BUTTON_CLICK_PAUSE);

      // Verify secondary window shows counter = 2
      expect(await getCounterValue()).toBe(2);

      // Switch back to main window
      await switchToWindow(MAIN_WINDOW_INDEX);
      await browser.pause(TIMING.STATE_SYNC_PAUSE);

      // Verify main window also shows counter = 2
      expect(await getCounterValue()).toBe(2);

      console.log('Window synchronization verified');
    });

    it('should sync theme changes between main and secondary windows', async () => {
      console.log('Testing theme sync between main and secondary windows...');

      // Start in main window
      await switchToWindow(MAIN_WINDOW_INDEX);
      const initialTheme = await getCurrentTheme();

      // Toggle theme in main window
      const themeButton = await getButtonInCurrentWindow('theme-toggle');
      await themeButton.click();
      await browser.pause(TIMING.BUTTON_CLICK_PAUSE);

      const expectedTheme = initialTheme === 'dark' ? 'light' : 'dark';
      await waitForTheme(expectedTheme);

      // Switch to secondary window
      await switchToWindow(SECONDARY_WINDOW_INDEX);
      await browser.pause(TIMING.STATE_SYNC_PAUSE);

      // Verify secondary window has the same theme
      expect(await getCurrentTheme()).toBe(expectedTheme);

      console.log(`Theme sync between windows verified: ${initialTheme} -> ${expectedTheme}`);
    });
  });
});
