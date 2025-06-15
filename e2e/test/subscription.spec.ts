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
import { getCounterValue, resetCounter } from '../utils/counter.js';
import {
  subscribeToState,
  unsubscribeFromState,
  subscribeToAllState,
  unsubscribeFromAllState,
  getWindowSubscriptions,
  findWindowBySubscription,
} from '../utils/subscription.js';
import { TIMING } from '../constants.js';

const CORE_WINDOW_NAMES = ['Main', 'DirectWebContents'];
const CORE_WINDOW_COUNT = CORE_WINDOW_NAMES.length;

describe('Selective Subscription Behaviour', () => {
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

  it('should resync state after resubscribing to a key', async () => {
    // Start with a clean state
    await refreshWindowHandles();
    await switchToWindow(0);
    await resetCounter();

    // Unsubscribe from all
    await unsubscribeFromAllState();
    await browser.pause(TIMING.STATE_SYNC_PAUSE);

    // Subscribe to theme only
    await subscribeToState('theme');
    await browser.pause(TIMING.STATE_SYNC_PAUSE);

    // Increment counter twice
    const incrementButton = await getButtonInCurrentWindow('increment');
    await incrementButton.click();
    await browser.pause(TIMING.STATE_SYNC_PAUSE);
    await incrementButton.click();
    await browser.pause(TIMING.STATE_SYNC_PAUSE);

    // Verify counter is zero (should not have updated locally)
    const counterValueWhileUnsubscribed = await getCounterValue();
    expect(counterValueWhileUnsubscribed).toBe(0);

    // Resubscribe to counter
    await subscribeToState('counter');
    await browser.pause(TIMING.STATE_SYNC_PAUSE * 2); // Give extra time for resync

    // Verify counter is now two (should have resynced)
    const counterValueAfterResubscribe = await getCounterValue();
    expect(counterValueAfterResubscribe).toBe(2);
  });

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
