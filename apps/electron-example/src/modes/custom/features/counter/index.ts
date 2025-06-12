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
 * Counter double slow action handler for custom mode
 * This handler doubles the current counter value after a delay
 */
export const doubleValueSlow = async (state: AnyState): Promise<Partial<AnyState>> => {
  const currentValue = state.counter as number;
  const newValue = currentValue * 2;

  console.log(`[Custom Counter] Doubling counter from ${currentValue} to ${newValue} with 2500ms delay`);
  console.log(`[Custom Counter] Time before delay: ${new Date().toISOString()}`);

  // Wait for 2500ms to simulate a slow operation
  await new Promise((resolve) => setTimeout(resolve, 2500));

  console.log(`[Custom Counter] Time after delay: ${new Date().toISOString()}`);
  console.log(`[Custom Counter] Counter doubled to ${newValue} after delay`);
  return {
    counter: newValue,
  };
};

/**
 * Counter halve slow action handler for custom mode
 * This handler halves the current counter value after a delay
 */
export const halveValueSlow = async (state: AnyState): Promise<Partial<AnyState>> => {
  const currentValue = state.counter as number;
  const newValue = Math.round(currentValue / 2);

  console.log(`[Custom Counter] Halving counter from ${currentValue} to ${newValue} with 2500ms delay`);
  console.log(`[Custom Counter] Time before delay: ${new Date().toISOString()}`);

  // Wait for 2500ms to simulate a slow operation
  await new Promise((resolve) => setTimeout(resolve, 2500));

  console.log(`[Custom Counter] Time after delay: ${new Date().toISOString()}`);
  console.log(`[Custom Counter] Counter halved to ${newValue} after delay`);
  return {
    counter: newValue,
  };
};

/**
 * Counter double action handler for custom mode (no delay)
 */
export const doubleValue = (state: AnyState): Partial<AnyState> => {
  const currentValue = state.counter as number;
  const newValue = currentValue * 2;

  console.log(`[Custom Counter] Doubling counter from ${currentValue} to ${newValue}`);
  return {
    counter: newValue,
  };
};

/**
 * Counter halve action handler for custom mode (no delay)
 */
export const halveValue = (state: AnyState): Partial<AnyState> => {
  const currentValue = state.counter as number;
  const newValue = Math.round(currentValue / 2);

  console.log(`[Custom Counter] Halving counter from ${currentValue} to ${newValue}`);
  return {
    counter: newValue,
  };
};

// Export default initial state
export const initialState = 0;
