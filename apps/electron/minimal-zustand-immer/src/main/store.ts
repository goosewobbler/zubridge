import { create, type StoreApi } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { createCounterHandlers } from '../features/counter/index.js';
import type { State } from '../features/index.js';
import { initialState } from '../features/index.js';
import { createThemeHandlers } from '../features/theme/index.js';

/**
 * Creates a Zustand store using Immer middleware
 * The immer middleware wraps the store, allowing mutable-style updates with setState
 */
export function createStore(): StoreApi<State> {
  console.log('[Immer Mode] Creating Zustand store with Immer middleware');

  // Wrap the store creator with immer middleware
  const store = create<State>()(immer(() => initialState));

  // Create action handlers - they will use the immer-wrapped setState
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
