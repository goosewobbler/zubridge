import { deepGet } from '../utils/deepGet';
import { dequal } from 'dequal';

export type SubscriptionCallback<S> = (partialState: Partial<S>) => void;

export type Subscription<S> = {
  keys?: string[];
  callback: SubscriptionCallback<S>;
};

/**
 * Normalizes keys for deduplication: sorts and joins with '|', or '*' for full-state.
 */
function normalizeKeys(keys?: string[]): string {
  if (!keys || keys.length === 0) return '*';
  return keys
    .map((k) => k.trim())
    .sort()
    .join('|');
}

/**
 * Generates a unique key for a subscription based on keys and callback reference.
 */
function getSubscriptionKey<S>(keys: string[] | undefined, callback: SubscriptionCallback<S>): string {
  // Use callback.toString() for deduplication; for stricter deduplication, a WeakMap could be used
  return `${normalizeKeys(keys)}::${callback.toString()}`;
}

/**
 * Extracts a partial state object for the given keys using deepGet.
 */
function getPartialState<S>(state: S, keys?: string[]): Partial<S> {
  if (!keys || keys.length === 0) return { ...state };
  const result: Partial<S> = {};
  for (const key of keys) {
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
function setDeep(obj: any, path: string, value: any): void {
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
  if (!keys || keys.length === 0) return prev !== next;
  return keys.some((key) => !dequal(deepGet(prev, key), deepGet(next, key)));
}

export class SubscriptionManager<S> {
  private subscriptions: Map<string, Subscription<S>> = new Map();

  /**
   * Subscribe to state changes for specific keys (deep keys supported).
   * Returns an unsubscribe function.
   */
  subscribe(keys: string[] | undefined, callback: SubscriptionCallback<S>): () => void {
    const subKey = getSubscriptionKey(keys, callback);
    if (this.subscriptions.has(subKey)) {
      // Already subscribed; return unsubscribe
      return () => this.unsubscribe(keys, callback);
    }
    this.subscriptions.set(subKey, { keys, callback });
    return () => this.unsubscribe(keys, callback);
  }

  /**
   * Unsubscribe a callback for specific keys, or all if no keys provided.
   */
  unsubscribe(keys: string[] | undefined, callback: SubscriptionCallback<S>): void {
    const subKey = getSubscriptionKey(keys, callback);
    this.subscriptions.delete(subKey);
  }

  /**
   * Notify all subscribers whose keys have changed, passing the relevant partial state.
   */
  notify(prev: S, next: S): void {
    for (const { keys, callback } of this.subscriptions.values()) {
      if (hasRelevantChange(prev, next, keys)) {
        callback(getPartialState(next, keys));
      }
    }
  }

  /**
   * For debugging: get all current subscription keys.
   */
  getCurrentSubscriptionKeys(): string[] {
    return Array.from(this.subscriptions.values()).map((sub) => normalizeKeys(sub.keys));
  }
}
