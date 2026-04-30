import { debug } from '@zubridge/core';
import type { Action } from '@zubridge/types';

// Cache for window subscriptions - updated when getWindowSubscriptions is called
let cachedSubscriptions: string[] = [];
let lastSubscriptionFetchTime = 0;
const SUBSCRIPTION_CACHE_TTL = 1000; // 1 second

type SubscriptionFetcher = () => Promise<string[]>;
let subscriptionFetcher: SubscriptionFetcher | null = null;

/**
 * Wires this validator to the bridge transport. The bridgeClient calls this
 * with a function that invokes the `get_window_subscriptions` Tauri command.
 * Without it, validation falls back to permissive (default-all).
 */
export function setSubscriptionFetcher(fetcher: SubscriptionFetcher | null): void {
  subscriptionFetcher = fetcher;
  cachedSubscriptions = [];
  lastSubscriptionFetchTime = 0;
}

/**
 * Gets the current webview's subscriptions from the backend.
 * @returns Array of state keys this webview is subscribed to, or empty array if none
 */
export async function getWindowSubscriptions(): Promise<string[]> {
  try {
    const now = Date.now();
    if (
      cachedSubscriptions.length > 0 &&
      now - lastSubscriptionFetchTime < SUBSCRIPTION_CACHE_TTL
    ) {
      return cachedSubscriptions;
    }

    if (!subscriptionFetcher) {
      debug('subscription', 'Subscription fetcher not configured; treating as default-all');
      return [];
    }
    const result = await subscriptionFetcher();
    cachedSubscriptions = Array.isArray(result) ? result : [];
    lastSubscriptionFetchTime = now;

    return cachedSubscriptions;
  } catch (error: unknown) {
    debug('subscription:error', 'Error getting window subscriptions:', error);
    return [];
  }
}

export function clearSubscriptionCache(): void {
  cachedSubscriptions = [];
  lastSubscriptionFetchTime = 0;
}

export async function isSubscribedToKey(key: string): Promise<boolean> {
  const subscriptions = await getWindowSubscriptions();

  // Default-all when no explicit subscription is set
  if (subscriptions.length === 0) {
    return true;
  }

  if (subscriptions.includes('*')) {
    return true;
  }

  if (subscriptions.includes(key)) {
    return true;
  }

  // Check if the key is a parent of any subscription (e.g. 'user' includes 'user.profile')
  if (key.includes('.')) {
    const keyParts = key.split('.');
    for (let i = 1; i <= keyParts.length; i++) {
      const parentKey = keyParts.slice(0, i).join('.');
      if (subscriptions.includes(parentKey)) {
        return true;
      }
    }
  }

  for (const subscription of subscriptions) {
    if (key.startsWith(`${subscription}.`)) {
      return true;
    }
  }

  return false;
}

export async function validateStateAccess(key: string, action?: Action): Promise<void> {
  if (!key) return;

  if (action && action.__bypassAccessControl === true) {
    debug(
      'subscription',
      `Access control bypass set on action ${action.type}, bypassing subscription validation for key: ${key}`,
    );
    return;
  }

  const isSubscribed = await isSubscribedToKey(key);

  if (!isSubscribed) {
    const subscriptions = await getWindowSubscriptions();
    throw new Error(
      `Access denied: This webview is not subscribed to state key '${key}'. ` +
        `Current subscriptions: ${subscriptions.join(', ') || 'none'}`,
    );
  }
}

export async function validateStateAccessBatch(keys: string[], action?: Action): Promise<void> {
  if (!keys || keys.length === 0) return;

  if (action && action.__bypassAccessControl === true) {
    debug(
      'subscription',
      `Access control bypass set on action ${action.type}, bypassing subscription validation for keys: ${keys.join(
        ', ',
      )}`,
    );
    return;
  }

  const subscriptions = await getWindowSubscriptions();

  if (subscriptions.length === 0 || subscriptions.includes('*')) {
    return;
  }

  const unauthorizedKeys: string[] = [];

  for (const key of keys) {
    const isSubscribed = await isSubscribedToKey(key);
    if (!isSubscribed) {
      unauthorizedKeys.push(key);
    }
  }

  if (unauthorizedKeys.length > 0) {
    throw new Error(
      `Access denied: This webview is not subscribed to state keys: ${unauthorizedKeys.join(', ')}. ` +
        `Current subscriptions: ${subscriptions.join(', ') || 'none'}`,
    );
  }
}

export function stateKeyExists(state: Record<string, unknown>, key: string): boolean {
  if (!key || !state) return false;

  const parts = key.split('.');
  let current: unknown = state;

  for (const part of parts) {
    if (current === undefined || current === null || typeof current !== 'object') {
      return false;
    }
    if (!(part in (current as Record<string, unknown>))) {
      return false;
    }
    current = (current as Record<string, unknown>)[part];
  }

  return true;
}

export async function validateStateAccessWithExistence(
  state: Record<string, unknown>,
  key: string,
  action?: Action,
): Promise<void> {
  if (!stateKeyExists(state, key)) {
    throw new Error(`State key '${key}' does not exist in the store`);
  }
  await validateStateAccess(key, action);
}
