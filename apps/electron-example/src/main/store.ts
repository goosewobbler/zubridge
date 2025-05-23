import { configureStore } from '@reduxjs/toolkit';
import { create } from 'zustand';
import { getZubridgeMode } from '../utils/mode.js';
import type { State } from '../types.js';
import { createReduxAdapter, createZustandAdapter, createCustomAdapter, type UnifiedStore } from './adapters/index.js';
import { debug } from '@zubridge/core';

// Singleton store instance
let store: UnifiedStore<State>;

/**
 * Creates a store for the current Zubridge mode
 */
export async function createModeStore(): Promise<UnifiedStore<State>> {
  const mode = getZubridgeMode();
  debug('store', 'Creating store for mode:', mode);

  switch (mode) {
    case 'basic':
      const { getBasicStore } = await import('../modes/basic/store.js');
      return createZustandAdapter(getBasicStore());

    case 'handlers':
      const { getHandlersStore } = await import('../modes/handlers/store.js');
      return createZustandAdapter(getHandlersStore());

    case 'reducers':
      const { getReducersStore } = await import('../modes/reducers/store.js');
      return createZustandAdapter(getReducersStore());

    case 'redux':
      // For Redux mode, create a Redux store with a root reducer
      const { rootReducer } = await import('../modes/redux/features/index.js');

      const reduxStore = configureStore({
        reducer: rootReducer,
      });
      // Use our adapter instead of unsafe casting
      return createReduxAdapter(reduxStore) as UnifiedStore<State>;

    case 'custom':
      // For custom mode, get our EventEmitter-based store
      debug('store', '[Store] Custom mode detected - loading custom store');
      const { getCustomStore } = await import('../modes/custom/store.js');

      // Get the custom store which implements StateManager
      const customStore = getCustomStore();

      // Use our custom adapter
      return createCustomAdapter(customStore);

    default:
      debug('store', 'Unknown mode, falling back to basic store');
      return createZustandAdapter(
        create<State>()(() => {
          return {
            counter: 0,
            theme: 'dark' as const, // Use const assertion to make TypeScript recognize this as a string literal
          };
        }),
      );
  }
}

// Export a singleton store
export { store };

// Initialize the store
export const initStore = async () => {
  store = await createModeStore();
  return store;
};
