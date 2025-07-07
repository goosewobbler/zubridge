import { create, type StoreApi } from 'zustand';
import type { State } from './features/index.js';

const initialState: State = {
  counter: 0,
  theme: 'dark',
  filler: { meta: { estimatedSize: '0 B' } },
};

/**
 * Gets or creates the reducers store
 * Uses Zustand with a simple state object
 */
export function getReducersStore(initialStateOverride?: Partial<State>): StoreApi<State> {
  console.log('[Reducers Mode] Creating Zustand store');

  return create<State>()(() => ({
    ...initialState,
    ...initialStateOverride,
  }));
}
