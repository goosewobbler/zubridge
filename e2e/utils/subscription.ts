import { browser } from 'wdio-electron-service';
import { TIMING } from '../constants.js';
import { switchToWindow, refreshWindowHandles, windowHandles } from './window.js';
import { getButtonInCurrentWindow } from './window.js';

/**
 * Subscribe to specific state keys using the UI
 */
export async function subscribeToState(keys: string): Promise<void> {
  console.log(`Subscribing to state keys: ${keys}`);

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
export async function unsubscribeFromState(keys: string): Promise<void> {
  console.log(`Unsubscribing from state keys: ${keys}`);

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
export async function subscribeToAllState(): Promise<void> {
  console.log('Subscribing to all state');

  try {
    // Click the Subscribe All button using the helper
    const subscribeAllButton = await getButtonInCurrentWindow('subscribeAll');
    await subscribeAllButton.click();

    // Allow time for subscription to take effect
    await browser.pause(TIMING.STATE_SYNC_PAUSE);

    console.log('Successfully subscribed to all state');
  } catch (error) {
    console.error('Failed to subscribe to all state:', error);

    // Try a second attempt with extra wait time for stability
    console.log('Retrying subscription after additional wait...');

    // Linux-specific: Refresh handles if button not found (sign of corruption)
    if (process.platform === 'linux') {
      const { refreshWindowHandles } = await import('./window.js');
      await refreshWindowHandles();
    }

    await browser.pause(TIMING.STATE_SYNC_PAUSE);

    try {
      const subscribeAllButton = await getButtonInCurrentWindow('subscribeAll');
      await subscribeAllButton.click();
      await browser.pause(TIMING.STATE_SYNC_PAUSE * 2);
      console.log('Successfully subscribed to all state on retry');
    } catch (retryError) {
      console.error('Retry also failed:', retryError);
      throw retryError;
    }
  }
}

/**
 * Unsubscribe from all state using the UI
 */
export async function unsubscribeFromAllState(): Promise<void> {
  console.log('Unsubscribing from all state');

  try {
    // Click the Unsubscribe All button using the helper
    const unsubscribeAllButton = await getButtonInCurrentWindow('unsubscribeAll');
    await unsubscribeAllButton.click();

    // Allow time for unsubscription to take effect
    await browser.pause(TIMING.STATE_SYNC_PAUSE);

    console.log('Successfully unsubscribed from all state');
  } catch (error) {
    console.error('Failed to unsubscribe from all state:', error);

    // Try a second attempt with extra wait time for stability
    console.log('Retrying unsubscription after additional wait...');

    // Linux-specific: Refresh handles if button not found (sign of corruption)
    if (process.platform === 'linux') {
      const { refreshWindowHandles } = await import('./window.js');
      await refreshWindowHandles();
    }

    await browser.pause(TIMING.STATE_SYNC_PAUSE);

    try {
      const unsubscribeAllButton = await getButtonInCurrentWindow('unsubscribeAll');
      await unsubscribeAllButton.click();
      await browser.pause(TIMING.STATE_SYNC_PAUSE * 2);
      console.log('Successfully unsubscribed from all state on retry');
    } catch (retryError) {
      console.error('Retry also failed:', retryError);
      throw retryError;
    }
  }
}

/**
 * Gets the current subscriptions for the current window
 * @returns The subscription text or null if not found
 */
export async function getWindowSubscriptions(): Promise<string | null> {
  const subscriptions = await browser.execute(() => {
    const subscriptionElement = document.querySelector('.header-right span.text-xs');
    return subscriptionElement ? subscriptionElement.textContent : null;
  });
  console.log(`Current window subscriptions: ${subscriptions}`);
  return subscriptions;
}

/**
 * Finds a window with specific subscription status
 * @param subscriptionPattern - A string pattern to match in the subscription text
 * @param excludePattern - Optional string pattern to exclude
 * @returns The window index or null if not found
 */
export async function findWindowBySubscription(
  subscriptionPattern: string,
  excludePattern?: string,
): Promise<number | null> {
  // Refresh window handles to make sure we have the latest
  await refreshWindowHandles();
  console.log(
    `Looking for window with subscription containing "${subscriptionPattern}"${
      excludePattern ? ` and not containing "${excludePattern}"` : ''
    }`,
  );

  // Linux-specific: Add comprehensive debugging
  if (process.platform === 'linux') {
    console.log(`[LINUX DEBUG] Starting subscription search with ${windowHandles.length} windows`);
  }

  // Check each window for the subscription pattern
  for (let i = 0; i < windowHandles.length; i++) {
    await switchToWindow(i);

    // Linux-specific: Add retry logic with corruption handling
    let subs: string | null = null;
    const maxAttempts = process.platform === 'linux' ? 3 : 1;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        subs = await getWindowSubscriptions();

        // If we got valid subscription info, break out of retry loop
        if (subs !== null) break;

        // Linux-specific: If subscription info is null, try refreshing handles
        if (process.platform === 'linux' && attempt < maxAttempts - 1) {
          console.log(
            `[LINUX DEBUG] Attempt ${attempt + 1}: No subscription info for window ${i}, refreshing handles...`,
          );
          await refreshWindowHandles();
          await switchToWindow(i);
          await browser.pause(TIMING.STATE_SYNC_PAUSE);
        }
      } catch (error) {
        console.log(
          `[LINUX DEBUG] Error getting subscriptions for window ${i} (attempt ${attempt + 1}): ${error}`,
        );
        if (process.platform === 'linux' && attempt < maxAttempts - 1) {
          await refreshWindowHandles();
          await browser.pause(TIMING.STATE_SYNC_PAUSE);
        }
      }
    }

    console.log(`Window[${i}] has subscriptions: ${subs}`);

    if (
      subs &&
      subs.includes(subscriptionPattern) &&
      (!excludePattern || !subs.includes(excludePattern))
    ) {
      console.log(`Found matching window at index ${i}`);
      return i;
    }
  }

  // Linux-specific: Enhanced failure reporting
  if (process.platform === 'linux') {
    console.log(
      `[LINUX DEBUG] Subscription search failed. Pattern: "${subscriptionPattern}", Exclude: "${excludePattern || 'none'}"`,
    );
    console.log(`[LINUX DEBUG] Available windows and their subscriptions:`);
    for (let i = 0; i < windowHandles.length; i++) {
      await switchToWindow(i);
      const subs = await getWindowSubscriptions();
      console.log(`[LINUX DEBUG]   Window[${i}]: ${subs}`);
    }
  }

  console.log('No window found with matching subscription pattern');
  return null;
}
