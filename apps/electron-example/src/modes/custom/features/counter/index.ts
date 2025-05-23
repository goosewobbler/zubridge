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

/**
 * Counter set slow action handler for custom mode
 * This handler includes a delay before updating the counter
 * @param value New counter value
 */
export const setValueSlow = async (value: number): Promise<Partial<AnyState>> => {
  console.log(`[Custom Counter] Setting counter to ${value} with 2500ms delay`);
  console.log(`[Custom Counter] Time before delay: ${new Date().toISOString()}`);

  // Wait for 2500ms to simulate a slow operation
  await new Promise((resolve) => setTimeout(resolve, 2500));

  console.log(`[Custom Counter] Time after delay: ${new Date().toISOString()}`);
  console.log(`[Custom Counter] Counter set to ${value} after delay`);
  return {
    counter: value,
  };
};

/**
 * Counter reset action handler for custom mode
 */
export const reset = (): Partial<AnyState> => {
  console.log('[Custom Counter] Resetting counter to 0');
  return {
    counter: 0,
  };
};

// Export default initial state
export const initialState = 0;
