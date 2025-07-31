import type { Reducer } from '@zubridge/electron';
import type { Action } from '@zubridge/types';

export type CounterAction =
  | { type: 'COUNTER:INCREMENT' }
  | { type: 'COUNTER:DECREMENT' }
  | { type: 'COUNTER:SET'; payload: number }
  | { type: 'COUNTER:SET:SLOW'; payload: number }
  | { type: 'COUNTER:DOUBLE:SLOW' }
  | { type: 'COUNTER:HALVE:SLOW' }
  | { type: 'COUNTER:DOUBLE' }
  | { type: 'COUNTER:HALVE' };

/**
 * Reducer for the counter state
 * In the reducers pattern, we implement pure functions that
 * receive the current state and an action, and return a new state
 */
export const reducer: Reducer<number> = (counter = 0, action: Action) => {
  switch (action.type) {
    case 'COUNTER:INCREMENT':
      console.log('[Reducer] Incrementing counter');
      return counter + 1;
    case 'COUNTER:DECREMENT':
      console.log('[Reducer] Decrementing counter');
      return counter - 1;
    case 'COUNTER:SET':
      console.log(`[Reducer] Setting counter to ${action.payload}`);
      return action.payload as number;
    case 'COUNTER:SET:SLOW':
      // Note: reducers are synchronous, so we can't implement the delay here
      // The delay would be implemented by middleware, thunks, or in the UI
      console.log(`[Reducer] Setting counter (slow) to ${action.payload}`);
      return action.payload as number;
    case 'COUNTER:DOUBLE:SLOW':
      // Note: The 'SLOW' part is handled by middleware or thunks
      // The reducer itself is synchronous
      console.log(`[Reducer] Doubling counter from ${counter} to ${counter * 2}`);
      return counter * 2;
    case 'COUNTER:HALVE:SLOW':
      // Note: The 'SLOW' part is handled by middleware or thunks
      // The reducer itself is synchronous
      const newValueSlow = Math.round(counter / 2);
      console.log(`[Reducer] Halving counter from ${counter} to ${newValueSlow}`);
      return newValueSlow;
    case 'COUNTER:DOUBLE':
      console.log(`[Reducer] Doubling counter from ${counter} to ${counter * 2}`);
      return counter * 2;
    case 'COUNTER:HALVE':
      const newValue = Math.round(counter / 2);
      console.log(`[Reducer] Halving counter from ${counter} to ${newValue}`);
      return newValue;
    default:
      return counter;
  }
};
