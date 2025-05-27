import { createSlice } from '@reduxjs/toolkit';
import { initialState } from '@zubridge/apps-shared';

/**
 * State slice using Redux Toolkit
 */
export const stateSlice = createSlice({
  name: 'state',
  initialState,
  reducers: {
    reset: () => {
      console.log('[Redux Slice] Resetting state to defaults');
      return initialState;
    },
    generateLargeState: (state) => {
      console.log('[Redux Slice] Generating large filler state');

      // Generate 1000 random key-value pairs
      const filler: Record<string, number> = {};
      for (let i = 0; i < 1000; i++) {
        filler[`key${i}`] = Math.random();
      }

      return {
        ...state,
        filler,
      };
    },
  },
});

// Export actions and reducer
export const { reset, generateLargeState } = stateSlice.actions;
export const { reducer } = stateSlice;
