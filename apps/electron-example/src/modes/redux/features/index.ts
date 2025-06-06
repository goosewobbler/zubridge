import { combineReducers } from '@reduxjs/toolkit';
import { type BaseState } from '@zubridge/apps-shared';

import { counterSlice } from './counter/index.js';
import { themeSlice } from './theme/index.js';
import { stateSlice } from './state/index.js';
import { errorSlice } from './error/index.js';

// Define the root state type
export interface State extends BaseState {}

// Combine reducers to create the root reducer
export const rootReducer = combineReducers({
  counter: counterSlice.reducer,
  theme: themeSlice.reducer,
  state: stateSlice.reducer,
  error: errorSlice.reducer,
});

export type RootState = ReturnType<typeof rootReducer>;

// Export action creators
export const actions = {
  'COUNTER:INCREMENT': counterSlice.actions.increment,
  'COUNTER:DECREMENT': counterSlice.actions.decrement,
  'COUNTER:SET': counterSlice.actions.setValue,
  'COUNTER:SET:SLOW': counterSlice.actions.setValueSlow,
  'THEME:TOGGLE': themeSlice.actions.toggleTheme,
  'THEME:SET': themeSlice.actions.setTheme,
  'STATE:RESET': stateSlice.actions.reset,
  'STATE:GENERATE-FILLER': stateSlice.actions.generateLargeState,
  'ERROR:TRIGGER_MAIN_PROCESS_ERROR': errorSlice.actions.triggerMainProcessError,
};
