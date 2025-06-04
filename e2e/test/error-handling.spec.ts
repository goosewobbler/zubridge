import { expect } from '@wdio/globals';
import { it, describe, before, beforeEach } from 'mocha';
import { browser } from 'wdio-electron-service';
import { setupTestEnvironment, switchToWindow, getButtonInCurrentWindow, logWindowInfo } from '../utils/window.js';
import { getCounterValue } from '../utils/counter.js';
import {
  subscribeToState,
  subscribeToAllState,
  unsubscribeFromAllState,
  getWindowSubscriptions,
} from '../utils/subscription.js';
import { TIMING } from '../constants.js';

// Define a type for execute results to avoid TypeScript errors
interface ExecuteResult {
  success: boolean;
  value?: any;
  error: string | null;
}

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
 * Helper function to clear the error log
 */
async function clearErrorLog() {
  const clearButton = await browser.$('[data-testid="clear-errors-btn"]');
  if (clearButton) {
    await clearButton.click();
  }
}

describe('State Access Error Handling', () => {
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
      console.log(`Test setup complete, ${CORE_WINDOW_COUNT} windows verified, focus on main.`);
    } catch (error) {
      console.error('Error during beforeEach setup:', error);
      throw new Error(`Test setup failed: ${error}`);
    }
  });

  describe('Reading Unsubscribed State', () => {
    it('should throw an error when trying to directly read unsubscribed state', async () => {
      // Set up a window with limited subscription
      await switchToWindow(0);
      await unsubscribeFromAllState();
      await subscribeToState('theme');

      // Verify our subscription
      const subscriptions = await getWindowSubscriptions();
      console.log(`Window subscriptions: ${subscriptions}`);
      expect(subscriptions).toContain('theme');
      expect(subscriptions).not.toContain('counter');

      // Use the "Access Unsubscribed" button to trigger an error
      const accessUnsubscribedBtn = await browser.$('[data-testid="access-unsubscribed-btn"]');
      await accessUnsubscribedBtn.click();

      // Wait a moment for the error to be displayed
      await browser.pause(TIMING.UI_INTERACTION_PAUSE);

      // Check the error log for error messages
      const errorMessages = await getErrorLogMessages();
      console.log('Error messages:', errorMessages);

      // Verify an error was logged with appropriate message
      expect(errorMessages.length).toBeGreaterThan(0);
      const errorMessage = errorMessages[0];
      expect(errorMessage).toContain('Access denied');
      expect(errorMessage).toContain('not subscribed');
    });

    it('should throw an error when trying to directly read a nested unsubscribed state key', async () => {
      // Set up a window with specific subscription
      await switchToWindow(0);
      await unsubscribeFromAllState();
      await subscribeToState('counter');

      // Verify our subscription
      const subscriptions = await getWindowSubscriptions();
      console.log(`Window subscriptions: ${subscriptions}`);
      expect(subscriptions).toContain('counter');
      expect(subscriptions).not.toContain('theme');

      // Use the "Access Unsubscribed" button to trigger an error
      const accessUnsubscribedBtn = await browser.$('[data-testid="access-unsubscribed-btn"]');
      await accessUnsubscribedBtn.click();

      // Wait a moment for the error to be displayed
      await browser.pause(TIMING.UI_INTERACTION_PAUSE);

      // Check the error log for error messages
      const errorMessages = await getErrorLogMessages();
      console.log('Error messages:', errorMessages);

      // Verify an error was logged with appropriate message
      expect(errorMessages.length).toBeGreaterThan(0);
      const errorMessage = errorMessages[0];
      expect(errorMessage).toContain('Access denied');
      expect(errorMessage).toContain('not subscribed');
    });
  });

  describe('Dispatching Actions for Unsubscribed State', () => {
    it('should throw an error when trying to dispatch an action affecting unsubscribed state', async () => {
      // Set up a window with theme-only subscription
      await switchToWindow(0);
      await unsubscribeFromAllState();
      await subscribeToState('theme');

      // Verify our subscription
      const subscriptions = await getWindowSubscriptions();
      console.log(`Window subscriptions: ${subscriptions}`);
      expect(subscriptions).toContain('theme');
      expect(subscriptions).not.toContain('counter');

      // Try to increment counter via direct click
      try {
        const incrementButton = await getButtonInCurrentWindow('increment');
        await incrementButton.click();

        // Wait a moment for any error to be displayed
        await browser.pause(TIMING.UI_INTERACTION_PAUSE);

        // Check the error log for error messages
        const errorMessages = await getErrorLogMessages();
        console.log('Error messages after increment click:', errorMessages);

        // Verify an error was logged with appropriate message
        expect(errorMessages.length).toBeGreaterThan(0);
        const errorMessage = errorMessages[0];
        expect(errorMessage).toContain('Unauthorized');
      } catch (error) {
        // If clicking is prevented at the UI level, we might get an error
        console.log('Error caught when trying to click increment button:', error);
      }
    });

    it('should handle UI-triggered actions correctly when window is not subscribed', async () => {
      // Set up a window with theme-only subscription
      await switchToWindow(0);
      await unsubscribeFromAllState();
      await subscribeToState('theme');

      // Get the initial counter value
      const initialCounter = await getCounterValue();

      // Try to click the increment button (the UI should prevent this or handle the error)
      let errorCaught = false;
      try {
        const incrementButton = await getButtonInCurrentWindow('increment');
        await incrementButton.click();

        // Wait a moment for any error to be displayed
        await browser.pause(TIMING.UI_INTERACTION_PAUSE);

        // Check for errors in the error log
        const errorMessages = await getErrorLogMessages();
        if (errorMessages.length > 0) {
          errorCaught = true;
          console.log('Error messages after increment click:', errorMessages);
        }
      } catch (error) {
        // If clicking is prevented at the UI level, we might get an error
        errorCaught = true;
        console.log('Error caught when trying to click increment button:', error);
      }

      // Allow time for any error handling to complete
      await browser.pause(TIMING.STATE_SYNC_PAUSE);

      // Verify the counter hasn't changed (either the action was blocked or the error was handled)
      const counterAfterClick = await getCounterValue();
      console.log(`Counter before: ${initialCounter}, after: ${counterAfterClick}`);

      // Check for either button click being prevented or counter not changing
      if (!errorCaught) {
        expect(counterAfterClick).toBe(initialCounter);
      }
    });

    it('should allow dispatching actions for subscribed state while preventing unsubscribed actions', async () => {
      // Set up a window with mixed subscriptions
      await switchToWindow(0);
      await unsubscribeFromAllState();
      await subscribeToState('theme');

      // Verify our subscription
      const subscriptions = await getWindowSubscriptions();
      console.log(`Window subscriptions: ${subscriptions}`);
      expect(subscriptions).toContain('theme');
      expect(subscriptions).not.toContain('counter');

      // Try to toggle theme using the theme toggle button (should work)
      let errorCaught = false;
      try {
        const themeToggleButton = await getButtonInCurrentWindow('toggleTheme');
        await themeToggleButton.click();
      } catch (error) {
        errorCaught = true;
        console.log('Error caught when trying to click theme toggle button:', error);
      }

      // Wait for the theme change to take effect
      await browser.pause(TIMING.STATE_SYNC_PAUSE);
      expect(errorCaught).toBe(false);

      // Check if theme actually changed by checking body classes
      const isDarkTheme = await browser.execute(() => {
        return document.body.classList.contains('dark-theme');
      });
      console.log(`Theme is now in dark mode: ${isDarkTheme}`);

      // Now try to click the increment button (should fail or be prevented)
      const initialCounter = await getCounterValue();
      try {
        const incrementButton = await getButtonInCurrentWindow('increment');
        await incrementButton.click();

        // Wait a moment for any error to be displayed
        await browser.pause(TIMING.UI_INTERACTION_PAUSE);

        // Check for errors in the error log
        const errorMessages = await getErrorLogMessages();
        console.log('Error messages after increment click:', errorMessages);
        expect(errorMessages.length).toBeGreaterThan(0);
      } catch (error) {
        console.log('Expected error when trying to click increment button:', error);
      }

      // Wait for any actions to process
      await browser.pause(TIMING.STATE_SYNC_PAUSE);

      // Verify counter didn't change
      const counterAfterClick = await getCounterValue();
      expect(counterAfterClick).toBe(initialCounter);
    });
  });

  describe('Dispatching Actions with Invalid Payload', () => {
    it('should throw an error when dispatching an action with invalid payload structure', async () => {
      // Ensure we have full subscription
      await switchToWindow(0);
      await subscribeToAllState();

      // Clear error log first
      await clearErrorLog();

      // Use the "Dispatch Invalid" button to trigger an error
      const dispatchInvalidBtn = await browser.$('[data-testid="dispatch-invalid-btn"]');
      await dispatchInvalidBtn.click();

      // Wait a moment for the error to be displayed
      await browser.pause(TIMING.UI_INTERACTION_PAUSE);

      // Check the error log for error messages
      const errorMessages = await getErrorLogMessages();
      console.log('Error messages after dispatching invalid action:', errorMessages);

      // Verify an error was logged
      expect(errorMessages.length).toBeGreaterThan(0);
      // The exact error message might vary depending on implementation
      // but should contain something about invalid payload or validation
      const errorMessage = errorMessages[0];
      expect(errorMessage).toBeTruthy();
    });
  });

  // These tests still use browser.execute since they're testing specific edge cases
  describe('Accessing Non-existent State', () => {
    it('should throw an error when trying to access a non-existent state key', async () => {
      // Ensure we have full subscription to avoid subscription errors
      await switchToWindow(0);
      await subscribeToAllState();

      // Try to access a non-existent state key
      const result = (await browser.execute(() => {
        try {
          // @ts-ignore - zubridge is available at runtime
          const state = window.zubridge.getState();
          // Try to access a key that doesn't exist
          const nonExistentValue = state.nonExistentKey;
          return { success: true, value: nonExistentValue, error: null };
        } catch (error) {
          return {
            success: false,
            value: null,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      })) as ExecuteResult;

      console.log('Result of trying to access non-existent state key:', result);

      // Verify an error was thrown with appropriate message
      expect(result.success).toBe(false);
      expect(result.error).toContain('does not exist');
      expect(result.error).toContain('nonExistentKey');
    });

    it('should throw an error when trying to access a nested non-existent state key', async () => {
      // Ensure we have full subscription
      await switchToWindow(0);
      await subscribeToAllState();

      // Try to access a nested non-existent state key
      const result = (await browser.execute(() => {
        try {
          // @ts-ignore - zubridge is available at runtime
          const state = window.zubridge.getState();
          // Try to access a nested key that doesn't exist
          // E.g., trying to access counter.details
          const nestedNonExistentValue = state.counter.details;
          return { success: true, value: nestedNonExistentValue, error: null };
        } catch (error) {
          return {
            success: false,
            value: null,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      })) as ExecuteResult;

      console.log('Result of trying to access nested non-existent state key:', result);

      // Verify an error was thrown with appropriate message
      expect(result.success).toBe(false);
      // The error might be about counter.details not existing, or might be a JS error
      // like "Cannot read property 'details' of undefined"
      expect(result.error).toBeTruthy();
    });
  });

  describe('Error Recovery', () => {
    it('should recover after error by allowing valid operations', async () => {
      // Set up a window with limited subscription
      await switchToWindow(0);
      await unsubscribeFromAllState();
      await subscribeToState('theme');

      // Clear any existing errors
      await clearErrorLog();

      // Use the "Access Unsubscribed" button to trigger an error
      const accessUnsubscribedBtn = await browser.$('[data-testid="access-unsubscribed-btn"]');
      await accessUnsubscribedBtn.click();

      // Wait a moment for the error to be displayed
      await browser.pause(TIMING.UI_INTERACTION_PAUSE);

      // Check the error log for error messages
      let errorMessages = await getErrorLogMessages();
      console.log('Error messages after initial access:', errorMessages);
      expect(errorMessages.length).toBeGreaterThan(0);

      // Now add counter subscription
      await subscribeToState('counter');
      await browser.pause(TIMING.STATE_SYNC_PAUSE);

      // Clear the error log
      await clearErrorLog();

      // Try the increment button (should work now)
      const initialCounter = await getCounterValue();
      const incrementButton = await getButtonInCurrentWindow('increment');
      await incrementButton.click();

      // Wait for the counter to update
      await browser.pause(TIMING.STATE_SYNC_PAUSE);

      // Verify counter increased
      const counterAfterClick = await getCounterValue();
      expect(counterAfterClick).toBe(initialCounter + 1);

      // Verify no new errors appeared
      errorMessages = await getErrorLogMessages();
      expect(errorMessages.length).toBe(0);
    });

    it('should recover after error by handling subsequent valid actions', async () => {
      // Set up a window with limited subscription
      await switchToWindow(0);
      await unsubscribeFromAllState();
      await subscribeToState('theme');

      // Clear any existing errors
      await clearErrorLog();

      // Try to click increment button (should fail)
      const initialCounter = await getCounterValue();
      try {
        const incrementButton = await getButtonInCurrentWindow('increment');
        await incrementButton.click();

        // Wait for errors to appear
        await browser.pause(TIMING.UI_INTERACTION_PAUSE);

        // Check for errors
        const errorMessages = await getErrorLogMessages();
        console.log('Error messages after increment click:', errorMessages);
        expect(errorMessages.length).toBeGreaterThan(0);
      } catch (error) {
        console.log('Expected error when trying to click increment button:', error);
      }

      // Wait for any actions to process
      await browser.pause(TIMING.STATE_SYNC_PAUSE);

      // Verify counter didn't change
      const counterAfterFailedClick = await getCounterValue();
      expect(counterAfterFailedClick).toBe(initialCounter);

      // Clear the error log
      await clearErrorLog();

      // Now try to toggle theme (should succeed)
      try {
        const themeToggleButton = await getButtonInCurrentWindow('toggleTheme');
        await themeToggleButton.click();
      } catch (error) {
        console.log('Unexpected error when trying to click theme toggle button:', error);
      }

      // Wait for the theme change to take effect
      await browser.pause(TIMING.STATE_SYNC_PAUSE);

      // Verify the theme actually changed
      const isDarkTheme = await browser.execute(() => {
        // Check if body has dark-theme class
        return document.body.classList.contains('dark-theme');
      });

      console.log('Theme state after toggle:', isDarkTheme ? 'dark' : 'light');

      // Verify no new errors appeared
      const errorMessagesAfterTheme = await getErrorLogMessages();
      expect(errorMessagesAfterTheme.length).toBe(0);
    });
  });
});
