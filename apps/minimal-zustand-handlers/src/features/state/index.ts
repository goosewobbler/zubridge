import type { StoreApi } from 'zustand';

const initialState = {
  counter: 0,
  theme: 'dark' as const,
  filler: { meta: { estimatedSize: '0 B' } },
};

/**
 * Reset state to initial values
 */
export const resetState =
  <S extends { [key: string]: unknown }>(store: StoreApi<S>) =>
  async () => {
    console.log('[Handler] Resetting state to defaults');
    store.setState(initialState as unknown as S);
  };
