import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

// Define the initial state as a direct number value (matching other modes)
const initialState = 0;

/**
 * Counter slice using Redux Toolkit
 */
export const counterSlice = createSlice({
  name: 'counter',
  initialState,
  reducers: {
    increment: (state) => {
      console.log('[Redux Slice] Incrementing counter');
      return state + 1;
    },
    decrement: (state) => {
      console.log('[Redux Slice] Decrementing counter');
      return state - 1;
    },
    setValue: (state, action: PayloadAction<number>) => {
      console.log(`[Redux Slice] Setting counter to ${action.payload}`);
      return action.payload;
    },
    setValueSlow: (state, action: PayloadAction<number>) => {
      // Note: Redux reducers must be pure functions, so we can't implement delays here
      // The delay would be handled by middleware (like redux-thunk) or UI side effects
      console.log(`[Redux Slice] Setting counter (slow) to ${action.payload}`);
      return action.payload;
    },
  },
});

// Export actions and reducer
export const { increment, decrement, setValue, setValueSlow } = counterSlice.actions;
export const { reducer } = counterSlice;
