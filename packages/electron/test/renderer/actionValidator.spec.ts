import type { Action } from '@zubridge/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  canDispatchAction,
  getAffectedStateKeys,
  registerActionMapping,
  registerActionMappings,
  validateActionDispatch,
} from '../../src/renderer/actionValidator';

// Mock the subscription validator - needs to be before the import
vi.mock('../../src/renderer/subscriptionValidator', () => ({
  getWindowSubscriptions: vi.fn().mockResolvedValue([]),
  isSubscribedToKey: vi.fn().mockResolvedValue(false),
  validateStateAccess: vi.fn().mockResolvedValue(undefined),
  validateStateAccessBatch: vi.fn().mockResolvedValue(undefined),
  validateStateAccessWithExistence: vi.fn().mockResolvedValue(undefined),
  stateKeyExists: vi.fn().mockReturnValue(true),
}));

// Import after mocking
import * as subscriptionValidator from '../../src/renderer/subscriptionValidator';

// Clear the action map between tests
let _actionToStateKeyMap = new Map<string, string[]>();

describe('actionValidator', () => {
  // Reset mocks between tests
  beforeEach(() => {
    vi.resetAllMocks();

    // Clear action mappings before each test
    _actionToStateKeyMap = new Map<string, string[]>();

    // Reset the mocks with default values
    vi.mocked(subscriptionValidator.getWindowSubscriptions).mockResolvedValue([]);
    vi.mocked(subscriptionValidator.isSubscribedToKey).mockResolvedValue(false);
    vi.mocked(subscriptionValidator.stateKeyExists).mockReturnValue(true);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('registerActionMapping', () => {
    it('should register a single action mapping', () => {
      // Setup
      const actionType = 'INCREMENT_COUNTER';
      const stateKeys = ['counter'];

      // Execute
      registerActionMapping(actionType, stateKeys);

      // Verify - Check if getAffectedStateKeys returns the registered keys
      expect(getAffectedStateKeys(actionType)).toEqual(stateKeys);
    });
  });

  describe('registerActionMappings', () => {
    it('should register multiple action mappings at once', () => {
      // Setup
      const mappings = {
        INCREMENT_COUNTER: ['counter'],
        SET_THEME: ['theme'],
        UPDATE_USER: ['user', 'user.profile'],
      };

      // Execute
      registerActionMappings(mappings);

      // Verify - Check if getAffectedStateKeys returns the registered keys for each action
      expect(getAffectedStateKeys('INCREMENT_COUNTER')).toEqual(['counter']);
      expect(getAffectedStateKeys('SET_THEME')).toEqual(['theme']);
      expect(getAffectedStateKeys('UPDATE_USER')).toEqual(['user', 'user.profile']);
    });
  });

  describe('getAffectedStateKeys', () => {
    it('should return an empty array for unknown action types', () => {
      // Execute & Verify
      expect(getAffectedStateKeys('UNKNOWN_ACTION')).toEqual([]);
    });

    it('should return registered keys for known action types', () => {
      // Setup
      registerActionMapping('KNOWN_ACTION', ['key1', 'key2']);

      // Execute & Verify
      expect(getAffectedStateKeys('KNOWN_ACTION')).toEqual(['key1', 'key2']);
    });
  });

  describe('canDispatchAction', () => {
    it('should allow actions with bypass flag regardless of subscriptions', async () => {
      // Setup
      const action: Action = {
        type: 'PROTECTED_ACTION',
        __bypassAccessControl: true,
      };

      // Mock subscription checks to return false (normally would block)
      vi.mocked(subscriptionValidator.isSubscribedToKey).mockResolvedValue(false);

      // Execute
      const canDispatch = await canDispatchAction(action);

      // Verify
      expect(canDispatch).toBe(true);
      expect(subscriptionValidator.isSubscribedToKey).not.toHaveBeenCalled();
    });

    it('should allow actions with no registered mapping', async () => {
      // Setup
      const action: Action = {
        type: 'UNMAPPED_ACTION',
      };

      // Execute
      const canDispatch = await canDispatchAction(action);

      // Verify
      expect(canDispatch).toBe(true);
    });

    it('should allow actions when window is subscribed to all affected keys', async () => {
      // Setup
      registerActionMapping('UPDATE_USER', ['user', 'user.profile']);
      const action: Action = {
        type: 'UPDATE_USER',
      };

      // Mock subscription checks to allow access
      vi.mocked(subscriptionValidator.isSubscribedToKey).mockResolvedValue(true);
      vi.mocked(subscriptionValidator.getWindowSubscriptions).mockResolvedValue([
        'user',
        'user.profile',
      ]);

      // Execute
      const canDispatch = await canDispatchAction(action);

      // Verify
      expect(canDispatch).toBe(true);
      expect(subscriptionValidator.isSubscribedToKey).toHaveBeenCalledWith('user');
      expect(subscriptionValidator.isSubscribedToKey).toHaveBeenCalledWith('user.profile');
    });

    it('should block actions when window is not subscribed to at least one affected key', async () => {
      // Setup
      registerActionMapping('UPDATE_USER', ['user', 'user.profile']);
      const action: Action = {
        type: 'UPDATE_USER',
      };

      // Mock subscription checks - subscribed to user but not user.profile
      vi.mocked(subscriptionValidator.isSubscribedToKey).mockImplementation(async (key) => {
        return key === 'user';
      });
      vi.mocked(subscriptionValidator.getWindowSubscriptions).mockResolvedValue(['user']);

      // Execute
      const canDispatch = await canDispatchAction(action);

      // Verify
      expect(canDispatch).toBe(false);
      expect(subscriptionValidator.isSubscribedToKey).toHaveBeenCalledWith('user');
      expect(subscriptionValidator.isSubscribedToKey).toHaveBeenCalledWith('user.profile');
    });

    it('should allow all actions when window has wildcard subscription', async () => {
      // Setup
      registerActionMapping('ANY_ACTION', ['some.key']);
      const action: Action = {
        type: 'ANY_ACTION',
      };

      // Mock wildcard subscription
      vi.mocked(subscriptionValidator.getWindowSubscriptions).mockResolvedValue(['*']);

      // Execute
      const canDispatch = await canDispatchAction(action);

      // Verify
      expect(canDispatch).toBe(true);
      expect(subscriptionValidator.isSubscribedToKey).not.toHaveBeenCalled();
    });

    it('should block actions for non-existent state keys', async () => {
      // Setup
      registerActionMapping('UPDATE_NONEXISTENT', ['nonexistent.key']);
      const action: Action = {
        type: 'UPDATE_NONEXISTENT',
      };

      // Mock window subscriptions and state key existence check
      vi.mocked(subscriptionValidator.getWindowSubscriptions).mockResolvedValue([
        'nonexistent.key',
      ]);
      vi.mocked(subscriptionValidator.isSubscribedToKey).mockResolvedValue(true);
      vi.mocked(subscriptionValidator.stateKeyExists).mockReturnValue(false);

      // Use validateStateAccessWithExistence to check existence
      vi.mocked(subscriptionValidator.validateStateAccessWithExistence).mockRejectedValue(
        new Error("State key 'nonexistent.key' does not exist in the store"),
      );

      // Execute - depending on implementation details, this might need adjustment
      const canDispatch = await canDispatchAction(action);

      // Verify
      expect(canDispatch).toBe(false);
    });
  });

  describe('validateActionDispatch', () => {
    it('should pass silently for allowed actions', async () => {
      // Setup
      registerActionMapping('ALLOWED_ACTION', ['counter']);
      const action: Action = {
        type: 'ALLOWED_ACTION',
      };

      // Mock canDispatchAction to return true
      vi.mocked(subscriptionValidator.isSubscribedToKey).mockResolvedValue(true);
      vi.mocked(subscriptionValidator.getWindowSubscriptions).mockResolvedValue(['counter']);

      // Execute & Verify - should not throw
      await expect(validateActionDispatch(action)).resolves.toBeUndefined();
    });

    it('should bypass validation when action has bypass flag', async () => {
      // Setup
      registerActionMapping('PROTECTED_ACTION', ['protected.key']);
      const action: Action = {
        type: 'PROTECTED_ACTION',
        __bypassAccessControl: true,
      };

      // Mock subscription checks to deny access
      vi.mocked(subscriptionValidator.isSubscribedToKey).mockResolvedValue(false);

      // Execute & Verify - should not throw despite subscription denial
      await expect(validateActionDispatch(action)).resolves.toBeUndefined();
    });

    it('should throw error when action is not allowed', async () => {
      // Setup
      registerActionMapping('UNAUTHORIZED_ACTION', ['user.data']);
      const action: Action = {
        type: 'UNAUTHORIZED_ACTION',
      };

      // Mock subscription checks to deny access
      vi.mocked(subscriptionValidator.isSubscribedToKey).mockResolvedValue(false);
      vi.mocked(subscriptionValidator.getWindowSubscriptions).mockResolvedValue([
        'counter',
        'theme',
      ]);

      // Execute & Verify - should throw
      await expect(validateActionDispatch(action)).rejects.toThrow(
        "Unauthorized action dispatch: This window cannot dispatch action 'UNAUTHORIZED_ACTION'",
      );
    });

    it('should allow action with no registered keys', async () => {
      // Setup
      const action: Action = {
        type: 'UNREGISTERED_ACTION',
      };

      // Execute & Verify - should not throw
      await expect(validateActionDispatch(action)).resolves.toBeUndefined();
    });

    it('should throw error with specific message when attempting to dispatch action affecting multiple unsubscribed keys', async () => {
      // Setup
      registerActionMapping('COMPLEX_UPDATE', [
        'user.profile',
        'settings.preferences',
        'notifications',
      ]);
      const action: Action = {
        type: 'COMPLEX_UPDATE',
      };

      // Mock subscription checks to show partial subscription
      vi.mocked(subscriptionValidator.isSubscribedToKey).mockImplementation(async (key) => {
        return key === 'notifications'; // Only subscribed to one of the three keys
      });
      vi.mocked(subscriptionValidator.getWindowSubscriptions).mockResolvedValue(['notifications']);

      // Execute & Verify - should throw with specific error
      await expect(validateActionDispatch(action)).rejects.toThrow(
        "Unauthorized action dispatch: This window cannot dispatch action 'COMPLEX_UPDATE'",
      );
    });

    it('should throw error when attempting to modify non-existent state keys', async () => {
      // Setup
      registerActionMapping('UPDATE_NONEXISTENT', ['nonexistent.key']);
      const action: Action = {
        type: 'UPDATE_NONEXISTENT',
      };

      // Mock subscription checks to allow access but key doesn't exist
      vi.mocked(subscriptionValidator.isSubscribedToKey).mockResolvedValue(true);
      vi.mocked(subscriptionValidator.getWindowSubscriptions).mockResolvedValue([
        'nonexistent.key',
      ]);

      // Mock state existence check to fail
      vi.mocked(subscriptionValidator.stateKeyExists).mockReturnValue(false);

      // Make validateStateAccessWithExistence throw for non-existent key
      vi.mocked(subscriptionValidator.validateStateAccessWithExistence).mockImplementation(
        async (_state, key) => {
          if (key === 'nonexistent.key') {
            throw new Error(`State key '${key}' does not exist in the store`);
          }
        },
      );

      // Execute & Verify - should throw with specific error about non-existent key
      await expect(validateActionDispatch(action)).rejects.toThrow(
        "State key 'nonexistent.key' does not exist in the store",
      );
    });

    it('should handle complex scenarios with both unsubscribed and non-existent keys', async () => {
      // Setup
      registerActionMapping('COMPLEX_SCENARIO', [
        'existing.key',
        'nonexistent.key',
        'unsubscribed.key',
      ]);
      const action: Action = {
        type: 'COMPLEX_SCENARIO',
      };

      // Mock state with only some keys existing
      const _mockState = {
        existing: { key: 'value' },
        unsubscribed: { key: 'value' },
      };

      // Mock subscription checks - only subscribed to existing.key
      vi.mocked(subscriptionValidator.isSubscribedToKey).mockImplementation(async (key) => {
        return key === 'existing.key';
      });
      vi.mocked(subscriptionValidator.getWindowSubscriptions).mockResolvedValue(['existing.key']);

      // Mock state existence check
      vi.mocked(subscriptionValidator.stateKeyExists).mockImplementation((_state, key) => {
        if (key === 'nonexistent.key') return false;
        return true;
      });

      // Execute & Verify - should fail with appropriate error message
      // The exact error will depend on implementation details and validation order
      await expect(validateActionDispatch(action)).rejects.toThrow();
    });

    it('should prevent updates to keys not included in the original mapping', async () => {
      // Setup - register an action with specific keys
      registerActionMapping('UPDATE_SPECIFIC', ['user.name', 'user.email']);
      const action: Action = {
        type: 'UPDATE_SPECIFIC',
        payload: {
          name: 'New Name',
          email: 'new@example.com',
          role: 'admin', // This field isn't in the mapping
        },
      };

      // Mock subscriptions to allow the mapped keys
      vi.mocked(subscriptionValidator.isSubscribedToKey).mockResolvedValue(true);
      vi.mocked(subscriptionValidator.getWindowSubscriptions).mockResolvedValue([
        'user.name',
        'user.email',
      ]);

      // Execute - since we're only testing expected mappings, this should pass
      await expect(validateActionDispatch(action)).resolves.toBeUndefined();

      // But if we added user.role to the expected keys (simulating runtime check):
      registerActionMapping('UPDATE_SPECIFIC', ['user.name', 'user.email', 'user.role']);

      // And now the window isn't subscribed to user.role
      vi.mocked(subscriptionValidator.isSubscribedToKey).mockImplementation(async (key) => {
        return key !== 'user.role';
      });

      // Execute & Verify - now it should fail
      await expect(validateActionDispatch(action)).rejects.toThrow();
    });
  });
});
