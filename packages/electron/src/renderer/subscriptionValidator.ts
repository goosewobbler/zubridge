import { debug } from '@zubridge/core';
import type { Action } from '@zubridge/types';

// Cache for window subscriptions - updated when getWindowSubscriptions is called
let cachedSubscriptions: string[] = [];
let lastSubscriptionFetchTime = 0;
const SUBSCRIPTION_CACHE_TTL = 1000; // 1 second

// Access the subscription validator API exposed through the preload script
const getSubscriptionAPI = () => {
  if (typeof window !== 'undefined' && window.__zubridge_subscriptionValidator) {
    return window.__zubridge_subscriptionValidator;
  }
  return null;
};

/**
 * Gets the current window's subscriptions from the main process
 * @returns Array of state keys this window is subscribed to, or empty array if none
 */
export async function getWindowSubscriptions(): Promise<string[]> {
  try {
    const now = Date.now();
    // Use cached value if recent
    if (cachedSubscriptions.length > 0 && now - lastSubscriptionFetchTime < SUBSCRIPTION_CACHE_TTL) {
      return cachedSubscriptions;
    }

    const api = getSubscriptionAPI();
    if (api) {
      // Use the preload-exposed API
      const result = await api.getWindowSubscriptions();

      // Update cache
      cachedSubscriptions = Array.isArray(result) ? result : [];
      lastSubscriptionFetchTime = now;

      return cachedSubscriptions;
    } else {
      debug('subscription:error', 'Subscription validator API not available');
      return [];
    }
  } catch (error) {
    debug('subscription:error', 'Error getting window subscriptions:', error);
    return [];
  }
}

/**
 * Clears the subscription cache, forcing a refresh on next check
 */
export function clearSubscriptionCache(): void {
  cachedSubscriptions = [];
  lastSubscriptionFetchTime = 0;
}

/**
 * Determines if the window is subscribed to a particular state key
 * @param key The state key to check
 * @returns True if subscribed, false otherwise
 */
export async function isSubscribedToKey(key: string): Promise<boolean> {
  const api = getSubscriptionAPI();
  if (api) {
    // Use the preload-exposed API
    return api.isSubscribedToKey(key);
  }

  // Fallback to original implementation if API not available
  // Get current subscriptions
  const subscriptions = await getWindowSubscriptions();

  // Subscribed to everything with '*'
  if (subscriptions.includes('*')) {
    return true;
  }

  // Check direct key match
  if (subscriptions.includes(key)) {
    return true;
  }

  // Check if the key is a parent of any subscription (e.g., 'user' includes 'user.profile')
  if (key.includes('.')) {
    const keyParts = key.split('.');
    for (let i = 1; i <= keyParts.length; i++) {
      const parentKey = keyParts.slice(0, i).join('.');
      if (subscriptions.includes(parentKey)) {
        return true;
      }
    }
  }

  // Check if any subscription is a parent of this key (e.g., 'user' subscription includes 'user.profile' access)
  for (const subscription of subscriptions) {
    if (key.startsWith(`${subscription}.`)) {
      return true;
    }
  }

  return false;
}

/**
 * Validates that the window has access to the specified state key
 * Throws an error if the window is not subscribed to the key
 * @param key The state key to validate
 * @param action Optional action to check for bypass flags
 * @throws Error if window is not subscribed to the key and not bypassing
 */
export async function validateStateAccess(key: string, action?: Action): Promise<void> {
  if (!key) return; // No key means no validation needed

  // Check if the action has the bypass access control flag set
  if (action && action.__bypassAccessControl === true) {
    debug(
      'subscription',
      `Access control bypass set on action ${action.type}, bypassing subscription validation for key: ${key}`,
    );
    return; // Skip validation when bypass flag is set
  }

  const isSubscribed = await isSubscribedToKey(key);

  if (!isSubscribed) {
    const subscriptions = await getWindowSubscriptions();
    throw new Error(
      `Access denied: This window is not subscribed to state key '${key}'. ` +
        `Current subscriptions: ${subscriptions.join(', ') || 'none'}`,
    );
  }
}

/**
 * Validates that the window can access all of the specified state keys
 * @param keys Array of state keys to validate
 * @param action Optional action to check for bypass flags
 * @throws Error if window is not subscribed to any of the keys and not bypassing
 */
export async function validateStateAccessBatch(keys: string[], action?: Action): Promise<void> {
  if (!keys || keys.length === 0) return;

  // Check if the action has the bypass access control flag set
  if (action && action.__bypassAccessControl === true) {
    debug(
      'subscription',
      `Access control bypass set on action ${action.type}, bypassing subscription validation for keys: ${keys.join(', ')}`,
    );
    return; // Skip validation when bypass flag is set
  }

  const subscriptions = await getWindowSubscriptions();

  // Quick path - full subscription
  if (subscriptions.includes('*')) {
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
      `Access denied: This window is not subscribed to state keys: ${unauthorizedKeys.join(', ')}. ` +
        `Current subscriptions: ${subscriptions.join(', ') || 'none'}`,
    );
  }
}

/**
 * Checks if a state key exists in the provided state object
 * @param state The state object to check
 * @param key The key to look for (can use dot notation)
 * @returns True if the key exists, false otherwise
 */
export function stateKeyExists(state: any, key: string): boolean {
  const api = getSubscriptionAPI();
  if (api) {
    // Use the preload-exposed API
    return api.stateKeyExists(state, key);
  }

  // Fallback implementation
  if (!key || !state) return false;

  // Handle dot notation by traversing the object
  const parts = key.split('.');
  let current = state;

  for (const part of parts) {
    if (current === undefined || current === null || typeof current !== 'object') {
      return false;
    }

    if (!(part in current)) {
      return false;
    }

    current = current[part];
  }

  return true;
}

/**
 * Validates state access with additional check for key existence
 * @param state The state object
 * @param key The key to validate
 * @param action Optional action to check for bypass flags
 * @throws Error if the key doesn't exist or the window isn't subscribed
 */
export async function validateStateAccessWithExistence(state: any, key: string, action?: Action): Promise<void> {
  // Always check if the key exists in the state, regardless of bypass flag
  if (!stateKeyExists(state, key)) {
    throw new Error(`State key '${key}' does not exist in the store`);
  }

  // Then check subscription if not bypassing
  await validateStateAccess(key, action);
}
