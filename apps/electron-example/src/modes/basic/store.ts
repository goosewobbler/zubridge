import { create, type StoreApi } from 'zustand';
import type { State } from '../../types/index.js';

/**
 * Gets or creates the basic store
 * Uses Zustand with a simple state object
 */
export function getBasicStore(initialState?: Partial<State>): StoreApi<State> {
  console.log('[Basic Mode] Creating Zustand store');

  return create<State>()(() => initialState as State);
}
