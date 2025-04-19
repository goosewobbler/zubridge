import { create, type StoreApi } from 'zustand';
import type { State } from '../../types/index.js';

/**
 * Gets or creates the handlers store
 * Uses Zustand with a simple state object
 */
export function getHandlersStore(initialState?: Partial<State>): StoreApi<State> {
  console.log('[Handlers Mode] Creating Zustand store');

  return create<State>()(() => initialState as State);
}
