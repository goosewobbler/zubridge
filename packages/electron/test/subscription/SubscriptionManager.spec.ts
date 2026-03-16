import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getPartialState,
  SubscriptionManager,
} from '../../src/subscription/SubscriptionManager.js';

describe('SubscriptionManager', () => {
  let subscriptionManager: SubscriptionManager<Record<string, unknown>>;
  const mockCallback = vi.fn();
  const windowId = 1;

  beforeEach(() => {
    subscriptionManager = new SubscriptionManager();
    vi.clearAllMocks();
  });

  describe('subscription management', () => {
    it('should subscribe to specific keys', () => {
      subscriptionManager.subscribe(['counter'], mockCallback, windowId);
      const keys = subscriptionManager.getCurrentSubscriptionKeys(windowId);
      expect(keys).toContain('counter');
      expect(keys).not.toContain('theme');
    });

    it('should subscribe to all state with "*"', () => {
      subscriptionManager.subscribe(undefined, mockCallback, windowId);
      const keys = subscriptionManager.getCurrentSubscriptionKeys(windowId);
      expect(keys).toEqual(['*']);
    });

    it('should keep "*" subscription when subscribing to specific keys', () => {
      // First subscribe to all state
      subscriptionManager.subscribe(undefined, mockCallback, windowId);
      // Then subscribe to a specific key
      subscriptionManager.subscribe(['counter'], mockCallback, windowId);

      const keys = subscriptionManager.getCurrentSubscriptionKeys(windowId);
      expect(keys).toEqual(['*']);
    });

    it('should handle subscribing to "*" explicitly', () => {
      subscriptionManager.subscribe(['*'], mockCallback, windowId);
      const keys = subscriptionManager.getCurrentSubscriptionKeys(windowId);
      expect(keys).toEqual(['*']);
    });

    it('should not replace "*" with specific keys when already subscribed to "*"', () => {
      // Subscribe to '*' first
      subscriptionManager.subscribe(['*'], mockCallback, windowId);
      // Then try to subscribe to specific keys
      subscriptionManager.subscribe(['counter', 'theme'], mockCallback, windowId);

      // Should still be subscribed to '*'
      const keys = subscriptionManager.getCurrentSubscriptionKeys(windowId);
      expect(keys).toEqual(['*']);
    });

    it('should maintain independent subscriptions for different windows', () => {
      const window1 = 1;
      const window2 = 2;

      subscriptionManager.subscribe(['counter'], mockCallback, window1);
      subscriptionManager.subscribe(['theme'], mockCallback, window2);

      const keys1 = subscriptionManager.getCurrentSubscriptionKeys(window1);
      const keys2 = subscriptionManager.getCurrentSubscriptionKeys(window2);

      expect(keys1).toEqual(['counter']);
      expect(keys2).toEqual(['theme']);
    });

    it('should keep other subscriptions when unsubscribing from specific key', () => {
      // Subscribe to multiple keys
      subscriptionManager.subscribe(['counter', 'theme'], mockCallback, windowId);

      // Unsubscribe from just 'theme'
      subscriptionManager.unsubscribe(['theme'], mockCallback, windowId);

      const keys = subscriptionManager.getCurrentSubscriptionKeys(windowId);
      expect(keys).toEqual(['counter']);
    });

    it('should not affect "*" subscription when unsubscribing from specific keys', () => {
      // Subscribe to '*'
      subscriptionManager.subscribe(['*'], mockCallback, windowId);

      // Try to unsubscribe from specific keys
      subscriptionManager.unsubscribe(['counter'], mockCallback, windowId);

      // Should still be subscribed to '*'
      const keys = subscriptionManager.getCurrentSubscriptionKeys(windowId);
      expect(keys).toEqual(['*']);
    });

    it('should replace specific keys with "*" when upgrading subscription', () => {
      // First subscribe to specific keys
      subscriptionManager.subscribe(['counter', 'theme'], mockCallback, windowId);

      // Then upgrade to '*'
      subscriptionManager.subscribe(['*'], mockCallback, windowId);

      // Should now be subscribed to '*' only
      const keys = subscriptionManager.getCurrentSubscriptionKeys(windowId);
      expect(keys).toEqual(['*']);
    });
  });

  describe('notification behavior', () => {
    const initialState = { counter: 0, theme: 'light' };
    const updatedState = { counter: 1, theme: 'dark' };

    it('should notify on relevant key changes when subscribed to specific keys', () => {
      subscriptionManager.subscribe(['counter'], mockCallback, windowId);
      subscriptionManager.notify(initialState, updatedState);

      expect(mockCallback).toHaveBeenCalledWith({ counter: 1 });
    });

    it('should notify on all changes when subscribed to "*"', () => {
      subscriptionManager.subscribe(undefined, mockCallback, windowId);
      subscriptionManager.notify(initialState, updatedState);

      expect(mockCallback).toHaveBeenCalledWith(updatedState);
    });

    it('should not notify on irrelevant key changes', () => {
      subscriptionManager.subscribe(['counter'], mockCallback, windowId);
      subscriptionManager.notify({ counter: 1, theme: 'light' }, { counter: 1, theme: 'dark' });

      expect(mockCallback).not.toHaveBeenCalled();
    });

    it('should not notify when subscribed key never existed in either state', () => {
      subscriptionManager.subscribe(['nonexistent'], mockCallback, windowId);
      subscriptionManager.notify(initialState, updatedState);

      expect(mockCallback).not.toHaveBeenCalled();
    });

    it('should notify when subscribed key is deleted even if partial state is empty', () => {
      const prevState = { counter: 1, session: { token: 'abc' } };
      subscriptionManager.subscribe(['session.token'], mockCallback, windowId);

      // Delete session.token — partial state will be empty but the callback
      // must fire so that downstream delta calculators can emit `removed` entries.
      const nextState = { counter: 1, session: {} };
      subscriptionManager.notify(
        prevState as Record<string, unknown>,
        nextState as Record<string, unknown>,
      );

      expect(mockCallback).toHaveBeenCalledWith({});
    });

    it('should notify multiple windows independently', () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();
      const window1 = 1;
      const window2 = 2;

      subscriptionManager.subscribe(['counter'], callback1, window1);
      subscriptionManager.subscribe(['theme'], callback2, window2);

      subscriptionManager.notify(initialState, updatedState);

      expect(callback1).toHaveBeenCalledWith({ counter: 1 });
      expect(callback2).toHaveBeenCalledWith({ theme: 'dark' });
    });

    it('should notify with complete state when subscribed to "*" even for unchanged properties', () => {
      subscriptionManager.subscribe(['*'], mockCallback, windowId);
      const state = { counter: 1, theme: 'light', unchanged: 'value' };

      subscriptionManager.notify(state, { ...state, counter: 2 });

      expect(mockCallback).toHaveBeenCalledWith({ counter: 2, theme: 'light', unchanged: 'value' });
    });
  });

  describe('unsubscribe behavior', () => {
    it('should unsubscribe from all state when no keys provided', () => {
      subscriptionManager.subscribe(['counter', 'theme'], mockCallback, windowId);
      subscriptionManager.unsubscribe(undefined, mockCallback, windowId);

      const keys = subscriptionManager.getCurrentSubscriptionKeys(windowId);
      expect(keys).toEqual([]);
    });

    it('should unsubscribe from specific key while keeping others', () => {
      subscriptionManager.subscribe(['counter', 'theme', 'other'], mockCallback, windowId);
      subscriptionManager.unsubscribe(['theme'], mockCallback, windowId);

      const keys = subscriptionManager.getCurrentSubscriptionKeys(windowId);
      expect(keys).toContain('counter');
      expect(keys).toContain('other');
      expect(keys).not.toContain('theme');
    });

    it('should handle unsubscribe from non-existent key', () => {
      subscriptionManager.subscribe(['counter'], mockCallback, windowId);
      subscriptionManager.unsubscribe(['nonexistent'], mockCallback, windowId);

      const keys = subscriptionManager.getCurrentSubscriptionKeys(windowId);
      expect(keys).toEqual(['counter']);
    });

    it('should handle unsubscribe from non-existent window', () => {
      const nonExistentWindow = 999;
      subscriptionManager.unsubscribe(['counter'], mockCallback, nonExistentWindow);

      const keys = subscriptionManager.getCurrentSubscriptionKeys(nonExistentWindow);
      expect(keys).toEqual([]);
    });

    it('should completely unsubscribe when using "*"', () => {
      subscriptionManager.subscribe(['counter', 'theme'], mockCallback, windowId);
      subscriptionManager.unsubscribe(['*'], mockCallback, windowId);

      const keys = subscriptionManager.getCurrentSubscriptionKeys(windowId);
      expect(keys).toEqual([]);
    });

    it('should handle multiple subscribe/unsubscribe operations correctly', () => {
      // Subscribe to counter
      subscriptionManager.subscribe(['counter'], mockCallback, windowId);

      // Add theme
      subscriptionManager.subscribe(['counter', 'theme'], mockCallback, windowId);

      // Remove counter
      subscriptionManager.unsubscribe(['counter'], mockCallback, windowId);

      // Should only have theme left
      const keys = subscriptionManager.getCurrentSubscriptionKeys(windowId);
      expect(keys).toEqual(['theme']);
    });

    it('should merge new subscriptions with existing ones', () => {
      // First subscribe to counter
      subscriptionManager.subscribe(['counter'], mockCallback, windowId);

      // Then subscribe to theme
      subscriptionManager.subscribe(['theme'], mockCallback, windowId);

      // Should have both counter and theme
      const keys = subscriptionManager.getCurrentSubscriptionKeys(windowId);
      expect(keys).toContain('counter');
      expect(keys).toContain('theme');
      expect(keys.length).toBe(2);
    });
  });

  describe('edge cases', () => {
    it('should handle empty arrays in subscriptions', () => {
      subscriptionManager.subscribe([], mockCallback, windowId);
      const keys = subscriptionManager.getCurrentSubscriptionKeys(windowId);
      expect(keys).toEqual([]);
    });

    it('should handle duplicate keys in subscription', () => {
      subscriptionManager.subscribe(['counter', 'counter'], mockCallback, windowId);
      const keys = subscriptionManager.getCurrentSubscriptionKeys(windowId);
      expect(keys).toEqual(['counter']);
    });

    it('should handle subscription changes for the same window', () => {
      // First subscribe to counter
      subscriptionManager.subscribe(['counter'], mockCallback, windowId);

      // Then change to theme
      subscriptionManager.subscribe(['theme'], mockCallback, windowId);

      // Should have both counter and theme now (keys are merged, not replaced)
      const keys = subscriptionManager.getCurrentSubscriptionKeys(windowId);
      expect(keys).toContain('counter');
      expect(keys).toContain('theme');
      expect(keys.length).toBe(2);
    });
  });
});

