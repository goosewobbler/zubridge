import { expect } from '@wdio/globals';
import { it, describe, before, beforeEach } from 'mocha';
import { browser } from 'wdio-electron-service';
import { setupTestEnvironment, switchToWindow, getButtonInCurrentWindow } from '../utils/window.js';
import { subscribeToAllState } from '../utils/subscription.js';
import { TIMING } from '../constants.js';

// Names of core windows for easier reference in tests
const CORE_WINDOW_COUNT = 2; // Main and DirectWebContents windows

/**
 * Helper function to get error messages from the error log component
 */
async function getErrorLogMessages() {
  const errorEntries = await browser.$$('[data-testid="error-entry"]');
  const messages = [];

  for (const entry of errorEntries) {
    const messageElement = await entry.$('.text-red-600');
    if (messageElement) {
      const message = await messageElement.getText();
      messages.push(message);
    }
  }

  return messages;
}

/**
 * Helper function to clear the error log using the standardized button selector
 */
async function clearErrorLog() {
  try {
    const clearButton = await getButtonInCurrentWindow('clear-errors-btn');
    await clearButton.click();
  } catch (error) {
    console.log('Error clearing error log:', error);
  }
}

describe('Error Handling', () => {
  before(async () => {
    // Ensure we have the correct number of windows
    await setupTestEnvironment(CORE_WINDOW_COUNT);
  });

  beforeEach(async () => {
    console.log('Running beforeEach setup...');
    try {
      await setupTestEnvironment(CORE_WINDOW_COUNT);
      // Clear error log if it exists
      try {
        await clearErrorLog();
      } catch (error) {
        console.log('No error log to clear yet, continuing...');
      }
      // Make sure we're subscribed to all state to avoid subscription errors
      await switchToWindow(0);
      await subscribeToAllState();

      console.log(`Test setup complete, ${CORE_WINDOW_COUNT} windows verified, focus on main.`);
    } catch (error) {
      console.error('Error during beforeEach setup:', error);
      throw new Error(`Test setup failed: ${error}`);
    }
  });

  describe('Main Process Error Handling', () => {
    it('should handle errors when triggering main process error', async () => {
      await switchToWindow(0);

      // Find and click the error testing button to trigger main process error
      const errorButton = await getButtonInCurrentWindow('trigger-main-error-btn');
      await errorButton.click();

      // Wait for the error to appear in the log
      await browser.pause(TIMING.UI_INTERACTION_PAUSE);

      // Check the error log for error messages
      const errorMessages = await getErrorLogMessages();
      console.log('Error messages:', errorMessages);

      // Verify an error was logged with appropriate message
      expect(errorMessages.length).toBeGreaterThan(0);
      const errorMessage = errorMessages[0];
      expect(errorMessage).toContain('Main process error');
    });
  });

  describe('Serialization Error Handling', () => {
    it('should handle errors when sending invalid payloads', async () => {
      await switchToWindow(0);

      // Find and click the button to dispatch an invalid payload
      const invalidButton = await getButtonInCurrentWindow('dispatch-invalid-btn');
      await invalidButton.click();

      // Wait for the error to appear in the log
      await browser.pause(TIMING.UI_INTERACTION_PAUSE);

      // Check the error log for error messages
      const errorMessages = await getErrorLogMessages();
      console.log('Error messages:', errorMessages);

      // Verify an error was logged with appropriate message
      expect(errorMessages.length).toBeGreaterThan(0);
      const errorMessage = errorMessages[0];
      expect(errorMessage).toBe('Dispatch error: An object could not be cloned.');
    });
  });

  describe('Verify Unsubscribed State', () => {
    it('should validate subscription access correctly', async () => {
      await switchToWindow(0);

      // Find and click the button to verify unsubscribed state
      const verifyButton = await getButtonInCurrentWindow('verify-unsubscribed-btn');
      await verifyButton.click();

      // Wait for the error to appear in the log
      await browser.pause(TIMING.UI_INTERACTION_PAUSE);

      // Check the error log for error messages
      const errorMessages = await getErrorLogMessages();
      console.log('Error messages:', errorMessages);

      // Verify a message was logged with subscription validation
      expect(errorMessages.length).toBeGreaterThan(0);
      const errorMessage = errorMessages[0];
      expect(errorMessage).toContain('Subscription validation');
    });
  });
});
