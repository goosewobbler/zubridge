import { initialState, type BaseState } from '@zubridge/apps-shared';
import type { Reducer } from '@zubridge/electron';

import { reducer as counterReducer } from './counter/index.js';
import { reducer as themeReducer } from './theme/index.js';
import { reducer as stateReducer } from './state/index.js';
import { reducer as errorReducer } from './error/index.js';

// Define the root state type for the reducers mode
export interface State extends BaseState {}

/**
 * Root reducer that combines all feature reducers
 */
export const rootReducer: Reducer<State> = (state, action) => {
  // Get the state reducer result first
  const stateResult = stateReducer(state, action);

  // If state reducer returns a full state object, use that
  if (stateResult !== state) {
    return stateResult as State;
  }

  // Otherwise, apply individual feature reducers
  return {
    counter: counterReducer(state.counter ?? (initialState.counter as number), action),
    theme: themeReducer(state.theme ?? (initialState.theme as 'light' | 'dark'), action),
    error: errorReducer(undefined, action),
    filler: state.filler,
  };
};

export type RootState = ReturnType<typeof rootReducer>;
