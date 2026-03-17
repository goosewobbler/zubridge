import { debug } from '@zubridge/core';
import { dequal } from 'dequal';
import { deepGet } from '../utils/deepGet.js';

export type SubscriptionCallback<S> = (partialState: Partial<S>) => void;

export type Subscription<S> = {
  keys?: string[];
  callback: SubscriptionCallback<S>;
  windowId?: number;
};

export type SubscribeResult =
  | { status: 'registered'; unsubscribe: () => void }
  | { status: 'superseded' };

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
 * Extracts a partial state object for the given keys using deepGet.
 */
export function getPartialState<S>(state: S, keys?: string[]): Partial<S> {
  const normalized = normalizeKeys(keys);
  if (normalized === '*') return { ...state };
  if (normalized.length === 0) return {};
  const result: Partial<S> = {};
  for (const key of normalized) {
    const value = deepGet(state as Record<string, unknown>, key);
    if (value !== undefined) {
      // Set deep value in result (lodash.set is not used to avoid extra dep)
      setDeep(result as Record<string, unknown>, key, value);
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
    if (curr[keys[i]] == null || typeof curr[keys[i]] !== 'object') {
      curr[keys[i]] = {};
    } else {
      // Shallow-clone so later iterations don't traverse into (and mutate)
      // the source state when a parent path was stored as a live reference
      curr[keys[i]] = { ...(curr[keys[i]] as Record<string, unknown>) };
    }
    curr = curr[keys[i]] as Record<string, unknown>;
  }
  curr[keys[keys.length - 1]] = value;
}

/**
 * Checks if any of the subscribed keys have changed between prev and next state.
 */
function hasRelevantChange<S>(prev: S | undefined, next: S, keys?: string[]): boolean {
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
    // Fast-path: same reference means nothing changed — skip the full traversal.
    // Note: not currently exercised by BridgeFactory (sanitizeState always
    // allocates a new object), but protects against future callers of notify().
    if (prev === next) {
      debug(
        'subscription',
        '[hasRelevantChange] Full state subscription - same reference, skipping',
      );
      return false;
    }
    debug('subscription', '[hasRelevantChange] Full state subscription - notifying');
    return true;
  }
  if (normalized.length === 0) return false;

  // Compare actual values
  return normalized.some((key) => {
    const prevValue = deepGet(prev as Record<string, unknown> & ({} | null), key);
    const nextValue = deepGet(next as Record<string, unknown>, key);
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
  private nextSubId = 0;

  private generateSubId(windowId: number): string {
    return `window-${windowId}-sub-${this.nextSubId++}`;
  }

  /**
   * Subscribe to state changes for specific keys (deep keys supported).
   * Each call creates an independent subscription entry so that multiple
   * subscriptions on the same window do not overwrite each other's callbacks.
   *
   * Returns `{ status: 'registered', unsubscribe }` when the callback was
   * registered, or `{ status: 'superseded' }` when an existing '*' (all-state)
   * subscription already covers this window and the requested keys are
   * specific. Superseded callers should skip sending an initial-state delta —
   * the existing '*' subscription already delivers state to the window.
   *
   * A '*' subscription replaces all prior entries for the window (both
   * specific-key and prior '*' entries). Previously returned unsubscribe
   * handles become no-ops — this is intentional: '*' supersedes everything.
   * Callers must use the '*' subscription's unsubscribe handle to fully
   * clean up; prior handles will not remove the '*' entry.
   */
  subscribe(
    keys: string[] | undefined,
    callback: SubscriptionCallback<S>,
    windowId: number,
  ): SubscribeResult {
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

    const normalized = normalizeKeys(keys);
    debug('subscription', '[subscribe] Normalized keys:', normalized);

    // If already subscribed to '*' and the new subscription is for specific keys,
    // skip creating the entry — the existing '*' subscription already covers them.
    if (existingKeys.includes('*') && normalized !== '*') {
      debug(
        'subscription',
        `[subscribe] Window ${windowId} already has '*' subscription, keeping it`,
      );
      return { status: 'superseded' };
    }

    const subId = this.generateSubId(windowId);
    debug('subscription', `[subscribe] Using subscription id: ${subId}`);

    // If normalized is '*', replace all existing subscriptions for this window
    // (both specific-key and prior '*' entries) with a single '*' entry.
    // Prior unsubscribe handles become no-ops — this is intentional: '*' supersedes everything.
    if (normalized === '*') {
      debug('subscription', `[subscribe] Setting full '*' subscription for window ${windowId}`);
      for (const [id, sub] of this.subscriptions) {
        if (sub.windowId === windowId) {
          this.subscriptions.delete(id);
        }
      }
      this.subscriptions.set(subId, { keys: undefined, callback, windowId });
    } else {
      debug('subscription', `[subscribe] Adding subscription for window ${windowId}:`, normalized);
      this.subscriptions.set(subId, { keys: normalized, callback, windowId });
    }

    debug('subscription', `[subscribe] New subscriptions size: ${this.subscriptions.size}`);

    // Get current subscriptions after update
    const currentSubscriptions = this.getCurrentSubscriptionKeys(windowId);
    debug(
      'subscription',
      `[subscribe] Current subscriptions for window ${windowId}:`,
      currentSubscriptions,
    );

    return {
      status: 'registered' as const,
      unsubscribe: () => {
        this.subscriptions.delete(subId);
      },
    };
  }

  /**
   * Unsubscribe a window from specific keys, or all if no keys provided.
   * This is a window-wide operation — it removes matching keys from all
   * subscriptions for the window, regardless of which callback registered them.
   * For per-subscription cleanup, use the `unsubscribe` handle returned by
   * `subscribe()` instead.
   */
  unsubscribe(keys: string[] | undefined, windowId: number): void {
    debug(
      'subscription',
      `[unsubscribe] Called with keys: ${keys ? JSON.stringify(keys) : 'undefined'} for window ${windowId}`,
    );

    // If no keys provided or '*' is included, remove all subscriptions for this window
    if (!keys || keys.length === 0 || keys.includes('*')) {
      debug('subscription', `[unsubscribe] Removing all subscriptions for window ${windowId}`);
      for (const [id, sub] of this.subscriptions) {
        if (sub.windowId === windowId) {
          this.subscriptions.delete(id);
        }
      }
      return;
    }

    // For each subscription for this window, remove matching keys
    for (const [id, sub] of this.subscriptions) {
      if (sub.windowId !== windowId) continue;

      // If it's a '*' subscription, keep it
      if (sub.keys === undefined) {
        debug('subscription', `[unsubscribe] Keeping '*' subscription for window ${windowId}`);
        continue;
      }

      const remainingKeys = sub.keys.filter((key) => !keys.includes(key));
      debug('subscription', `[unsubscribe] Remaining keys for subscription ${id}:`, remainingKeys);

      if (remainingKeys.length === 0) {
        debug('subscription', `[unsubscribe] No keys left, removing subscription ${id}`);
        this.subscriptions.delete(id);
      } else {
        this.subscriptions.set(id, { ...sub, keys: remainingKeys });
      }
    }
  }

  /**
   * Notify all subscribers whose keys have changed, passing the relevant partial state.
   */
  notify(prev: S | undefined, next: S): void {
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
        debug('subscription', `[notify] Notifying window ${windowId} with state:`, partialState);
        // Always invoke the callback when a relevant change was detected —
        // even if partialState is empty, the SubscriptionHandler needs to
        // run its delta calculator to emit `removed` entries for deleted keys.
        callback(partialState);
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
   * Aggregates keys across all subscriptions for the given window.
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

    const allKeys: Set<string> = new Set();

    for (const sub of this.subscriptions.values()) {
      if (sub.windowId !== windowId) continue;

      // If any subscription is '*', the window is subscribed to everything
      if (sub.keys === undefined) {
        debug(
          'subscription',
          `[getCurrentSubscriptionKeys] Found "*" subscription, returning ["*"]`,
        );
        return ['*'];
      }

      for (const key of sub.keys) {
        allKeys.add(key);
      }
    }

    if (allKeys.size === 0) {
      debug(
        'subscription',
        `[getCurrentSubscriptionKeys] No subscriptions found for window ${windowId}`,
      );
      return [];
    }

    const result = [...allKeys];
    debug('subscription', '[getCurrentSubscriptionKeys] Found specific keys:', result);
    return result;
  }
}
