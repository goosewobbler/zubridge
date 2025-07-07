import { type StoreApi } from 'zustand';
import { initialState, type BaseState, generateTestState } from '@zubridge/apps-shared';

/**
 * Attaches the state handlers to the state object
 * In the basic mode, handlers are part of the state object itself
 */
export const attachStateHandlers = <S extends BaseState>(store: StoreApi<S>) => {
  const { setState } = store;

  // Set up state handlers
  setState((state) => ({
    ...state,

    'STATE:RESET': () => {
      console.log('[Basic] Resetting state to defaults');
      setState(() => initialState as Partial<S>);
    },

    'STATE:GENERATE-FILLER': async (options?: { variant?: 'small' | 'medium' | 'large' | 'xl' }) => {
      const variant = options?.variant || 'medium';
      console.log(`[Basic] Generating ${variant} test state`);

      // Use the shared generateTestState function
      const filler = generateTestState(variant);

      setState((state) => ({
        ...state,
        filler,
      }));

      console.log(`[Basic] ${variant} test state generated (${filler.meta.estimatedSize})`);
    },
  }));
};