describe('getPartialState', () => {
  it('should preserve falsy leaf values (0, false, empty string)', () => {
    const state = { count: 0, active: false, label: '' };
    const result = getPartialState(state, ['count', 'active', 'label']);
    expect(result).toEqual({ count: 0, active: false, label: '' });
  });

  it('should preserve deeply nested falsy leaf values', () => {
    const state = { a: { b: { enabled: false, count: 0, label: '' } } };
    const result = getPartialState(state, ['a.b.enabled', 'a.b.count', 'a.b.label']);
    expect(result).toEqual({ a: { b: { enabled: false, count: 0, label: '' } } });
  });

  it('should return empty object for deleted key', () => {
    const state = { counter: 1 };
    // 'removed' key doesn't exist in state
    const result = getPartialState(state, ['removed']);
    expect(result).toEqual({});
  });

  it('should not create live references to source state objects', () => {
    const state = { user: { profile: { name: 'Alice' }, age: 30 } };
    const result = getPartialState(state, ['user.profile.name', 'user.age']);

    // result.user should not be the same reference as state.user
    expect((result as typeof state).user).not.toBe(state.user);
    // Mutating the result must not affect the source
    ((result as typeof state).user as Record<string, unknown>).age = 99;
    expect(state.user.age).toBe(30);
  });
});
