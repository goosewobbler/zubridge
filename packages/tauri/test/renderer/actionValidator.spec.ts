import type { Action } from '@zubridge/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/renderer/subscriptionValidator.js', () => ({
  getWindowSubscriptions: vi.fn().mockResolvedValue([]),
  isSubscribedToKey: vi.fn().mockResolvedValue(false),
  stateKeyExists: vi.fn().mockReturnValue(true),
}));

import {
  canDispatchAction,
  getAffectedStateKeys,
  registerActionMapping,
  registerActionMappings,
  setActionValidatorStateProvider,
  validateActionDispatch,
} from '../../src/renderer/actionValidator.js';
import * as subscriptionValidator from '../../src/renderer/subscriptionValidator.js';

const mockedSub = subscriptionValidator as unknown as {
  getWindowSubscriptions: ReturnType<typeof vi.fn>;
  isSubscribedToKey: ReturnType<typeof vi.fn>;
  stateKeyExists: ReturnType<typeof vi.fn>;
};

const baseState = {
  user: { name: 'Test', profile: {}, data: {}, email: 't@e.com' },
  counter: 0,
  notifications: [],
  existing: { key: 'value' },
  unsubscribed: { key: 'value' },
  settings: { preferences: {} },
};

describe('actionValidator (Tauri)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedSub.getWindowSubscriptions.mockResolvedValue([]);
    mockedSub.isSubscribedToKey.mockResolvedValue(false);
    mockedSub.stateKeyExists.mockReturnValue(true);

    // Default state provider returns the base state
    setActionValidatorStateProvider(async () => baseState);
  });

  afterEach(() => {
    setActionValidatorStateProvider(null);
  });

  describe('setActionValidatorStateProvider', () => {
    it('uses the configured provider for state lookup during dispatch validation', async () => {
      const provider = vi.fn().mockResolvedValue(baseState);
      setActionValidatorStateProvider(provider);

      registerActionMapping('NEEDS_STATE', ['user']);
      mockedSub.isSubscribedToKey.mockResolvedValue(true);
      mockedSub.getWindowSubscriptions.mockResolvedValue(['user']);

      await validateActionDispatch({ type: 'NEEDS_STATE' });

      expect(provider).toHaveBeenCalled();
    });

    it('falls back to a null state when the provider is cleared', async () => {
      // No provider configured — readState() returns null and stateKeyExists is never reached.
      setActionValidatorStateProvider(null);

      registerActionMapping('NEEDS_STATE_CLEARED', ['user']);
      mockedSub.isSubscribedToKey.mockResolvedValue(true);
      mockedSub.getWindowSubscriptions.mockResolvedValue(['user']);

      // canDispatchAction sees currentState === null and short-circuits to false.
      const allowed = await canDispatchAction({ type: 'NEEDS_STATE_CLEARED' });
      expect(allowed).toBe(false);
    });

    it('replaces a previously-configured provider', async () => {
      const first = vi.fn().mockResolvedValue(baseState);
      const second = vi.fn().mockResolvedValue(baseState);

      setActionValidatorStateProvider(first);
      setActionValidatorStateProvider(second);

      registerActionMapping('REPLACE_TEST', ['user']);
      mockedSub.isSubscribedToKey.mockResolvedValue(true);
      mockedSub.getWindowSubscriptions.mockResolvedValue(['user']);

      await validateActionDispatch({ type: 'REPLACE_TEST' });

      expect(first).not.toHaveBeenCalled();
      expect(second).toHaveBeenCalled();
    });
  });

  describe('action mapping registry', () => {
    it('registers a single mapping and reads it back', () => {
      registerActionMapping('INC', ['counter']);
      expect(getAffectedStateKeys('INC')).toEqual(['counter']);
    });

    it('registers multiple mappings at once', () => {
      registerActionMappings({
        INC: ['counter'],
        SET_THEME: ['theme'],
        UPDATE_USER: ['user', 'user.profile'],
      });

      expect(getAffectedStateKeys('INC')).toEqual(['counter']);
      expect(getAffectedStateKeys('SET_THEME')).toEqual(['theme']);
      expect(getAffectedStateKeys('UPDATE_USER')).toEqual(['user', 'user.profile']);
    });

    it('returns an empty array for unknown action types', () => {
      expect(getAffectedStateKeys('UNKNOWN')).toEqual([]);
    });
  });

  describe('canDispatchAction', () => {
    it('allows actions with __bypassAccessControl regardless of subscriptions', async () => {
      registerActionMapping('PROTECTED', ['user.data']);
      mockedSub.isSubscribedToKey.mockResolvedValue(false);

      const action: Action = { type: 'PROTECTED', __bypassAccessControl: true };
      expect(await canDispatchAction(action)).toBe(true);
      expect(mockedSub.isSubscribedToKey).not.toHaveBeenCalled();
    });

    it('allows actions with no registered mapping', async () => {
      expect(await canDispatchAction({ type: 'UNMAPPED' })).toBe(true);
    });

    it('allows actions when window subscribes to all affected keys', async () => {
      registerActionMapping('UPDATE_USER', ['user', 'user.profile']);
      mockedSub.isSubscribedToKey.mockResolvedValue(true);
      mockedSub.getWindowSubscriptions.mockResolvedValue(['user', 'user.profile']);

      expect(await canDispatchAction({ type: 'UPDATE_USER' })).toBe(true);
      expect(mockedSub.isSubscribedToKey).toHaveBeenCalledWith('user');
      expect(mockedSub.isSubscribedToKey).toHaveBeenCalledWith('user.profile');
    });

    it('blocks when at least one affected key is unsubscribed', async () => {
      registerActionMapping('UPDATE_USER', ['user', 'user.profile']);
      mockedSub.isSubscribedToKey.mockImplementation(async (k: string) => k === 'user');
      mockedSub.getWindowSubscriptions.mockResolvedValue(['user']);

      expect(await canDispatchAction({ type: 'UPDATE_USER' })).toBe(false);
    });

    it('allows everything when subscriptions include the * wildcard', async () => {
      registerActionMapping('ANY', ['some.key']);
      mockedSub.getWindowSubscriptions.mockResolvedValue(['*']);

      expect(await canDispatchAction({ type: 'ANY' })).toBe(true);
      expect(mockedSub.isSubscribedToKey).not.toHaveBeenCalled();
    });

    it('blocks dispatch when the affected key does not exist in the state', async () => {
      registerActionMapping('UPDATE_NONEXISTENT', ['nonexistent.key']);
      mockedSub.getWindowSubscriptions.mockResolvedValue(['nonexistent.key']);
      mockedSub.isSubscribedToKey.mockResolvedValue(true);
      mockedSub.stateKeyExists.mockReturnValue(false);

      expect(await canDispatchAction({ type: 'UPDATE_NONEXISTENT' })).toBe(false);
    });

    it('blocks when the state provider returns null (no source of truth)', async () => {
      setActionValidatorStateProvider(async () => null);

      registerActionMapping('NEEDS_STATE', ['user']);
      mockedSub.getWindowSubscriptions.mockResolvedValue(['user']);
      mockedSub.isSubscribedToKey.mockResolvedValue(true);

      expect(await canDispatchAction({ type: 'NEEDS_STATE' })).toBe(false);
    });
  });

  describe('validateActionDispatch', () => {
    it('passes silently for allowed actions', async () => {
      registerActionMapping('OK', ['counter']);
      mockedSub.isSubscribedToKey.mockResolvedValue(true);
      mockedSub.getWindowSubscriptions.mockResolvedValue(['counter']);

      await expect(validateActionDispatch({ type: 'OK' })).resolves.toBeUndefined();
    });

    it('skips validation when the action carries the bypass flag', async () => {
      registerActionMapping('PROTECTED', ['protected.key']);
      mockedSub.isSubscribedToKey.mockResolvedValue(false);

      await expect(
        validateActionDispatch({ type: 'PROTECTED', __bypassAccessControl: true }),
      ).resolves.toBeUndefined();
      // The state provider is never even consulted for bypass actions.
    });

    it('throws when the window is not subscribed', async () => {
      registerActionMapping('UNAUTH', ['user.data']);
      mockedSub.isSubscribedToKey.mockResolvedValue(false);
      mockedSub.getWindowSubscriptions.mockResolvedValue(['counter', 'theme']);

      await expect(validateActionDispatch({ type: 'UNAUTH' })).rejects.toThrow(
        /Unauthorized action dispatch.*UNAUTH/,
      );
    });

    it('throws when an affected state key does not exist', async () => {
      registerActionMapping('GHOST', ['missing.key']);
      mockedSub.stateKeyExists.mockReturnValue(false);
      mockedSub.isSubscribedToKey.mockResolvedValue(true);
      mockedSub.getWindowSubscriptions.mockResolvedValue(['missing.key']);

      await expect(validateActionDispatch({ type: 'GHOST' })).rejects.toThrow(
        /State key 'missing.key' does not exist/,
      );
    });

    it('throws when the state provider yields null', async () => {
      setActionValidatorStateProvider(async () => null);

      registerActionMapping('NEEDS_STATE', ['user']);
      mockedSub.isSubscribedToKey.mockResolvedValue(true);
      mockedSub.getWindowSubscriptions.mockResolvedValue(['user']);

      await expect(validateActionDispatch({ type: 'NEEDS_STATE' })).rejects.toThrow(
        /does not exist in the store/,
      );
    });

    it('lists all affected keys in the unauthorized error message', async () => {
      registerActionMapping('COMPLEX', ['user.profile', 'settings.preferences', 'notifications']);
      mockedSub.isSubscribedToKey.mockImplementation(async (k: string) => k === 'notifications');
      mockedSub.getWindowSubscriptions.mockResolvedValue(['notifications']);

      await expect(validateActionDispatch({ type: 'COMPLEX' })).rejects.toThrow(
        /user\.profile.*settings\.preferences.*notifications/,
      );
    });

    it('mentions current subscriptions in the error message', async () => {
      registerActionMapping('SHOW_SUBS', ['needed.key']);
      mockedSub.isSubscribedToKey.mockResolvedValue(false);
      mockedSub.getWindowSubscriptions.mockResolvedValue(['existing.sub']);

      await expect(validateActionDispatch({ type: 'SHOW_SUBS' })).rejects.toThrow(
        /Current subscriptions: existing\.sub/,
      );
    });

    it('reports "none" in the error message when there are no subscriptions', async () => {
      registerActionMapping('NO_SUBS', ['needed.key']);
      mockedSub.isSubscribedToKey.mockResolvedValue(false);
      mockedSub.getWindowSubscriptions.mockResolvedValue([]);

      await expect(validateActionDispatch({ type: 'NO_SUBS' })).rejects.toThrow(
        /Current subscriptions: none/,
      );
    });
  });
});
