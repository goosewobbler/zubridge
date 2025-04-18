import { configureStore } from '@reduxjs/toolkit';
import { type StoreApi, create } from 'zustand';
import { getZubridgeMode } from '../utils/mode.js';
import type { State } from '../types/index.js';

// Singleton store instance
let store: StoreApi<State>;

/**
 * Creates a store for the current Zubridge mode
 */
export async function createModeStore(): Promise<StoreApi<State>> {
  const mode = getZubridgeMode();
  console.log('Creating store for mode:', mode);

  // Initialize with a default true value for isDark (dark mode by default)
  const initialState = {
    counter: 0,
    theme: { isDark: true },
  };

  switch (mode) {
    case 'basic':
      // For basic mode, create a simple Zustand store
      return create<State>()(() => initialState);

    case 'handlers':
      // For handlers mode, create a Zustand store with the same initial state
      return create<State>()(() => initialState);

    case 'reducers':
      // For reducers mode, create a Zustand store with the same initial state
      return create<State>()(() => initialState);

    case 'redux':
      // For Redux mode, create a Redux store with a root reducer
      const { rootReducer } = await import('../modes/redux/features/index.js');

      const reduxStore = configureStore({
        reducer: rootReducer,
      });
      return reduxStore as unknown as StoreApi<State>;

    case 'custom':
      // For custom mode, create a dummy store shell
      // This won't actually be used for state management since we have a custom state manager
      console.log('[Store] Custom mode detected - using dummy store');
      return {
        getState: () => initialState,
        setState: () => {},
        subscribe: () => () => {},
        destroy: () => {},
      } as unknown as StoreApi<State>;

    default:
      console.warn('Unknown mode, falling back to basic store');
      return create<State>()(() => initialState);
  }
}

// Export a singleton store
export { store };

// Initialize the store
export const initStore = async () => {
  store = await createModeStore();
  return store;
};
