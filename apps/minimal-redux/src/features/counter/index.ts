import { createSlice } from '@reduxjs/toolkit';

/**
 * Counter slice for Redux mode
 * In Redux mode, counter logic is handled by Redux Toolkit slices
 */
export const counterSlice = createSlice({
  name: 'counter',
  initialState: 0,
  reducers: {
    increment: (state) => {
      console.log('[Redux Counter] Incrementing counter');
      return state + 1;
    },
    decrement: (state) => {
      console.log('[Redux Counter] Decrementing counter');
      return state - 1;
    },
  },
});

export const counterActions = counterSlice.actions;
