import { create, type StoreApi } from 'zustand';
import type { State } from '../features/index.js';
import { initialState } from '../features/index.js';

/**
 * Creates a Zustand store for the reducers mode
 * Uses Zustand with a simple state object
 */
export function createStore(): StoreApi<State> {
  console.log('[Reducers Mode] Creating Zustand store');

  return create<State>()(() => initialState);
}
