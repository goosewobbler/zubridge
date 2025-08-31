import { debug } from '@zubridge/core';
import { dequal } from 'dequal';
import { deepGet } from '../utils/deepGet.js';

export type SubscriptionCallback<S> = (partialState: Partial<S>) => void;

export type Subscription<S> = {
  keys?: string[];
  callback: SubscriptionCallback<S>;
  windowId?: number;
};

/**
 * Normalizes keys for deduplication: sorts and joins with ',', or '*' for full-state.
 * Returns:
 * - '*' for full state subscription (when keys is undefined or contains '*')
 * - [] for empty array (explicitly subscribing to nothing)
 * - Array of specific keys otherwise
 */
function normalizeKeys(keys?: string[]): string[] | '*' {
  debug('subscription', `[normalizeKeys] Input keys: ${keys ? keys.join(', ') : 'undefined'}`);

  // If keys is undefined, treat as all state subscription
  if (!keys) {
    debug('subscription', '[normalizeKeys] No keys provided, returning "*" (all state)');
    return '*';
  }

  // If keys is an empty array, keep it empty (explicitly subscribing to nothing)
  if (keys.length === 0) {
    debug('subscription', '[normalizeKeys] Empty keys array, returning [] (no state)');
    return [];
  }

  // If keys includes '*', treat as all state subscription
  if (keys.includes('*')) {
    debug('subscription', '[normalizeKeys] "*" found in keys, returning "*" (all state)');
    return '*';
  }

  // Use Set to deduplicate keys before sorting
  const normalized = [...new Set(keys.map((k) => k.trim()).filter((k) => k.length > 0))].sort();

  debug('subscription', `[normalizeKeys] Normalized keys: ${normalized.join(', ')}`);
  return normalized;
}

/**
 * Generates a unique key for a subscription based on window ID
 */
function getSubscriptionKey(windowId: number): string {
  return `window-${windowId}`;
}

/**
 * Extracts a partial state object for the given keys using deepGet.
 */
export function getPartialState<S>(state: S, keys?: string[]): Partial<S> {
  const normalized = normalizeKeys(keys);
  if (normalized === '*') return { ...state };
  if (normalized.length === 0) return {};
  const result: Partial<S> = {};
  for (const key of normalized) {
    const value = deepGet(state, key);
    if (value !== undefined) {
      // Set deep value in result (lodash.set is not used to avoid extra dep)
      setDeep(result, key, value);
    }
  }
  return result;
}

/**
 * Sets a deep value in an object at the given path (dot notation).
 */
function setDeep(obj: Record<string, unknown>, path: string, value: unknown): void {
  const keys = path.split('.');
  let curr = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (!curr[keys[i]]) curr[keys[i]] = {};
    curr = curr[keys[i]];
  }
  curr[keys[keys.length - 1]] = value;
}

/**
 * Checks if any of the subscribed keys have changed between prev and next state.
 */
function hasRelevantChange<S>(prev: S, next: S, keys?: string[]): boolean {
  debug('subscription', '[hasRelevantChange] Comparing states:', {
    prev: prev === undefined ? 'undefined' : JSON.stringify(prev),
    next: JSON.stringify(next),
    keys,
  });

  // If prev is undefined, this is initial state
  if (prev === undefined) return true;

  // Even if same reference, we should check if values actually changed
  const normalized = normalizeKeys(keys);
  if (normalized === '*') {
    debug('subscription', '[hasRelevantChange] Full state subscription - always notifying');
    return true;
  }
  if (normalized.length === 0) return false;

  // Compare actual values
  return normalized.some((key) => {
    const prevValue = deepGet(prev, key);
    const nextValue = deepGet(next, key);
    const changed = !dequal(prevValue, nextValue);
    debug('subscription', `[hasRelevantChange] Comparing key ${key}:`, {
      prevValue,
      nextValue,
      changed,
    });
    return changed;
  });
}

export class SubscriptionManager<S> {
  private subscriptions: Map<string, Subscription<S>> = new Map();

  /**
   * Subscribe to state changes for specific keys (deep keys supported).
   * Returns an unsubscribe function.
   */
  subscribe(
    keys: string[] | undefined,
    callback: SubscriptionCallback<S>,
    windowId: number,
  ): () => void {
    debug(
      'subscription',
      `[subscribe] Called with keys: ${keys ? JSON.stringify(keys) : 'undefined'} for window ${windowId}`,
    );
    debug('subscription', `[subscribe] Current subscriptions size: ${this.subscriptions.size}`);

    // Get existing subscriptions for this window
    const existingKeys = this.getCurrentSubscriptionKeys(windowId);
    debug(
      'subscription',
      `[subscribe] Existing subscriptions for window ${windowId}:`,
      existingKeys,
    );

    // If already subscribed to '*', only update if explicitly subscribing to '*'
    if (existingKeys.includes('*') && (!keys || !keys.includes('*'))) {
      debug(
        'subscription',
        `[subscribe] Window ${windowId} already has '*' subscription, keeping it`,
      );
      return () => this.unsubscribe(keys, callback, windowId);
    }

    const normalized = normalizeKeys(keys);
    debug('subscription', `[subscribe] Normalized keys: ${JSON.stringify(normalized)}`);

    const subscriptionKey = getSubscriptionKey(windowId);
    debug('subscription', `[subscribe] Using subscription key: ${subscriptionKey}`);

    // Get the existing subscription if any
    const existingSubscription = this.subscriptions.get(subscriptionKey);

    // If normalized is '*', replace the subscription
    if (normalized === '*') {
      debug('subscription', `[subscribe] Setting full '*' subscription for window ${windowId}`);
      this.subscriptions.set(subscriptionKey, { keys: undefined, callback, windowId });
    }
    // If there's an existing subscription with specific keys, merge the keys
    else if (existingSubscription?.keys) {
      // Combine existing keys with new keys and remove duplicates
      const mergedKeys = [...new Set([...existingSubscription.keys, ...normalized])];
      debug('subscription', `[subscribe] Merging keys for window ${windowId}:`, mergedKeys);
      this.subscriptions.set(subscriptionKey, { keys: mergedKeys, callback, windowId });
    }
    // Otherwise create a new subscription with just the normalized keys
    else {
      debug('subscription', `[subscribe] Setting new subscription for window ${windowId}`);
      this.subscriptions.set(subscriptionKey, { keys: normalized, callback, windowId });
    }

    debug('subscription', `[subscribe] New subscriptions size: ${this.subscriptions.size}`);

    // Get current subscriptions after update
    const currentSubscriptions = this.getCurrentSubscriptionKeys(windowId);
    debug(
      'subscription',
      `[subscribe] Current subscriptions for window ${windowId}:`,
      currentSubscriptions,
    );

    return () => this.unsubscribe(keys, callback, windowId);
  }

