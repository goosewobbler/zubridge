import { create, type StoreApi } from 'zustand';
import type { State } from '../../types/index.js';

/**
 * Gets or creates the reducers store
 * Uses Zustand with a simple state object
 */
export function getReducersStore(initialState?: Partial<State>): StoreApi<State> {
  console.log('[Reducers Mode] Creating Zustand store');

  return create<State>()(() => initialState as State);
}
