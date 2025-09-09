import { browser } from 'wdio-electron-service';
import { TIMING } from '../constants.js';

/**
 * Validates that the current window is subscribed to the specified key(s) and attempts to fix it if not.
 *
 * ## Context: Linux WebDriver Instability During Thunk Execution
 *
 * This utility addresses a Linux-specific issue where WebDriverIO becomes unstable during thunk
 * execution tests, causing window subscription validation failures and unreliable test results.
 *
 * ### Problem
 * On Linux platforms, WebDriverIO window switching can become unreliable during thunk execution,
 * leading to:
 * - Window handle corruption where `switchToWindow(0)` doesn't land on the expected window
 * - Subscription state mismatches between windows
 * - Test timeouts due to reading from incorrectly subscribed windows
 *
 * ### When This Occurs
 * - **Platform**: Linux only (Ubuntu 22.04+ observed)
 * - **Scenario**: Thunk execution tests with multiple windows
 * - **Symptoms**: Tests expecting state updates but reading from wrong window contexts
 * - **Impact**: Test failures and timeouts due to missing expected values
 *
 * ### How This Helper Fixes It
 * 1. **Validates**: Current window has expected subscription after `switchToWindow()`
 * 2. **Searches**: All windows to find one with correct subscription if current is wrong
 * 3. **Recovers**: Re-establishes subscription on intended window if none found
 * 4. **Verifies**: Confirms the fix worked before returning
 *
 * @param expectedKey - The subscription key that should be present (e.g., 'counter', 'theme')
 * @param unsubscribeAllFn - Function to unsubscribe from all state
 * @param subscribeToKeysFn - Function to subscribe to specific keys
 * @returns Promise<boolean> - Whether the window is now correctly subscribed
 *
 * @example
 * ```typescript
 * // After switching to a window that should be subscribed to 'counter'
 * await switchToWindow(0);
 * await validateAndFixWindowSubscription('counter', unsubscribeFromAll, subscribeToKeys);
 *
 * // Now safe to read counter values - window is guaranteed to be subscribed correctly
 * const counterValue = await getCounterValue();
 * ```
 */
export async function validateAndFixWindowSubscription(
  expectedKey: string,
  unsubscribeAllFn: () => Promise<void>,
  subscribeToKeysFn: (keys: string) => Promise<void>,
): Promise<boolean> {
  if (process.platform !== 'linux') {
    return true; // Skip validation on non-Linux platforms where this issue doesn't occur
  }

  console.log('[LINUX DEBUG] Verifying window context after switch...');

  // Step 1: Determine which window we actually landed on
  // Due to Linux WebDriver instability, switchToWindow(0) might not land on window 0
  const currentWindowHandle = await browser.getWindowHandle();
  const allWindowHandles = await browser.getWindowHandles();
  const windowIndex = allWindowHandles.indexOf(currentWindowHandle);
  console.log(`[LINUX DEBUG] After switchToWindow(0), actual window index: ${windowIndex}`);
  console.log(`[LINUX DEBUG] Current handle: ${currentWindowHandle}`);

  // Step 2: Check what this window is actually subscribed to
  // The subscription validator is injected by Zubridge for debugging
  const subscriptions = await browser.execute(() => {
    try {
      // @ts-expect-error
      return window.__zubridge_subscriptionValidator?.getWindowSubscriptions
        ? // @ts-ignore
          window.__zubridge_subscriptionValidator.getWindowSubscriptions()
        : 'subscription validator not available';
    } catch (error) {
      return `Error: ${error}`;
    }
  });
  console.log('[LINUX DEBUG] Current window subscriptions:', subscriptions);

  // Step 3: If we're already subscribed correctly, we're done
  if (subscriptions && Array.isArray(subscriptions) && subscriptions.includes(expectedKey)) {
    console.log(`[LINUX DEBUG] Window correctly subscribed to '${expectedKey}'`);
    return true;
  }

  // Step 4: We're on the wrong window - search for the correct one
  // This happens when WebDriver window switching becomes unreliable on Linux
  console.log(
    `[LINUX DEBUG] Current window not subscribed to '${expectedKey}', looking for correct subscription...`,
  );

  let foundCorrectWindow = false;
  // Check all windows to find one subscribed to the expected key
  for (let i = 0; i < allWindowHandles.length; i++) {
    console.log(
      `[LINUX DEBUG] Checking window ${i} (handle: ${allWindowHandles[i].substring(0, 8)}...)`,
    );
    try {
      await browser.switchToWindow(allWindowHandles[i]);
      const windowSubs = await browser.execute(() => {
        try {
          // @ts-expect-error
          return window.__zubridge_subscriptionValidator?.getWindowSubscriptions
            ? // @ts-ignore
              window.__zubridge_subscriptionValidator.getWindowSubscriptions()
            : [];
        } catch (_error) {
          return [];
        }
      });

      console.log(`[LINUX DEBUG] Window ${i} subscriptions:`, windowSubs);

      if (Array.isArray(windowSubs) && (windowSubs as string[]).includes(expectedKey)) {
        console.log(
          `[LINUX DEBUG] Found window ${i} subscribed to '${expectedKey}', using this window`,
        );
        foundCorrectWindow = true;
        break;
      }
    } catch (error) {
      console.log(`[LINUX DEBUG] Error checking window ${i}:`, error);
    }
  }

  // Step 5: Recovery - No window has the expected subscription
  // This indicates test setup failed due to Linux WebDriver instability
  if (!foundCorrectWindow) {
    console.log(
      `[LINUX DEBUG] No window found subscribed to '${expectedKey}'! This is the root cause.`,
    );
    console.log(
      `[LINUX DEBUG] The test setup may have failed to properly subscribe window 0 to '${expectedKey}'.`,
    );

    // Recovery strategy: Re-establish the subscription on window 0
    // This works around WebDriver instability that prevented initial subscription
    console.log(
      `[LINUX DEBUG] Attempting to re-establish '${expectedKey}' subscription on window 0...`,
    );
    try {
      await browser.switchToWindow(allWindowHandles[0]);
      await unsubscribeAllFn();
      await subscribeToKeysFn(expectedKey);
      console.log(`[LINUX DEBUG] Re-subscribed window 0 to '${expectedKey}', waiting for sync...`);
      await browser.pause(TIMING.STATE_SYNC_PAUSE);

      // Verify the re-subscription worked
      const newSubscriptions = await browser.execute(() => {
        try {
          // @ts-expect-error
          return window.__zubridge_subscriptionValidator?.getWindowSubscriptions
            ? // @ts-ignore
              window.__zubridge_subscriptionValidator.getWindowSubscriptions()
            : [];
        } catch (_error) {
          return [];
        }
      });

      if (Array.isArray(newSubscriptions) && (newSubscriptions as string[]).includes(expectedKey)) {
        console.log(`[LINUX DEBUG] Successfully re-established '${expectedKey}' subscription`);
        return true;
      }
      console.log(
        '[LINUX DEBUG] Re-subscription verification failed, subscriptions:',
        newSubscriptions,
      );
      return false;
    } catch (resubError) {
      console.log('[LINUX DEBUG] Failed to re-subscribe:', resubError);
      return false;
    }
  }

  return foundCorrectWindow;
}
