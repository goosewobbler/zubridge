import type { Action } from '@zubridge/types';
import { debug } from '@zubridge/utils';
import {
  getWindowSubscriptions,
  isSubscribedToKey,
  stateKeyExists,
} from './subscriptionValidator.js';

// Map of action types to the state keys they affect
// This needs to be populated by the application based on its action structure
const actionToStateKeyMap = new Map<string, string[]>();

/**
 * Register an action type with the state keys it affects
 * @param actionType The action type string
 * @param stateKeys Array of state keys this action affects
 */
export function registerActionMapping(actionType: string, stateKeys: string[]): void {
  actionToStateKeyMap.set(actionType, stateKeys);
  debug('action-validator', `Registered action mapping: ${actionType} -> ${stateKeys.join(', ')}`);
}

/**
 * Register multiple action mappings at once
 * @param mappings Object mapping action types to arrays of state keys
 */
export function registerActionMappings(mappings: Record<string, string[]>): void {
  Object.entries(mappings).forEach(([actionType, stateKeys]) => {
    registerActionMapping(actionType, stateKeys);
  });
  const mappingCount = Object.keys(mappings).length;
  debug('action-validator', `Registered ${mappingCount} action mappings`);
}

/**
 * Get the state keys affected by an action
 * @param actionType The action type string
 * @returns Array of state keys this action affects, or empty array if unknown
 */
export function getAffectedStateKeys(actionType: string): string[] {
  return actionToStateKeyMap.get(actionType) || [];
}

/**
 * Check if a window can dispatch an action based on its subscriptions
 * @param action The action to validate
 * @returns Promise resolving to boolean indicating if dispatch is allowed
 */
export async function canDispatchAction(action: Action): Promise<boolean> {
  // If the action has the bypass access control flag, allow it regardless of subscriptions
  if (action.__bypassAccessControl === true) {
    debug(
      'action-validator',
      `Access control bypass set on action ${action.type}, allowing dispatch`,
    );
    return true;
  }

  const actionType = action.type;
  const affectedKeys = getAffectedStateKeys(actionType);

  // If no mapping exists, we can't validate - default to allowing the action
  if (affectedKeys.length === 0) {
    debug('action-validator', `No mapping for action ${actionType}, allowing by default`);
    return true;
  }

  // Get window subscriptions
  const subscriptions = await getWindowSubscriptions();

  // Full subscription always allows all actions
  if (subscriptions.includes('*')) {
    return true;
  }

  // Get current state - safely access zubridge
  const currentState =
    typeof window !== 'undefined' && window.zubridge ? await window.zubridge.getState() : null;

  // Check if the window is subscribed to all affected keys
  for (const key of affectedKeys) {
    // First check if the key exists in the state
    if (!currentState || !stateKeyExists(currentState, key)) {
      debug('action-validator', `State key ${key} does not exist in the store`);
      return false;
    }

    const hasAccess = await isSubscribedToKey(key);
    if (!hasAccess) {
      debug(
        'action-validator',
        `Window lacks permission to affect key ${key} with action ${actionType}`,
      );
      return false;
    }
  }

  // All keys are accessible
  return true;
}

/**
 * Validate that a window can dispatch an action, throwing if not allowed
 * @param action The action to validate
 * @throws Error if the window cannot dispatch this action
 */
export async function validateActionDispatch(action: Action): Promise<void> {
  // If the action has the bypass access control flag, skip validation
  if (action.__bypassAccessControl === true) {
    debug(
      'action-validator',
      `Access control bypass set on action ${action.type}, bypassing action dispatch validation`,
    );
    return;
  }

  const actionType = action.type;
  const affectedKeys = getAffectedStateKeys(actionType);

  // If no mapping exists, we can't validate - default to allowing the action
  if (affectedKeys.length === 0) {
    debug('action-validator', `No mapping for action ${actionType}, allowing by default`);
    return;
  }

  // Get current state - safely access zubridge
  const currentState =
    typeof window !== 'undefined' && window.zubridge ? await window.zubridge.getState() : null;

  // Check if all affected keys exist in the state
  for (const key of affectedKeys) {
    // Verify key exists in state
    if (!currentState || !stateKeyExists(currentState, key)) {
      throw new Error(`State key '${key}' does not exist in the store`);
    }
  }

  const canDispatch = await canDispatchAction(action);

  if (!canDispatch) {
    const subscriptions = await getWindowSubscriptions();

    throw new Error(
      `Unauthorized action dispatch: This window cannot dispatch action '${action.type}' ` +
        `which affects state keys: ${affectedKeys.join(', ')}. ` +
        `Current subscriptions: ${subscriptions.join(', ') || 'none'}`,
    );
  }
}
