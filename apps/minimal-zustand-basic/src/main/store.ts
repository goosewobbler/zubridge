import { create, type StoreApi } from 'zustand';
import type { State } from '../features/index.js';
import { initialState } from '../features/index.js';
import { createCounterHandlers } from '../features/counter/index.js';
import { createThemeHandlers } from '../features/theme/index.js';

/**
 * Creates a Zustand store for the basic mode
 * In basic mode, action handlers are attached directly to the store state
 */
export function createStore(): StoreApi<State> {
  console.log('[Basic Mode] Creating Zustand store');

  const store = create<State>()(() => initialState);

  // Create action handlers using the features pattern
  const counterHandlers = createCounterHandlers(store);
  const themeHandlers = createThemeHandlers(store);

  // Attach action handlers to the store (basic mode pattern)
  store.setState((state) => ({
    ...state,
    ...counterHandlers,
    ...themeHandlers,
  }));

  return store;
}
