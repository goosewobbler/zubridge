import { createAction, createReducer } from '@reduxjs/toolkit';

// Define theme state interface
export interface ThemeState {
  isDark: boolean; // true = dark theme, false = light theme (both are explicitly set as classes)
}

// Initial state
const initialState: ThemeState = {
  isDark: true, // Will start with dark theme
};

// Action creators
export const toggleTheme = createAction('THEME:TOGGLE');
export const setTheme = createAction<boolean>('THEME:SET');

// Create the theme reducer
export const themeReducer = createReducer(initialState, (builder) => {
  builder
    .addCase(toggleTheme, (state) => {
      console.log('[Redux Reducer] Toggling theme');
      state.isDark = !state.isDark;
    })
    .addCase(setTheme, (state, action) => {
      console.log(`[Redux Reducer] Setting theme to ${action.payload ? 'dark' : 'light'}`);
      state.isDark = action.payload;
    });
});

// Export the reducer as the default export to match other modes pattern
export { themeReducer as reducer };
