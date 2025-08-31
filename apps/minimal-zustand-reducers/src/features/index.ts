import type { Reducer } from '@zubridge/electron';

import { reducer as counterReducer } from './counter/index.js';
import { reducer as themeReducer } from './theme/index.js';

// Define the root state type for the reducers mode
export interface State {
  counter: number;
  theme: 'light' | 'dark';
  [key: string]: unknown; // Index signature to satisfy AnyState requirement
}

/**
 * Initial state for reducers mode
 */
export const initialState: State = {
  counter: 0,
  theme: 'dark',
};

/**
 * Root reducer that combines all feature reducers
 */
export const rootReducer: Reducer<State> = (state, action) => {
  // Apply individual feature reducers
  return {
    counter: counterReducer(state.counter, action),
    theme: themeReducer(state.theme, action),
  };
};

export type RootState = ReturnType<typeof rootReducer>;
