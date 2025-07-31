import { create, type StoreApi } from 'zustand';
import type { State } from '../../types.js';
import { debug } from '@zubridge/core';

/**
 * Gets or creates the reducers store
 * Uses Zustand with a simple state object
 */
export function getReducersStore(initialState?: Partial<State>): StoreApi<State> {
  debug('store', '[Reducers Mode] Creating Zustand store');

  return create<State>()(() => initialState as State);
}
