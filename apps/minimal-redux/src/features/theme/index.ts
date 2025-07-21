import { createSlice } from '@reduxjs/toolkit';

/**
 * Theme slice for Redux mode
 * In Redux mode, theme logic is handled by Redux Toolkit slices
 */
export const themeSlice = createSlice({
  name: 'theme',
  initialState: 'dark' as 'dark' | 'light',
  reducers: {
    toggleTheme: (state) => {
      console.log('[Redux Theme] Toggling theme');
      return state === 'dark' ? 'light' : 'dark';
    },
  },
});

export const themeActions = themeSlice.actions;
