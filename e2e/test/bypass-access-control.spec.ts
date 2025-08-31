import { expect } from '@wdio/globals';
import { it, describe, before, beforeEach } from 'mocha';
import { browser } from 'wdio-electron-service';
import {
  setupTestEnvironment,
  waitUntilWindowsAvailable,
  switchToWindow,
  getButtonInCurrentWindow,
} from '../utils/window.js';
import { subscribeToState, unsubscribeFromAllState } from '../utils/subscription.js';
import { getCounterValue, resetCounter } from '../utils/counter.js';
import { TIMING } from '../constants.js';
import type {} from '@zubridge/types/app';
import type {} from '@zubridge/types/internal';

// Names of core windows for easier reference in tests
const CORE_WINDOW_COUNT = 2;

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

/**
 * Helper to toggle the bypassAccessControl flag using the UI
 */
async function toggleBypassAccessControl(enable: boolean): Promise<void> {
  // Find the Bypass Access Control button
  const bypassButton = await getButtonInCurrentWindow('bypass-access-control-btn');
  expect(bypassButton).toBeExisting();

  // Check current state
  const isEnabled = await browser.execute(() => {
    return window.bypassFlags?.bypassAccessControl || false;
  });

  // Toggle only if current state doesn't match desired state
  if (isEnabled !== enable) {
    console.log(`${enable ? 'Enabling' : 'Disabling'} bypass access control flag`);
    await bypassButton.click();
    await browser.pause(TIMING.BUTTON_CLICK_PAUSE);

    // Verify the toggle worked
    const newState = await browser.execute(() => {
      return window.bypassFlags?.bypassAccessControl || false;
    });
    expect(newState).toBe(enable);
  } else {
    console.log(`Bypass access control flag already ${enable ? 'enabled' : 'disabled'}`);
  }
}

