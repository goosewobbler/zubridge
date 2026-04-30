import type { Action } from '@zubridge/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearSubscriptionCache,
  getWindowSubscriptions,
  isSubscribedToKey,
  setSubscriptionFetcher,
  stateKeyExists,
  validateStateAccess,
  validateStateAccessBatch,
  validateStateAccessWithExistence,
} from '../../src/renderer/subscriptionValidator.js';

describe('subscriptionValidator (Tauri)', () => {
  beforeEach(() => {
    setSubscriptionFetcher(null);
    clearSubscriptionCache();
  });

  afterEach(() => {
    setSubscriptionFetcher(null);
    clearSubscriptionCache();
  });

  describe('setSubscriptionFetcher / getWindowSubscriptions', () => {
    it('forwards calls to the configured fetcher', async () => {
      const fetcher = vi.fn().mockResolvedValue(['counter', 'theme', 'user.profile']);
      setSubscriptionFetcher(fetcher);

      const result = await getWindowSubscriptions();

      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(result).toEqual(['counter', 'theme', 'user.profile']);
    });

    it('returns an empty array when no fetcher is configured (default-all fallback)', async () => {
      const result = await getWindowSubscriptions();
      expect(result).toEqual([]);
    });

    it('caches the result within the TTL window', async () => {
      const fetcher = vi.fn().mockResolvedValue(['counter']);
      setSubscriptionFetcher(fetcher);

      await getWindowSubscriptions();
      await getWindowSubscriptions();
      await getWindowSubscriptions();

      expect(fetcher).toHaveBeenCalledTimes(1);
    });

    it('refetches after the cache TTL expires', async () => {
      const fetcher = vi.fn().mockResolvedValue(['counter']);
      setSubscriptionFetcher(fetcher);

      const realNow = Date.now;
      const baseTime = realNow();
      vi.spyOn(Date, 'now').mockReturnValue(baseTime);

      await getWindowSubscriptions();
      expect(fetcher).toHaveBeenCalledTimes(1);

      // Advance past the 1s TTL
      vi.spyOn(Date, 'now').mockReturnValue(baseTime + 2000);

      await getWindowSubscriptions();
      expect(fetcher).toHaveBeenCalledTimes(2);

      vi.restoreAllMocks();
    });

    it('returns an empty array when the fetcher rejects', async () => {
      setSubscriptionFetcher(vi.fn().mockRejectedValue(new Error('boom')));

      const result = await getWindowSubscriptions();
      expect(result).toEqual([]);
    });

    it('coerces a non-array fetcher response into an empty array', async () => {
      setSubscriptionFetcher(vi.fn().mockResolvedValue('not an array' as unknown as string[]));

      const result = await getWindowSubscriptions();
      expect(result).toEqual([]);
    });

    it('replaces an existing fetcher and clears the cache', async () => {
      const first = vi.fn().mockResolvedValue(['first']);
      const second = vi.fn().mockResolvedValue(['second']);

      setSubscriptionFetcher(first);
      const initial = await getWindowSubscriptions();
      expect(initial).toEqual(['first']);

      setSubscriptionFetcher(second);
      const updated = await getWindowSubscriptions();
      expect(updated).toEqual(['second']);
      expect(second).toHaveBeenCalled();
    });

    it('clearSubscriptionCache forces the next call to refetch', async () => {
      const fetcher = vi.fn().mockResolvedValue(['cached']);
      setSubscriptionFetcher(fetcher);

      await getWindowSubscriptions();
      clearSubscriptionCache();
      await getWindowSubscriptions();

      expect(fetcher).toHaveBeenCalledTimes(2);
    });

    it('caches an empty subscription result (default-all webviews must not refetch)', async () => {
      // Regression: previously the cache hit was gated on
      // `cachedSubscriptions.length > 0`, so a webview with zero subscriptions
      // (the default-all case) would hit the backend on every call.
      const fetcher = vi.fn().mockResolvedValue([]);
      setSubscriptionFetcher(fetcher);

      await getWindowSubscriptions();
      await getWindowSubscriptions();
      await getWindowSubscriptions();

      expect(fetcher).toHaveBeenCalledTimes(1);
    });
  });

  describe('isSubscribedToKey', () => {
    it('defaults to allowing access when no subscriptions are configured', async () => {
      // No fetcher → empty list → default-all per Tauri semantics.
      expect(await isSubscribedToKey('anything')).toBe(true);
    });

    it('returns true for the wildcard subscription', async () => {
      setSubscriptionFetcher(async () => ['*']);
      expect(await isSubscribedToKey('counter')).toBe(true);
      expect(await isSubscribedToKey('user.profile.x')).toBe(true);
    });

    it('returns true for an exact key match', async () => {
      setSubscriptionFetcher(async () => ['counter', 'theme']);
      expect(await isSubscribedToKey('counter')).toBe(true);
    });

    it('returns true when the key is a child of an existing subscription', async () => {
      setSubscriptionFetcher(async () => ['user']);
      expect(await isSubscribedToKey('user.profile')).toBe(true);
      expect(await isSubscribedToKey('user.profile.name')).toBe(true);
    });

    it('returns true when an ancestor of the key is in the subscription list', async () => {
      setSubscriptionFetcher(async () => ['user.profile']);
      expect(await isSubscribedToKey('user.profile.name')).toBe(true);
    });

    it('returns false when the key is unrelated to any subscription', async () => {
      setSubscriptionFetcher(async () => ['counter', 'theme']);
      expect(await isSubscribedToKey('user')).toBe(false);
    });

    it('does not treat a sibling as a parent (no false positive on shared prefix)', async () => {
      // 'user.name' is NOT a parent of 'user.namespace', and 'user' IS a parent of both.
      setSubscriptionFetcher(async () => ['user.name']);
      expect(await isSubscribedToKey('user.namespace')).toBe(false);
      expect(await isSubscribedToKey('user.name.first')).toBe(true);
    });
  });

  describe('validateStateAccess', () => {
    it('passes silently when subscribed', async () => {
      setSubscriptionFetcher(async () => ['counter']);
      await expect(validateStateAccess('counter')).resolves.toBeUndefined();
    });

    it('returns immediately on an empty key', async () => {
      // Empty key short-circuits before the fetcher is even consulted.
      const fetcher = vi.fn().mockResolvedValue(['*']);
      setSubscriptionFetcher(fetcher);
      await expect(validateStateAccess('')).resolves.toBeUndefined();
      expect(fetcher).not.toHaveBeenCalled();
    });

    it('throws when the key is not subscribed', async () => {
      setSubscriptionFetcher(async () => ['theme']);
      await expect(validateStateAccess('counter')).rejects.toThrow(/Access denied.*'counter'/);
    });

    it('bypasses validation when the action carries __bypassAccessControl', async () => {
      const fetcher = vi.fn().mockResolvedValue(['theme']);
      setSubscriptionFetcher(fetcher);
      const action: Action = { type: 'INC', __bypassAccessControl: true };

      await expect(validateStateAccess('counter', action)).resolves.toBeUndefined();
      expect(fetcher).not.toHaveBeenCalled();
    });

    it('reports current subscriptions in the error message', async () => {
      setSubscriptionFetcher(async () => ['theme']);
      await expect(validateStateAccess('counter')).rejects.toThrow(/Current subscriptions: theme/);
    });
  });

  describe('validateStateAccessBatch', () => {
    it('passes when subscriptions include the wildcard', async () => {
      setSubscriptionFetcher(async () => ['*']);
      await expect(validateStateAccessBatch(['counter', 'theme', 'user'])).resolves.toBeUndefined();
    });

    it('passes when there are zero subscriptions (default-all)', async () => {
      // No fetcher → empty list → default-all per Tauri semantics.
      await expect(validateStateAccessBatch(['anything', 'goes', 'here'])).resolves.toBeUndefined();
    });

    it('bypasses validation when the action sets __bypassAccessControl', async () => {
      const fetcher = vi.fn().mockResolvedValue(['nothing']);
      setSubscriptionFetcher(fetcher);
      const action: Action = { type: 'BATCH', __bypassAccessControl: true };

      await expect(validateStateAccessBatch(['a', 'b'], action)).resolves.toBeUndefined();
      expect(fetcher).not.toHaveBeenCalled();
    });

    it('throws listing every unauthorized key', async () => {
      setSubscriptionFetcher(async () => ['counter']);
      await expect(validateStateAccessBatch(['counter', 'theme', 'user'])).rejects.toThrow(
        /state keys: theme, user/,
      );
    });

    it('handles empty/null/undefined key arrays as a no-op', async () => {
      const fetcher = vi.fn();
      setSubscriptionFetcher(fetcher);

      await expect(validateStateAccessBatch([])).resolves.toBeUndefined();
      await expect(validateStateAccessBatch(null as unknown as string[])).resolves.toBeUndefined();
      await expect(
        validateStateAccessBatch(undefined as unknown as string[]),
      ).resolves.toBeUndefined();
      expect(fetcher).not.toHaveBeenCalled();
    });

    it('includes current subscriptions in the error message', async () => {
      setSubscriptionFetcher(async () => ['counter', 'theme']);
      await expect(validateStateAccessBatch(['counter', 'user', 'admin'])).rejects.toThrow(
        /state keys: user, admin\. Current subscriptions: counter, theme/,
      );
    });
  });

  describe('stateKeyExists', () => {
    const state = {
      counter: 0,
      empty: null,
      zero: 0,
      falsy: false,
      theme: { mode: 'light', colors: { primary: '#000' } },
      user: { profile: { personal: { name: 'John' } } },
    };

    it('returns true for shallow keys that exist', () => {
      expect(stateKeyExists(state, 'counter')).toBe(true);
    });

    it('returns true for deeply-nested keys that exist', () => {
      expect(stateKeyExists(state, 'theme.colors.primary')).toBe(true);
      expect(stateKeyExists(state, 'user.profile.personal.name')).toBe(true);
    });

    it('returns false when the key path does not exist', () => {
      expect(stateKeyExists(state, 'unknown')).toBe(false);
      expect(stateKeyExists(state, 'theme.colors.secondary')).toBe(false);
    });

    it('returns true for falsy but defined values', () => {
      expect(stateKeyExists(state, 'zero')).toBe(true);
      expect(stateKeyExists(state, 'falsy')).toBe(true);
      expect(stateKeyExists(state, 'empty')).toBe(true);
    });

    it('returns false when the path traverses through a primitive', () => {
      // 'counter' is a number, you cannot have 'counter.value'.
      expect(stateKeyExists(state, 'counter.value')).toBe(false);
    });

    it('returns false for an empty key or missing state', () => {
      expect(stateKeyExists(state, '')).toBe(false);
      expect(stateKeyExists(null as unknown as Record<string, unknown>, 'any')).toBe(false);
      expect(stateKeyExists(undefined as unknown as Record<string, unknown>, 'any')).toBe(false);
    });
  });

  describe('validateStateAccessWithExistence', () => {
    const state = { counter: 0, theme: 'light', user: { profile: { name: 'John' } } };

    it('passes when the key exists and is subscribed', async () => {
      setSubscriptionFetcher(async () => ['counter']);
      await expect(validateStateAccessWithExistence(state, 'counter')).resolves.toBeUndefined();
    });

    it('throws when the key does not exist, even if subscribed', async () => {
      setSubscriptionFetcher(async () => ['user']);
      await expect(validateStateAccessWithExistence(state, 'user.profile.age')).rejects.toThrow(
        /'user.profile.age' does not exist/,
      );
    });

    it('throws when the key exists but is not subscribed', async () => {
      setSubscriptionFetcher(async () => ['theme']);
      await expect(validateStateAccessWithExistence(state, 'counter')).rejects.toThrow(
        /Access denied/,
      );
    });

    it('still enforces existence when bypass is set (existence runs first)', async () => {
      const action: Action = { type: 'A', __bypassAccessControl: true };
      await expect(
        validateStateAccessWithExistence({ theme: 'light' }, 'counter', action),
      ).rejects.toThrow(/'counter' does not exist/);
    });

    it('throws on undefined state with a not-found message', async () => {
      setSubscriptionFetcher(async () => ['counter']);
      await expect(
        validateStateAccessWithExistence(
          undefined as unknown as Record<string, unknown>,
          'counter',
        ),
      ).rejects.toThrow(/'counter' does not exist/);
    });
  });
});
