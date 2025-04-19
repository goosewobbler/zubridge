import type { AnyState } from '@zubridge/types';

/**
 * Counter increment action handler for custom mode
 */
export const increment = (state: AnyState): Partial<AnyState> => {
  console.log('[Custom Counter] Incrementing counter');
  return {
    counter: (state.counter as number) + 1,
  };
};

/**
 * Counter decrement action handler for custom mode
 */
export const decrement = (state: AnyState): Partial<AnyState> => {
  console.log('[Custom Counter] Decrementing counter');
  return {
    counter: (state.counter as number) - 1,
  };
};

/**
 * Counter set action handler for custom mode
 * @param value New counter value
 */
export const setValue = (value: number): Partial<AnyState> => {
  console.log(`[Custom Counter] Setting counter to ${value}`);
  return {
    counter: value,
  };
};

// Export default initial state
export const initialState = 0;
