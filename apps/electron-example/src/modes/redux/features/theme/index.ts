import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

// Initial state
const initialState = 'dark'; // Will start with dark theme

type Theme = 'light' | 'dark';

/**
 * Theme slice using Redux Toolkit
 */
export const themeSlice = createSlice({
  name: 'theme',
  initialState,
  reducers: {
    toggleTheme: (state) => {
      console.log('[Redux Slice] Toggling theme');
      return state === 'dark' ? 'light' : 'dark';
    },
    setTheme: (_state, action: PayloadAction<boolean>) => {
      const theme = action.payload ? 'dark' : 'light';
      console.log(`[Redux Slice] Setting theme to ${theme}`);
      return theme;
    },
  },
});

// Export actions and reducer
export const { toggleTheme, setTheme } = themeSlice.actions;
export const { reducer } = themeSlice;
