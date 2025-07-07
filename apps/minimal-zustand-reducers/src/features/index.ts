import type { Reducer } from '@zubridge/electron';

import { reducer as counterReducer } from './counter/index.js';
import { reducer as themeReducer } from './theme/index.js';
import { reducer as stateReducer } from './state/index.js';
import { reducer as errorReducer } from './error/index.js';

// Define the root state type for the reducers mode
export interface State {
  counter: number;
  theme: 'light' | 'dark';
  filler: { meta: { estimatedSize: string } };
  [key: string]: unknown; // Index signature to satisfy AnyState requirement
}

const initialState: State = {
  counter: 0,
  theme: 'dark',
  filler: { meta: { estimatedSize: '0 B' } },
};

/**
 * Root reducer that combines all feature reducers
 */
export const rootReducer: Reducer<State> = (state = initialState, action) => {
  // Get the state reducer result first
  const stateResult = stateReducer(state, action);

  // If state reducer returns a full state object, use that
  if (stateResult !== state) {
    return stateResult as State;
  }

  // Otherwise, apply individual feature reducers
  return {
    counter: counterReducer(state.counter, action),
    theme: themeReducer(state.theme, action),
    filler: state.filler,
  };
};

export type RootState = ReturnType<typeof rootReducer>;
