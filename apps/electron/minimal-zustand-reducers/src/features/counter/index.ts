import type { Reducer } from '@zubridge/electron';
import type { Action } from '@zubridge/types';

export type CounterAction = { type: 'COUNTER:INCREMENT' } | { type: 'COUNTER:DECREMENT' };

/**
 * Reducer for the counter state
 * In the reducers pattern, we implement pure functions that
 * receive the current state and an action, and return a new state
 */
export const reducer: Reducer<number> = (counter, action: Action) => {
  switch (action.type) {
    case 'COUNTER:INCREMENT':
      console.log('[Reducer] Incrementing counter');
      return counter + 1;
    case 'COUNTER:DECREMENT':
      console.log('[Reducer] Decrementing counter');
      return counter - 1;
    default:
      return counter;
  }
};
