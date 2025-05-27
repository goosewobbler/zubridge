import { type StoreApi } from 'zustand';
import type { AnyState } from '@zubridge/types';
import { initialState } from '@zubridge/apps-shared';

let store: StoreApi<AnyState>;

export const init = (s: StoreApi<AnyState>) => {
  store = s;
};

export const reset = () => {
  console.log('[Custom] Resetting state to defaults');
  store.setState(() => initialState as unknown as AnyState);
};

export const generateLargeState = async () => {
  console.log('[Custom] Generating large filler state');

  // Generate 1000 random key-value pairs
  const filler: Record<string, number> = {};
  for (let i = 0; i < 1000; i++) {
    filler[`key${i}`] = Math.random();
  }

  store.setState((state) => ({
    ...state,
    filler,
  }));

  console.log('[Custom] Large filler state generated');
};
