import { createAction, createReducer } from '@reduxjs/toolkit';

// Action creators
export const toggleTheme = createAction('THEME:TOGGLE');
export const setTheme = createAction<boolean>('THEME:SET');

// Initial state
const initialState = 'dark'; // Will start with dark theme

// Create the theme reducer
export const themeReducer = createReducer(initialState, (builder) => {
  builder
    .addCase(toggleTheme, (state) => {
      console.log('[Redux Reducer] Toggling theme');
      return state === 'dark' ? 'light' : 'dark';
    })
    .addCase(setTheme, (_state, action) => {
      const theme = action.payload ? 'dark' : 'light';
      console.log(`[Redux Reducer] Setting theme to ${theme}`);
      return theme;
    });
});

// Export the reducer as the default export to match other modes pattern
export { themeReducer as reducer };
