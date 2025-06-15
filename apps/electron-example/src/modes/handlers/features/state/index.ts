import type { StoreApi } from 'zustand';
import type { BaseState } from '../../../../types.js';
import { initialState, generateTestState } from '@zubridge/apps-shared';

/**
 * Reset state to initial values
 */
export const resetState =
  <S extends BaseState>(store: StoreApi<S>) =>
  async () => {
    console.log('[Handler] Resetting state to defaults');
    store.setState(initialState as S);
  };

/**
 * Generate large state for testing
 */
export const generateLargeState =
  <S extends BaseState>(store: StoreApi<S>) =>
  async (options?: { variant?: 'small' | 'medium' | 'large' | 'xl' }) => {
    const variant = options?.variant || 'medium';
    console.log(`[Handler] Generating ${variant} test state`);

    const currentState = store.getState();

    // Use the shared generateTestState function
    const filler = generateTestState(variant);

    store.setState({
      ...currentState,
      filler,
    } as S);

    console.log(`[Handler] ${variant} test state generated (${filler.meta.estimatedSize})`);
  };
