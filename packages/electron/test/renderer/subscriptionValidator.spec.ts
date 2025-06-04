import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ipcRenderer } from 'electron';
import type { Action } from '@zubridge/types';
import { IpcChannel } from '../../src/constants';

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
    it('should return window subscriptions from IPC', async () => {
      // Setup
      const mockWindowId = 123;
      const mockSubscriptions = ['counter', 'theme', 'user.profile'];

      // Mock the IPC responses
      vi.mocked(ipcRenderer.invoke).mockImplementation((channel, ...args) => {
        if (channel === IpcChannel.GET_WINDOW_ID) {
          return Promise.resolve(mockWindowId);
        }
        if (channel === IpcChannel.GET_WINDOW_SUBSCRIPTIONS) {
          return Promise.resolve(mockSubscriptions);
        }
        return Promise.resolve(null);
      });

      // Execute
      const result = await getWindowSubscriptions();

      // Verify
      expect(ipcRenderer.invoke).toHaveBeenCalledWith(IpcChannel.GET_WINDOW_ID);
      expect(ipcRenderer.invoke).toHaveBeenCalledWith(IpcChannel.GET_WINDOW_SUBSCRIPTIONS, mockWindowId);
      expect(result).toEqual(mockSubscriptions);
    });

    it('should handle errors by returning an empty array', async () => {
      // Setup
      vi.mocked(ipcRenderer.invoke).mockRejectedValue(new Error('IPC failed'));

      // Execute
      const result = await getWindowSubscriptions();

      // Verify
      expect(result).toEqual([]);
    });

    it('should use cached results if available', async () => {
      // Setup - First call
      const mockWindowId = 123;
      const mockSubscriptions = ['counter', 'theme'];

      vi.mocked(ipcRenderer.invoke).mockImplementation((channel, ...args) => {
        if (channel === IpcChannel.GET_WINDOW_ID) {
          return Promise.resolve(mockWindowId);
        }
        if (channel === IpcChannel.GET_WINDOW_SUBSCRIPTIONS) {
          return Promise.resolve(mockSubscriptions);
        }
        return Promise.resolve(null);
      });

      // First call should make IPC requests
      await getWindowSubscriptions();

      // Reset the mock to verify it's not called again
      vi.resetAllMocks();

      // Execute - Second call within cache TTL
      const result = await getWindowSubscriptions();

      // Verify - No IPC calls should be made, and result should be from cache
      expect(ipcRenderer.invoke).not.toHaveBeenCalled();
      expect(result).toEqual(mockSubscriptions);
    });
  });

  describe('isSubscribedToKey', () => {
    it('should return true when subscribed to wildcard "*"', async () => {
      // Setup
      vi.mocked(ipcRenderer.invoke)
        .mockResolvedValueOnce(123) // GET_WINDOW_ID
        .mockResolvedValueOnce(['*']); // GET_WINDOW_SUBSCRIPTIONS

      // Execute
      const result = await isSubscribedToKey('anyKey');

      // Verify
      expect(result).toBe(true);
    });

    it('should return true for direct key match', async () => {
      // Setup
      vi.mocked(ipcRenderer.invoke)
        .mockResolvedValueOnce(123) // GET_WINDOW_ID
        .mockResolvedValueOnce(['counter', 'theme']); // GET_WINDOW_SUBSCRIPTIONS

      // Execute
      const result = await isSubscribedToKey('counter');

      // Verify
      expect(result).toBe(true);
    });

    it('should return true for parent key match', async () => {
      // Setup
      vi.mocked(ipcRenderer.invoke)
        .mockResolvedValueOnce(123) // GET_WINDOW_ID
        .mockResolvedValueOnce(['user']); // GET_WINDOW_SUBSCRIPTIONS

      // Execute
      const result = await isSubscribedToKey('user.profile');

      // Verify
      expect(result).toBe(true);
    });

    it('should return false when not subscribed to any related key', async () => {
      // Setup
      vi.mocked(ipcRenderer.invoke)
        .mockResolvedValueOnce(123) // GET_WINDOW_ID
        .mockResolvedValueOnce(['counter', 'theme']); // GET_WINDOW_SUBSCRIPTIONS

      // Execute
      const result = await isSubscribedToKey('user');

      // Verify
      expect(result).toBe(false);
    });
  });

  describe('validateStateAccess', () => {
    it('should pass silently when key is subscribed', async () => {
      // Setup
      vi.mocked(ipcRenderer.invoke)
        .mockResolvedValueOnce(123) // GET_WINDOW_ID
        .mockResolvedValueOnce(['counter', 'theme']); // GET_WINDOW_SUBSCRIPTIONS

      // Execute & Verify - should not throw
      await expect(validateStateAccess('counter')).resolves.toBeUndefined();
    });

    it('should throw error when window is not subscribed to key', async () => {
      // Setup
      vi.mocked(ipcRenderer.invoke)
        .mockResolvedValueOnce(123) // GET_WINDOW_ID
        .mockResolvedValueOnce(['theme']); // GET_WINDOW_SUBSCRIPTIONS

      // Execute & Verify - should throw
      await expect(validateStateAccess('counter')).rejects.toThrow(
        "Access denied: This window is not subscribed to state key 'counter'",
      );
    });

    it('should bypass validation when action has __bypassAccessControl flag', async () => {
      // Setup
      vi.mocked(ipcRenderer.invoke)
        .mockResolvedValueOnce(123) // GET_WINDOW_ID (might not be called due to bypass)
        .mockResolvedValueOnce(['theme']); // GET_WINDOW_SUBSCRIPTIONS (might not be called due to bypass)

      const action: Action = {
        type: 'INCREMENT_COUNTER',
        __bypassAccessControl: true,
      };

      // Execute & Verify - should not throw despite not being subscribed
      await expect(validateStateAccess('counter', action)).resolves.toBeUndefined();
    });

    it('should throw specific error when accessing nested unsubscribed state key', async () => {
      // Setup
      vi.mocked(ipcRenderer.invoke)
        .mockResolvedValueOnce(123) // GET_WINDOW_ID
        .mockResolvedValueOnce(['user']); // GET_WINDOW_SUBSCRIPTIONS (subscribed to parent, not specific nested key)

      // Execute & Verify - should throw with specific error message for the nested key
      await expect(validateStateAccess('settings.theme')).rejects.toThrow(
        "Access denied: This window is not subscribed to state key 'settings.theme'",
      );
    });

    it('should provide informative error when trying to access multiple unsubscribed keys', async () => {
      // Setup
      vi.mocked(ipcRenderer.invoke)
        .mockResolvedValueOnce(123) // GET_WINDOW_ID
        .mockResolvedValueOnce(['theme']); // GET_WINDOW_SUBSCRIPTIONS

      // Execute & Verify - should throw with specific error message
      await expect(validateStateAccess('counter.value')).rejects.toThrow(
        "Access denied: This window is not subscribed to state key 'counter.value'",
      );
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

      // Execute & Verify
      expect(stateKeyExists(state, 'counter')).toBe(true);
      expect(stateKeyExists(state, 'theme')).toBe(true);
      expect(stateKeyExists(state, 'theme.mode')).toBe(true);
      expect(stateKeyExists(state, 'theme.colors.primary')).toBe(true);
    });

    it('should return false when key does not exist in state', () => {
      // Setup
      const state = {
        counter: 0,
        theme: {
          mode: 'light',
        },
      };

      // Execute & Verify
      expect(stateKeyExists(state, 'user')).toBe(false);
      expect(stateKeyExists(state, 'theme.colors')).toBe(false);
      expect(stateKeyExists(state, 'counter.value')).toBe(false);
    });

    it('should handle edge cases correctly', () => {
      // Setup
      const state = {
        counter: 0,
        empty: null,
        zero: 0,
        falsy: false,
      };

      // Execute & Verify
      expect(stateKeyExists(state, '')).toBe(false); // Empty key
      expect(stateKeyExists(null, 'counter')).toBe(false); // Null state
      expect(stateKeyExists(undefined, 'counter')).toBe(false); // Undefined state
      expect(stateKeyExists(state, 'empty')).toBe(true); // Null value
      expect(stateKeyExists(state, 'zero')).toBe(true); // Zero value
      expect(stateKeyExists(state, 'falsy')).toBe(true); // False value
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

      // Execute & Verify
      expect(stateKeyExists(state, 'user.profile.personal.name')).toBe(true);
      expect(stateKeyExists(state, 'user.profile.personal.age')).toBe(true);
      expect(stateKeyExists(state, 'user.profile.preferences.notifications.email')).toBe(true);
      expect(stateKeyExists(state, 'user.profile.preferences.notifications.sms')).toBe(false);
      expect(stateKeyExists(state, 'user.profile.work')).toBe(false);
    });
  });

  describe('validateStateAccessWithExistence', () => {
    it('should pass when key exists and is subscribed', async () => {
      // Setup
      vi.mocked(ipcRenderer.invoke)
        .mockResolvedValueOnce(123) // GET_WINDOW_ID
        .mockResolvedValueOnce(['counter', 'theme']); // GET_WINDOW_SUBSCRIPTIONS

      const state = { counter: 0, theme: 'light' };

      // Execute & Verify - should not throw
      await expect(validateStateAccessWithExistence(state, 'counter')).resolves.toBeUndefined();
    });

    it('should throw when key does not exist, even if subscribed', async () => {
      // Setup
      vi.mocked(ipcRenderer.invoke)
        .mockResolvedValueOnce(123) // GET_WINDOW_ID
        .mockResolvedValueOnce(['counter', 'theme', 'user']); // GET_WINDOW_SUBSCRIPTIONS

      const state = { counter: 0, theme: 'light' };

      // Execute & Verify - should throw
      await expect(validateStateAccessWithExistence(state, 'user')).rejects.toThrow(
        "State key 'user' does not exist in the store",
      );
    });

    it('should throw when key exists but is not subscribed', async () => {
      // Setup
      vi.mocked(ipcRenderer.invoke)
        .mockResolvedValueOnce(123) // GET_WINDOW_ID
        .mockResolvedValueOnce(['theme']); // GET_WINDOW_SUBSCRIPTIONS

      const state = { counter: 0, theme: 'light' };

      // Execute & Verify - should throw
      await expect(validateStateAccessWithExistence(state, 'counter')).rejects.toThrow(
        "Access denied: This window is not subscribed to state key 'counter'",
      );
    });

    it('should check existence even with bypass flag', async () => {
      // Setup
      const state = { theme: 'light' };
      const action: Action = {
        type: 'INCREMENT_COUNTER',
        __bypassAccessControl: true,
      };

      // Execute & Verify - should throw for non-existent key despite bypass
      await expect(validateStateAccessWithExistence(state, 'counter', action)).rejects.toThrow(
        "State key 'counter' does not exist in the store",
      );
    });

    it('should prioritize existence check over subscription check', async () => {
      // Setup
      vi.mocked(ipcRenderer.invoke)
        .mockResolvedValueOnce(123) // GET_WINDOW_ID
        .mockResolvedValueOnce(['counter', 'user']); // GET_WINDOW_SUBSCRIPTIONS

      const state = { counter: 0, theme: 'light' };

      // Execute & Verify - should throw existence error first, not subscription error
      await expect(validateStateAccessWithExistence(state, 'user')).rejects.toThrow(
        "State key 'user' does not exist in the store",
      );
    });

    it('should handle deeply nested non-existent keys correctly', async () => {
      // Setup
      vi.mocked(ipcRenderer.invoke)
        .mockResolvedValueOnce(123) // GET_WINDOW_ID
        .mockResolvedValueOnce(['user']); // GET_WINDOW_SUBSCRIPTIONS

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
    });

    it('should throw appropriate error when accessing undefined state', async () => {
      // Setup
      vi.mocked(ipcRenderer.invoke)
        .mockResolvedValueOnce(123) // GET_WINDOW_ID
        .mockResolvedValueOnce(['counter']); // GET_WINDOW_SUBSCRIPTIONS

      // Execute & Verify - should handle undefined state
      await expect(validateStateAccessWithExistence(undefined, 'counter')).rejects.toThrow(
        "State key 'counter' does not exist in the store",
      );
    });
  });
});
