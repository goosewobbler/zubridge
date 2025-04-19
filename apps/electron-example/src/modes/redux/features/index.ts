import { combineReducers } from '@reduxjs/toolkit';
import type { BaseState } from '../../../types/index.js';

import { reducer as counterReducer } from './counter/index.js';
import { reducer as themeReducer } from './theme/index.js';

// Define the root state type
export interface State extends BaseState {}

// Combine reducers to create the root reducer
export const rootReducer = combineReducers({
  counter: counterReducer,
  theme: themeReducer,
});

export type RootState = ReturnType<typeof rootReducer>;
