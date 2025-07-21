import { configureStore } from '@reduxjs/toolkit';
import { create } from 'zustand';
import { getZubridgeMode, ZubridgeMode } from '../utils/mode.js';
import type { State } from '../types.js';
import { createReduxAdapter, createZustandAdapter, createCustomAdapter, type UnifiedStore } from './adapters/index.js';
import { debug } from '@zubridge/core';
import { initialState } from '@zubridge/apps-shared';

// Singleton store instance
let store: UnifiedStore<State>;

/**
 * Creates a store for the current Zubridge mode
 */
export async function createModeStore(): Promise<UnifiedStore<State>> {
  const mode = getZubridgeMode();
  debug('store', 'Creating store for mode:', mode);

  switch (mode) {
    case ZubridgeMode.ZustandBasic:
      const { getBasicStore } = await import('../modes/zustand-basic/store.js');
      return createZustandAdapter(getBasicStore());

    case ZubridgeMode.ZustandHandlers:
      const { getHandlersStore } = await import('../modes/zustand-handlers/store.js');
      return createZustandAdapter(getHandlersStore());

    case ZubridgeMode.ZustandReducers:
      const { getReducersStore } = await import('../modes/zustand-reducers/store.js');
      return createZustandAdapter(getReducersStore());

    case ZubridgeMode.Redux:
      // For Redux mode, create a Redux store with a root reducer
      const { rootReducer } = await import('../modes/redux/features/index.js');

      const reduxStore = configureStore({
        reducer: rootReducer,
      });
      // Use our adapter instead of unsafe casting
      return createReduxAdapter(reduxStore) as UnifiedStore<State>;

    case ZubridgeMode.Custom:
      // For custom mode, get our EventEmitter-based store
      debug('store', '[Store] Custom mode detected - loading custom store');
      const { getCustomStore } = await import('../modes/custom/store.js');

      // Get the custom store which implements StateManager
      const customStore = getCustomStore();

      // Use our custom adapter
      return createCustomAdapter(customStore);

    default:
      // Default to zustand-basic mode
      const { getBasicStore: fallback } = await import('../modes/zustand-basic/store.js');
      return createZustandAdapter(fallback());
  }
}

// Export a singleton store
export { store };

// Initialize the store
export const initStore = async () => {
  store = await createModeStore();
  store.setState(initialState);
  return store;
};
