import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

// Define the theme type to match BaseState
type Theme = 'light' | 'dark';

// Initial state with explicit typing
const initialState = 'dark' satisfies Theme;

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
      const theme: Theme = action.payload ? 'dark' : 'light';
      console.log(`[Redux Slice] Setting theme to ${theme}`);
      return theme;
    },
  },
});

// Export actions and reducer
export const { toggleTheme, setTheme } = themeSlice.actions;
export const { reducer } = themeSlice;
