import { createAction } from '@reduxjs/toolkit';
import type { UnknownAction } from '@reduxjs/toolkit';

// Define the initial state as a direct number value (matching other modes)
const initialState = 0;

// Define action creators with explicit action types
export const increment = createAction('COUNTER:INCREMENT');
export const decrement = createAction('COUNTER:DECREMENT');
export const setValue = createAction('COUNTER:SET');
export const setValueSlow = createAction('COUNTER:SET:SLOW');
export const reset = createAction('COUNTER:RESET');

// Traditional reducer function that handles our specific action types directly
export const counterReducer = (state = initialState, action: UnknownAction) => {
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
    case 'COUNTER:SET:SLOW':
      // Note: Redux reducers must be pure functions, so we can't implement delays here
      // The delay would be handled by middleware (like redux-thunk) or UI side effects
      console.log(`[Redux Reducer] Setting counter (slow) to ${action.payload}`);
      return action.payload;
    case 'COUNTER:RESET':
      console.log('[Redux Reducer] Resetting counter to 0');
      return 0;
    default:
      return state;
  }
};

// Export the reducer as the default export to match other modes pattern
export { counterReducer as reducer };
