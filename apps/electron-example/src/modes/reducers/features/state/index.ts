import type { Reducer } from '@zubridge/electron';
import type { Action } from '@zubridge/types';
import { initialState } from '@zubridge/apps-shared';

export type StateAction = { type: 'STATE:RESET' } | { type: 'STATE:GENERATE-FILLER' };

/**
 * Reducer for state-wide actions
 * This reducer can return a full state object when needed
 */
export const reducer: Reducer<typeof initialState> = (state, action: Action) => {
  switch (action.type) {
    case 'STATE:RESET':
      console.log('[Reducer] Resetting state to defaults');
      return initialState;
    case 'STATE:GENERATE-FILLER':
      console.log('[Reducer] Generating large filler state');

      // Generate 1000 random key-value pairs
      const filler: Record<string, number> = {};
      for (let i = 0; i < 1000; i++) {
        filler[`key${i}`] = Math.random();
      }

      return {
        ...state,
        filler,
      };
    default:
      return state;
  }
};
