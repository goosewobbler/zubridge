import type { Reducer } from '@zubridge/electron';
import type { Action } from '@zubridge/types';
import type { State } from '../index.js';

const initialState: State = {
  counter: 0,
  theme: 'dark' as const,
  filler: { meta: { estimatedSize: '0 B' } },
};

export type StateAction = { type: 'STATE:RESET' };

/**
 * Reducer for state-wide actions
 * This reducer can return a full state object when needed
 */
export const reducer: Reducer<State> = (state, action: Action) => {
  switch (action.type) {
    case 'STATE:RESET':
      console.log('[Reducer] Resetting state to defaults');
      return initialState;
    default:
      return state;
  }
};
