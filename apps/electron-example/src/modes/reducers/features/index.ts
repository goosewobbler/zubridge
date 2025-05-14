import type { Reducer } from '@zubridge/electron';
import type { BaseState } from '../../../types.js';

import { reducer as counterReducer } from './counter/index.js';
import { reducer as themeReducer } from './theme/index.js';

// Define the root state type for the reducers mode
export interface State extends BaseState {}

/**
 * Root reducer that combines all feature reducers
 */
export const rootReducer: Reducer<State> = (state, action) => ({
  counter: counterReducer(state.counter ?? 0, action),
  theme: themeReducer(state.theme ?? 'dark', action),
});

export type RootState = ReturnType<typeof rootReducer>;