describe('BypassAccessControl Flag Functionality', () => {
  before(async () => {
    await waitUntilWindowsAvailable(CORE_WINDOW_COUNT);
  });

  beforeEach(async () => {
    try {
      await setupTestEnvironment(CORE_WINDOW_COUNT);

      // Reset counter to a known value
      await resetCounter();

      // Make sure bypass flag is disabled by default
      await toggleBypassAccessControl(false);
    } catch (error) {
      console.error('Error during beforeEach setup:', error);
      throw new Error(`Test setup failed: ${error}`);
    }
  });

  it('should allow thunks to access unsubscribed state when bypassAccessControl is enabled', async () => {
    await switchToWindow(0);

    // First set up limited subscriptions - subscribe to theme only
    try {
      // Unsubscribe from all state first
      await unsubscribeFromAllState();

      // Subscribe to theme only
      await subscribeToState('theme');
    } catch (error) {
      console.error('Error setting up subscriptions:', error);
    }

    // Get initial counter value
    const initialCounter = await getCounterValue();
    console.log(`Initial counter value: ${initialCounter}`);

    // Enable bypassAccessControl
    await toggleBypassAccessControl(true);

    // Clear existing error messages
    await clearErrorLog();

    // Find and click a button that launches a thunk that interacts with counter
    const doubleButton = await getButtonInCurrentWindow('doubleRenderer');
    await doubleButton.click();

    // Wait for the operation to complete
    await browser.pause(TIMING.UI_INTERACTION_PAUSE * 2);

    // Verify the thunk completed without access control errors
    const errorMessages = await getErrorLogMessages();
    console.log('Error messages after thunk:', errorMessages);

    // There should be no error about missing counter
    const hasMissingCounterError = errorMessages.some(
      (msg) =>
        msg.includes('counter is undefined') || msg.includes('Cannot read properties of undefined'),
    );
    expect(hasMissingCounterError).toBe(false);

    // Verify the counter was actually updated by the thunk
    const counterValue = await getCounterValue();
    console.log('Counter value after thunk:', counterValue);
    // The double thunk should have doubled the counter value
    expect(counterValue).toBe(initialCounter * 2);
  });

  it('should fail to update state in thunk when not subscribed and bypassAccessControl is disabled', async () => {
    await switchToWindow(0);

    // First set up limited subscriptions - subscribe to theme only
    try {
      // Unsubscribe from all state first
      await unsubscribeFromAllState();

      // Subscribe to theme only
      await subscribeToState('theme');
    } catch (error) {
      console.error('Error setting up subscriptions:', error);
    }

    // Get initial counter value
    const initialCounter = await getCounterValue();
    console.log(`Initial counter value: ${initialCounter}`);

    // Ensure bypassAccessControl is disabled
    await toggleBypassAccessControl(false);

    // Clear existing error messages
    await clearErrorLog();

    // Find and click a button that launches a thunk that interacts with counter
    const doubleButton = await getButtonInCurrentWindow('doubleRenderer');
    await doubleButton.click();

    // Wait for the operation to complete
    await browser.pause(TIMING.UI_INTERACTION_PAUSE * 2);

    // Verify the thunk failed due to missing counter in state
    const errorMessages = await getErrorLogMessages();
    console.log('Error messages after thunk:', errorMessages);

    // There should be an error about missing counter value
    const hasMissingCounterError = errorMessages.some(
      (msg) =>
        msg.includes('Counter is undefined') || msg.includes('Cannot read properties of undefined'),
    );
    expect(hasMissingCounterError).toBe(true);

    // Verify the counter was NOT updated by the thunk
    const counterValue = await getCounterValue();
    console.log('Counter value after failed thunk:', counterValue);
    expect(counterValue).toBe(initialCounter); // Should remain unchanged
  });

  it('should update counter in subscribed window when using getState override in unsubscribed window', async () => {
    // Set up window 0 with subscription to counter
    await switchToWindow(0);
    await unsubscribeFromAllState();
    await subscribeToState('counter');

    // Get initial counter value in window 0
    const initialCounter = await getCounterValue();
    console.log(`Initial counter value in window 0: ${initialCounter}`);

    // Switch to window 1 and unsubscribe from counter (only subscribe to theme)
    await switchToWindow(1);
    await unsubscribeFromAllState();
    await subscribeToState('theme');

    // Ensure bypassAccessControl is disabled
    await toggleBypassAccessControl(false);

    // Clear existing error messages
    await clearErrorLog();

    // Find and click the getState override button
    const getStateOverrideButton = await getButtonInCurrentWindow('doubleRendererGetStateOverride');
    expect(getStateOverrideButton).toBeExisting();
    await getStateOverrideButton.click();

    // Wait for the operation to complete
    await browser.pause(TIMING.UI_INTERACTION_PAUSE * 2);

    // Verify no errors occurred in window 1
    const errorMessages = await getErrorLogMessages();
    console.log('Error messages after getState override thunk:', errorMessages);

    // There should be no error about missing counter
    const hasMissingCounterError = errorMessages.some(
      (msg) =>
        msg.includes('counter is undefined') || msg.includes('Cannot read properties of undefined'),
    );
    expect(hasMissingCounterError).toBe(false);

    // Switch back to window 0 and verify the counter was updated
    await switchToWindow(0);
    const updatedCounter = await getCounterValue();
    console.log(`Updated counter value in window 0: ${updatedCounter}`);

    // The counter should have been doubled
    expect(updatedCounter).toBe(initialCounter * 2);

    // Now test the inverse - regular thunk should fail
    await switchToWindow(1);
    await clearErrorLog();

    // Find and click the regular renderer thunk button
    const doubleButton = await getButtonInCurrentWindow('doubleRenderer');
    await doubleButton.click();

    // Wait for the operation to complete
    await browser.pause(TIMING.UI_INTERACTION_PAUSE * 2);

    // Verify the thunk failed due to missing counter in state
    const errorMessagesAfterRegularThunk = await getErrorLogMessages();
    console.log('Error messages after regular thunk:', errorMessagesAfterRegularThunk);

    // There should be an error about missing counter value
    const hasErrorAfterRegularThunk = errorMessagesAfterRegularThunk.some(
      (msg) =>
        msg.includes('Counter is undefined') || msg.includes('Cannot read properties of undefined'),
    );
    expect(hasErrorAfterRegularThunk).toBe(true);

    // Switch back to window 0 and verify the counter was NOT updated further
    await switchToWindow(0);
    const counterAfterRegularThunk = await getCounterValue();
    console.log(`Counter value after regular thunk: ${counterAfterRegularThunk}`);

    // The counter should remain at the doubled value from before
    expect(counterAfterRegularThunk).toBe(updatedCounter);
  });
});
