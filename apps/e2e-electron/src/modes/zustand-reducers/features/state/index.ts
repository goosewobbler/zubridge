import type { Reducer } from '@zubridge/electron';
import type { Action } from '@zubridge/types';
import { initialState, generateTestState } from '@zubridge/apps-shared';

export type StateAction =
  | { type: 'STATE:RESET' }
  | { type: 'STATE:GENERATE-FILLER'; payload?: { variant?: 'small' | 'medium' | 'large' | 'xl' } };

/**
 * Reducer for state-wide actions
 * This reducer can return a full state object when needed
 */
export const reducer: Reducer<typeof initialState> = (state, action: Action) => {
  switch (action.type) {
    case 'STATE:RESET':
      console.log('[Reducer] Resetting state to defaults');
      return initialState;
    case 'STATE:GENERATE-FILLER': {
      // Type narrowing for action.payload
      const payload = action.payload as { variant?: 'small' | 'medium' | 'large' | 'xl' } | undefined;
      const variant = payload?.variant || 'medium';
      console.log(`[Reducer] Generating ${variant} test state`);

      // Use the shared generateTestState function
      const filler = generateTestState(variant);

      console.log(`[Reducer] ${variant} test state generated (${filler.meta.estimatedSize})`);

      return {
        ...state,
        filler,
      };
    }
    default:
      return state;
  }
};