  /**
   * Unsubscribe a window from specific keys, or all if no keys provided.
   */
  unsubscribe(
    keys: string[] | undefined,
    _callback: SubscriptionCallback<S>,
    windowId: number,
  ): void {
    debug(
      'subscription',
      `[unsubscribe] Called with keys: ${keys ? JSON.stringify(keys) : 'undefined'} for window ${windowId}`,
    );

    const subscriptionKey = getSubscriptionKey(windowId);
    const subscription = this.subscriptions.get(subscriptionKey);

    if (!subscription) {
      debug('subscription', `[unsubscribe] No subscription found for window ${windowId}`);
      return;
    }

    debug('subscription', `[unsubscribe] Current subscription for window ${windowId}:`, {
      keys: subscription.keys,
      hasCallback: !!subscription.callback,
    });

    // If no keys provided or '*' is included, remove entire subscription
    if (!keys || keys.length === 0 || keys.includes('*')) {
      debug('subscription', `[unsubscribe] Removing entire subscription for window ${windowId}`);
      this.subscriptions.delete(subscriptionKey);
      return;
    }

    // If we have a '*' subscription, keep it
    if (subscription.keys === undefined) {
      debug('subscription', `[unsubscribe] Keeping '*' subscription for window ${windowId}`);
      return;
    }

    // Handle normal case - remove specific keys from subscription
    const remainingKeys = subscription.keys.filter((key) => !keys.includes(key));
    debug('subscription', `[unsubscribe] Remaining keys for window ${windowId}:`, remainingKeys);

    if (remainingKeys.length === 0) {
      debug(
        'subscription',
        `[unsubscribe] No keys left, removing subscription for window ${windowId}`,
      );
      this.subscriptions.delete(subscriptionKey);
    } else {
      debug(
        'subscription',
        `[unsubscribe] Updating subscription with remaining keys for window ${windowId}`,
      );
      this.subscriptions.set(subscriptionKey, { ...subscription, keys: remainingKeys });
    }
  }

  /**
   * Notify all subscribers whose keys have changed, passing the relevant partial state.
   */
  notify(prev: S, next: S): void {
    debug(
      'subscription',
      `[notify] Starting notification with ${this.subscriptions.size} subscribers`,
    );
    debug('subscription', '[notify] States:', {
      prev: prev === undefined ? 'undefined' : JSON.stringify(prev),
      next: JSON.stringify(next),
    });

    for (const { keys, callback, windowId } of this.subscriptions.values()) {
      debug('subscription', `[notify] Checking window ${windowId} with keys:`, keys);

      if (hasRelevantChange(prev, next, keys)) {
        const partialState = getPartialState(next, keys);
        if (Object.keys(partialState).length > 0) {
          debug('subscription', `[notify] Notifying window ${windowId} with state:`, partialState);
          callback(partialState);
        } else {
          debug(
            'subscription',
            `[notify] Empty partial state for window ${windowId} - skipping notification`,
          );
        }
      } else {
        debug(
          'subscription',
          `[notify] No relevant changes for window ${windowId} - skipping notification`,
        );
      }
    }
    debug('subscription', '[notify] Notification complete');
  }

  /**
   * For debugging: get all current subscription keys for a window.
   * Returns:
   * - ['*'] for full state subscription
   * - [] for no subscriptions
   * - Array of specific keys otherwise
   */
  getCurrentSubscriptionKeys(windowId: number): string[] {
    debug(
      'subscription',
      `[getCurrentSubscriptionKeys] Looking up subscriptions for window ${windowId}`,
    );

    const subscriptionKey = getSubscriptionKey(windowId);
    const subscription = this.subscriptions.get(subscriptionKey);

    if (!subscription) {
      debug(
        'subscription',
        `[getCurrentSubscriptionKeys] No subscription found for window ${windowId}`,
      );
      return [];
    }

    // If keys is undefined, it means '*' subscription
    if (!subscription.keys) {
      debug('subscription', `[getCurrentSubscriptionKeys] Found "*" subscription, returning ["*"]`);
      return ['*'];
    }

    debug('subscription', '[getCurrentSubscriptionKeys] Found specific keys:', subscription.keys);
    return subscription.keys;
  }
}
