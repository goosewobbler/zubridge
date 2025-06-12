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
    setValue: (_state, action: PayloadAction<number>) => {
      console.log(`[Redux Slice] Setting counter to ${action.payload}`);
      return action.payload;
    },
    setValueSlow: (_state, action: PayloadAction<number>) => {
      // Note: Redux reducers must be pure functions, so we can't implement delays here
      // The delay would be handled by middleware (like redux-thunk) or UI side effects
      console.log(`[Redux Slice] Setting counter (slow) to ${action.payload}`);
      return action.payload;
    },
    doubleValueSlow: (state) => {
      // Note: Redux reducers must be pure functions, so we can't implement delays here
      // The delay would be handled by middleware (like redux-thunk) or UI side effects
      const newValue = state * 2;
      console.log(`[Redux Slice] Doubling counter from ${state} to ${newValue}`);
      return newValue;
    },
    halveValueSlow: (state) => {
      // Note: Redux reducers must be pure functions, so we can't implement delays here
      // The delay would be handled by middleware (like redux-thunk) or UI side effects
      const newValue = Math.round(state / 2);
      console.log(`[Redux Slice] Halving counter from ${state} to ${newValue}`);
      return newValue;
    },
    doubleValue: (state) => {
      const newValue = state * 2;
      console.log(`[Redux Slice] Doubling counter from ${state} to ${newValue}`);
      return newValue;
    },
    halveValue: (state) => {
      const newValue = Math.round(state / 2);
      console.log(`[Redux Slice] Halving counter from ${state} to ${newValue}`);
      return newValue;
    },
  },
});

// Export actions and reducer
export const {
  increment,
  decrement,
  setValue,
  setValueSlow,
  doubleValueSlow,
  halveValueSlow,
  doubleValue,
  halveValue,
} = counterSlice.actions;
export const { reducer } = counterSlice;
