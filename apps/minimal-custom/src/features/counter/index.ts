import type { AnyState } from '@zubridge/types';

/**
 * Counter feature for custom mode
 * In custom mode, counter logic is handled by the custom state manager
 */

export const counterHandlers = {
  'COUNTER:INCREMENT': (state: AnyState) => {
    console.log('[Custom Counter] Incrementing counter');
    return {
      counter: (state.counter as number) + 1,
    };
  },
  'COUNTER:DECREMENT': (state: AnyState) => {
    console.log('[Custom Counter] Decrementing counter');
    return {
      counter: (state.counter as number) - 1,
    };
  },
};
