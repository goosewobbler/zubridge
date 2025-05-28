import type { StoreApi } from 'zustand';
import type { BaseState } from '../../../../types.js';
import { initialState } from '@zubridge/apps-shared';

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
  async () => {
    const currentState = store.getState();
    store.setState({
      ...currentState,
      largeState: Array(1000)
        .fill(0)
        .map((_, i) => ({ id: i, value: `Item ${i}` })),
    } as S);
  };
