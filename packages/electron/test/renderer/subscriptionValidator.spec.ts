import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Action } from '@zubridge/types';

// Mock electron's ipcRenderer
vi.mock('electron', () => ({
  ipcRenderer: {
    invoke: vi.fn(),
    on: vi.fn(),
    removeListener: vi.fn(),
  },
}));

// Mock the debug module that might be used
vi.mock('@zubridge/core', () => ({
  debug: vi.fn(),
}));

// Mock the window global object
const mockWindowSubscriptionValidator = {
  getWindowSubscriptions: vi.fn(),
  isSubscribedToKey: vi.fn(),
  stateKeyExists: vi.fn(),
};

// Setup window global mock
global.window = {
  ...global.window,
  __zubridge_subscriptionValidator: mockWindowSubscriptionValidator,
} as any;

// Import after mocking dependencies
import {
  validateStateAccess,
  validateStateAccessWithExistence,
  isSubscribedToKey,
  getWindowSubscriptions,
  stateKeyExists,
  clearSubscriptionCache,
} from '../../src/renderer/subscriptionValidator';

describe('subscriptionValidator', () => {
  // Reset mocks between tests
  beforeEach(() => {
    vi.resetAllMocks();
    clearSubscriptionCache(); // Clear the cache between tests
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('getWindowSubscriptions', () => {
    it('should return window subscriptions from API', async () => {
      // Setup
      const mockSubscriptions = ['counter', 'theme', 'user.profile'];
      mockWindowSubscriptionValidator.getWindowSubscriptions.mockResolvedValue(mockSubscriptions);

      // Execute
      const result = await getWindowSubscriptions();

      // Verify
      expect(mockWindowSubscriptionValidator.getWindowSubscriptions).toHaveBeenCalled();
      expect(result).toEqual(mockSubscriptions);
    });

    it('should handle errors by returning an empty array', async () => {
      // Setup
      mockWindowSubscriptionValidator.getWindowSubscriptions.mockRejectedValue(new Error('API failed'));

      // Execute
      const result = await getWindowSubscriptions();

      // Verify
      expect(result).toEqual([]);
    });

    it('should use cached results if available', async () => {
      // Setup - First call
      const mockSubscriptions = ['counter', 'theme'];
      mockWindowSubscriptionValidator.getWindowSubscriptions.mockResolvedValue(mockSubscriptions);

      // First call should make API requests
      await getWindowSubscriptions();

      // Reset the mock to verify it's not called again
      vi.resetAllMocks();

      // Execute - Second call within cache TTL
      const result = await getWindowSubscriptions();

      // Verify - No API calls should be made, and result should be from cache
      expect(mockWindowSubscriptionValidator.getWindowSubscriptions).not.toHaveBeenCalled();
      expect(result).toEqual(mockSubscriptions);
    });
  });

  describe('isSubscribedToKey', () => {
    it('should return true when subscribed to wildcard "*"', async () => {
      // Setup
      mockWindowSubscriptionValidator.isSubscribedToKey.mockResolvedValue(true);

      // Execute
      const result = await isSubscribedToKey('anyKey');

      // Verify
      expect(result).toBe(true);
      expect(mockWindowSubscriptionValidator.isSubscribedToKey).toHaveBeenCalledWith('anyKey');
    });

    it('should return true for direct key match', async () => {
      // Setup
      mockWindowSubscriptionValidator.isSubscribedToKey.mockResolvedValue(true);

      // Execute
      const result = await isSubscribedToKey('counter');

      // Verify
      expect(result).toBe(true);
      expect(mockWindowSubscriptionValidator.isSubscribedToKey).toHaveBeenCalledWith('counter');
    });

    it('should return true for parent key match', async () => {
      // Setup
      mockWindowSubscriptionValidator.isSubscribedToKey.mockResolvedValue(true);

      // Execute
      const result = await isSubscribedToKey('user.profile');

      // Verify
      expect(result).toBe(true);
      expect(mockWindowSubscriptionValidator.isSubscribedToKey).toHaveBeenCalledWith('user.profile');
    });

    it('should return false when not subscribed to any related key', async () => {
      // Setup
      mockWindowSubscriptionValidator.isSubscribedToKey.mockResolvedValue(false);

      // Execute
      const result = await isSubscribedToKey('user');

      // Verify
      expect(result).toBe(false);
      expect(mockWindowSubscriptionValidator.isSubscribedToKey).toHaveBeenCalledWith('user');
    });
  });

  describe('validateStateAccess', () => {
    it('should pass silently when key is subscribed', async () => {
      // Setup
      mockWindowSubscriptionValidator.isSubscribedToKey.mockResolvedValue(true);
      mockWindowSubscriptionValidator.getWindowSubscriptions.mockResolvedValue(['counter', 'theme']);

      // Execute & Verify - should not throw
      await expect(validateStateAccess('counter')).resolves.toBeUndefined();
      expect(mockWindowSubscriptionValidator.isSubscribedToKey).toHaveBeenCalledWith('counter');
    });

    it('should throw error when window is not subscribed to key', async () => {
      // Setup
      mockWindowSubscriptionValidator.isSubscribedToKey.mockResolvedValue(false);
      mockWindowSubscriptionValidator.getWindowSubscriptions.mockResolvedValue(['theme']);

      // Execute & Verify - should throw
      await expect(validateStateAccess('counter')).rejects.toThrow(
        "Access denied: This window is not subscribed to state key 'counter'",
      );
      expect(mockWindowSubscriptionValidator.isSubscribedToKey).toHaveBeenCalledWith('counter');
    });

    it('should bypass validation when action has __bypassAccessControl flag', async () => {
      // Setup - even though the function mocks would return false, bypass should skip validation
      mockWindowSubscriptionValidator.isSubscribedToKey.mockResolvedValue(false);

      const action: Action = {
        type: 'INCREMENT_COUNTER',
        __bypassAccessControl: true,
      };

      // Execute & Verify - should not throw despite not being subscribed
      await expect(validateStateAccess('counter', action)).resolves.toBeUndefined();

      // The API should not be called at all due to bypass
      expect(mockWindowSubscriptionValidator.isSubscribedToKey).not.toHaveBeenCalled();
    });

    it('should throw specific error when accessing nested unsubscribed state key', async () => {
      // Setup
      mockWindowSubscriptionValidator.isSubscribedToKey.mockResolvedValue(false);
      mockWindowSubscriptionValidator.getWindowSubscriptions.mockResolvedValue(['user']);

      // Execute & Verify - should throw with specific error message for the nested key
      await expect(validateStateAccess('settings.theme')).rejects.toThrow(
        "Access denied: This window is not subscribed to state key 'settings.theme'",
      );
      expect(mockWindowSubscriptionValidator.isSubscribedToKey).toHaveBeenCalledWith('settings.theme');
    });

    it('should provide informative error when trying to access multiple unsubscribed keys', async () => {
      // Setup
      mockWindowSubscriptionValidator.isSubscribedToKey.mockResolvedValue(false);
      mockWindowSubscriptionValidator.getWindowSubscriptions.mockResolvedValue(['theme']);

      // Execute & Verify - should throw with specific error message
      await expect(validateStateAccess('counter.value')).rejects.toThrow(
        "Access denied: This window is not subscribed to state key 'counter.value'",
      );
      expect(mockWindowSubscriptionValidator.isSubscribedToKey).toHaveBeenCalledWith('counter.value');
    });
  });

  describe('stateKeyExists', () => {
    it('should return true when key exists in state', () => {
      // Setup
      const state = {
        counter: 0,
        theme: {
          mode: 'light',
          colors: {
            primary: '#000',
          },
        },
      };

      // Setup mock to use internal implementation
      mockWindowSubscriptionValidator.stateKeyExists.mockImplementation((state, key) => {
        // For the first call, use the mock
        if (key === 'counter') return true;

        // For other calls, fall back to original implementation
        if (!key || !state) return false;
        const parts = key.split('.');
        let current = state;
        for (const part of parts) {
          if (current === undefined || current === null || typeof current !== 'object') return false;
          if (!(part in current)) return false;
          current = current[part];
        }
        return true;
      });

      // Execute & Verify
      expect(stateKeyExists(state, 'counter')).toBe(true);
      expect(stateKeyExists(state, 'theme')).toBe(true);
      expect(stateKeyExists(state, 'theme.mode')).toBe(true);
      expect(stateKeyExists(state, 'theme.colors.primary')).toBe(true);

      expect(mockWindowSubscriptionValidator.stateKeyExists).toHaveBeenCalledTimes(4);
    });

    it('should return false when key does not exist in state', () => {
      // Setup
      const state = {
        counter: 0,
        theme: {
          mode: 'light',
        },
      };

      mockWindowSubscriptionValidator.stateKeyExists.mockReturnValue(false);

      // Execute & Verify
      expect(stateKeyExists(state, 'user')).toBe(false);
      expect(stateKeyExists(state, 'theme.colors')).toBe(false);
      expect(stateKeyExists(state, 'counter.value')).toBe(false);

      expect(mockWindowSubscriptionValidator.stateKeyExists).toHaveBeenCalledTimes(3);
    });

    it('should handle edge cases correctly', () => {
      // Setup
      const state = {
        counter: 0,
        empty: null,
        zero: 0,
        falsy: false,
      };

      // Setup mock with conditional responses
      mockWindowSubscriptionValidator.stateKeyExists.mockImplementation((s, k) => {
        if (!k || !s) return false;
        if (k === 'empty' || k === 'zero' || k === 'falsy') return true;
        return false;
      });

      // Execute & Verify
      expect(stateKeyExists(state, '')).toBe(false); // Empty key
      expect(stateKeyExists(null, 'counter')).toBe(false); // Null state
      expect(stateKeyExists(undefined, 'counter')).toBe(false); // Undefined state
      expect(stateKeyExists(state, 'empty')).toBe(true); // Null value
      expect(stateKeyExists(state, 'zero')).toBe(true); // Zero value
      expect(stateKeyExists(state, 'falsy')).toBe(true); // False value

      expect(mockWindowSubscriptionValidator.stateKeyExists).toHaveBeenCalledTimes(6);
    });

    it('should properly detect existence of deeply nested keys', () => {
      // Setup
      const state = {
        user: {
          profile: {
            personal: {
              name: 'John',
              age: 30,
            },
            preferences: {
              notifications: {
                email: true,
                push: false,
              },
            },
          },
        },
      };

      // Setup dynamic responses based on the key
      mockWindowSubscriptionValidator.stateKeyExists.mockImplementation((s, k) => {
        return (
          k.startsWith('user.profile.personal') ||
          k === 'user.profile.preferences.notifications.email' ||
          k === 'user.profile.preferences.notifications.push'
        );
      });

      // Execute & Verify
      expect(stateKeyExists(state, 'user.profile.personal.name')).toBe(true);
      expect(stateKeyExists(state, 'user.profile.personal.age')).toBe(true);
      expect(stateKeyExists(state, 'user.profile.preferences.notifications.email')).toBe(true);
      expect(stateKeyExists(state, 'user.profile.preferences.notifications.sms')).toBe(false);
      expect(stateKeyExists(state, 'user.profile.work')).toBe(false);

      expect(mockWindowSubscriptionValidator.stateKeyExists).toHaveBeenCalledTimes(5);
    });
  });

  describe('validateStateAccessWithExistence', () => {
    it('should pass when key exists and is subscribed', async () => {
      // Setup
      mockWindowSubscriptionValidator.stateKeyExists.mockReturnValue(true);
      mockWindowSubscriptionValidator.isSubscribedToKey.mockResolvedValue(true);
      mockWindowSubscriptionValidator.getWindowSubscriptions.mockResolvedValue(['counter', 'theme']);

      const state = { counter: 0, theme: 'light' };

      // Execute & Verify - should not throw
      await expect(validateStateAccessWithExistence(state, 'counter')).resolves.toBeUndefined();
      expect(mockWindowSubscriptionValidator.stateKeyExists).toHaveBeenCalledWith(state, 'counter');
      expect(mockWindowSubscriptionValidator.isSubscribedToKey).toHaveBeenCalledWith('counter');
    });

    it('should throw when key does not exist, even if subscribed', async () => {
      // Setup
      mockWindowSubscriptionValidator.stateKeyExists.mockReturnValue(false);
      mockWindowSubscriptionValidator.isSubscribedToKey.mockResolvedValue(true);
      mockWindowSubscriptionValidator.getWindowSubscriptions.mockResolvedValue(['counter', 'theme', 'user']);

      const state = { counter: 0, theme: 'light' };

      // Execute & Verify - should throw
      await expect(validateStateAccessWithExistence(state, 'user')).rejects.toThrow(
        "State key 'user' does not exist in the store",
      );
      expect(mockWindowSubscriptionValidator.stateKeyExists).toHaveBeenCalledWith(state, 'user');
      // isSubscribedToKey should not be called since existence check failed first
      expect(mockWindowSubscriptionValidator.isSubscribedToKey).not.toHaveBeenCalled();
    });

    it('should throw when key exists but is not subscribed', async () => {
      // Setup
      mockWindowSubscriptionValidator.stateKeyExists.mockReturnValue(true);
      mockWindowSubscriptionValidator.isSubscribedToKey.mockResolvedValue(false);
      mockWindowSubscriptionValidator.getWindowSubscriptions.mockResolvedValue(['theme']);

      const state = { counter: 0, theme: 'light' };

      // Execute & Verify - should throw
      await expect(validateStateAccessWithExistence(state, 'counter')).rejects.toThrow(
        "Access denied: This window is not subscribed to state key 'counter'",
      );
      expect(mockWindowSubscriptionValidator.stateKeyExists).toHaveBeenCalledWith(state, 'counter');
      expect(mockWindowSubscriptionValidator.isSubscribedToKey).toHaveBeenCalledWith('counter');
    });

    it('should check existence even with bypass flag', async () => {
      // Setup
      mockWindowSubscriptionValidator.stateKeyExists.mockReturnValue(false);

      const state = { theme: 'light' };
      const action: Action = {
        type: 'INCREMENT_COUNTER',
        __bypassAccessControl: true,
      };

      // Execute & Verify - should throw for non-existent key despite bypass
      await expect(validateStateAccessWithExistence(state, 'counter', action)).rejects.toThrow(
        "State key 'counter' does not exist in the store",
      );
      expect(mockWindowSubscriptionValidator.stateKeyExists).toHaveBeenCalledWith(state, 'counter');
      // isSubscribedToKey should not be called due to bypass flag
      expect(mockWindowSubscriptionValidator.isSubscribedToKey).not.toHaveBeenCalled();
    });

    it('should prioritize existence check over subscription check', async () => {
      // Setup
      mockWindowSubscriptionValidator.stateKeyExists.mockReturnValue(false);
      mockWindowSubscriptionValidator.isSubscribedToKey.mockResolvedValue(true);
      mockWindowSubscriptionValidator.getWindowSubscriptions.mockResolvedValue(['counter', 'user']);

      const state = { counter: 0, theme: 'light' };

      // Execute & Verify - should throw existence error first, not subscription error
      await expect(validateStateAccessWithExistence(state, 'user')).rejects.toThrow(
        "State key 'user' does not exist in the store",
      );
      expect(mockWindowSubscriptionValidator.stateKeyExists).toHaveBeenCalledWith(state, 'user');
      // isSubscribedToKey should not be called since existence check failed first
      expect(mockWindowSubscriptionValidator.isSubscribedToKey).not.toHaveBeenCalled();
    });

    it('should handle deeply nested non-existent keys correctly', async () => {
      // Setup
      mockWindowSubscriptionValidator.stateKeyExists.mockReturnValue(false);
      mockWindowSubscriptionValidator.isSubscribedToKey.mockResolvedValue(true);
      mockWindowSubscriptionValidator.getWindowSubscriptions.mockResolvedValue(['user']);

      const state = {
        user: {
          profile: {
            name: 'John',
          },
        },
      };

      // Execute & Verify - should throw with specific path in error
      await expect(validateStateAccessWithExistence(state, 'user.profile.age')).rejects.toThrow(
        "State key 'user.profile.age' does not exist in the store",
      );
      expect(mockWindowSubscriptionValidator.stateKeyExists).toHaveBeenCalledWith(state, 'user.profile.age');
    });

    it('should throw appropriate error when accessing undefined state', async () => {
      // Setup
      mockWindowSubscriptionValidator.stateKeyExists.mockReturnValue(false);
      mockWindowSubscriptionValidator.isSubscribedToKey.mockResolvedValue(true);
      mockWindowSubscriptionValidator.getWindowSubscriptions.mockResolvedValue(['counter']);

      // Execute & Verify - should handle undefined state
      await expect(validateStateAccessWithExistence(undefined, 'counter')).rejects.toThrow(
        "State key 'counter' does not exist in the store",
      );
      expect(mockWindowSubscriptionValidator.stateKeyExists).toHaveBeenCalledWith(undefined, 'counter');
    });
  });
});
