import { type StoreApi } from 'zustand';
import { initialState } from '@zubridge/apps-shared';
import { State } from '../../../basic/features/index.js';

/**
 * Creates a handler function for resetting state to defaults
 */
export const resetState =
  <S extends State>(store: StoreApi<S>) =>
  () => {
    console.log('[Handler] Resetting state to defaults');
    store.setState(() => initialState as Partial<S>);
  };

/**
 * Creates a handler function for generating large state
 */
export const generateLargeState =
  <S extends State>(store: StoreApi<S>) =>
  async () => {
    console.log('[Handler] Generating large filler state');

    // Generate 1000 random key-value pairs
    const filler: Record<string, number> = {};
    for (let i = 0; i < 1000; i++) {
      filler[`key${i}`] = Math.random();
    }

    store.setState((state) => ({
      ...state,
      filler,
    }));

    console.log('[Handler] Large filler state generated');
  };
