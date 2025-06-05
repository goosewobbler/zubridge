import { createSlice } from '@reduxjs/toolkit';

// Initial state
const initialState = undefined; // Will start with dark theme

/**
 * Theme slice using Redux Toolkit
 */
export const errorSlice = createSlice({
  name: 'error',
  initialState,
  reducers: {
    triggerMainProcessError: () => {
      console.log('[Redux Slice] Triggering main process error');
      throw new Error('Intentional error thrown in main process for testing purposes');
    },
  },
});

// Export actions and reducer
export const { triggerMainProcessError } = errorSlice.actions;
export const { reducer } = errorSlice;
