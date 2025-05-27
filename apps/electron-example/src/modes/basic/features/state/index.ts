import { type StoreApi } from 'zustand';
import { initialState, type BaseState } from '@zubridge/apps-shared';

/**
 * Attaches the state handlers to the state object
 * In the basic mode, handlers are part of the state object itself
 */
export const attachStateHandlers = <S extends BaseState>(store: StoreApi<S>) => {
  const { setState } = store;

  // Set up state handlers
  setState((state) => ({
    ...state,

    // Implement the reset state handler
    'STATE:RESET': () => {
      console.log('[Basic] Resetting state to defaults');
      setState(() => initialState as Partial<S>);
    },

    // Implement the generate filler state handler
    'STATE:GENERATE-FILLER': async () => {
      console.log('[Basic] Generating large filler state');

      // Generate 1000 random key-value pairs
      const filler: Record<string, number> = {};
      for (let i = 0; i < 1000; i++) {
        filler[`key${i}`] = Math.random();
      }

      setState((state) => ({
        ...state,
        filler,
      }));

      console.log('[Basic] Large filler state generated');
    },
  }));
};
