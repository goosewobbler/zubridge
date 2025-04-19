import { createAction } from '@reduxjs/toolkit';
import type { AnyAction } from '@reduxjs/toolkit';

// Define the initial state as a direct number value (matching other modes)
const initialState = 0;

// Define action creators with explicit action types
export const increment = createAction('COUNTER:INCREMENT');
export const decrement = createAction('COUNTER:DECREMENT');
export const setValue = createAction<number>('COUNTER:SET');

// Traditional reducer function that handles our specific action types directly
export const counterReducer = (state = initialState, action: AnyAction) => {
  switch (action.type) {
    case 'COUNTER:INCREMENT':
      console.log('[Redux Reducer] Incrementing counter');
      return state + 1;
    case 'COUNTER:DECREMENT':
      console.log('[Redux Reducer] Decrementing counter');
      return state - 1;
    case 'COUNTER:SET':
      console.log(`[Redux Reducer] Setting counter to ${action.payload}`);
      return action.payload;
    default:
      return state;
  }
};

// Thunk to double the counter
export const doubleCounter = () => (dispatch, getState) => {
  const currentValue = getState().counter;
  console.log(`[Redux Thunk] Doubling counter from ${currentValue} to ${currentValue * 2}`);
  dispatch(setValue(currentValue * 2));
};

// Export the reducer as the default export to match other modes pattern
export { counterReducer as reducer };
