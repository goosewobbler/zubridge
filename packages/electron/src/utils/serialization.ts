import type { AnyState } from '@zubridge/types';

/**
 * Removes functions and non-serializable objects from a state object
 * to prevent IPC serialization errors when sending between processes
 *
 * @param state The state object to sanitize
 * @param keys Optional array of keys to sanitize
 * @returns A new state object with functions and non-serializable parts removed
 */
export const sanitizeState = (state: AnyState, keys?: string[]): Record<string, unknown> => {
  if (!state || typeof state !== 'object') return state as any;

  const safeState: Record<string, unknown> = {};
  const keysToSanitize = keys || Object.keys(state);

  for (const key of keysToSanitize) {
    const value = state[key];

    // Skip functions which cannot be cloned over IPC
    if (typeof value !== 'function') {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        // Recursively sanitize nested objects
        safeState[key] = sanitizeState(value as AnyState, keys);
      } else {
        safeState[key] = value;
      }
    }
  }

  return safeState;
};
