import { configureStore } from '@reduxjs/toolkit';
import { type StoreApi, create } from 'zustand';
import { getZubridgeMode } from '../utils/mode.js';
import type { State } from '../types/index.js';
import type { Store } from 'redux';

// Singleton store instance
let store: StoreApi<State>;

/**
 * Creates a Redux store adapter that conforms to the Zustand StoreApi interface
 * This is a more type-safe approach than casting
 */
function createReduxAdapter<S>(reduxStore: Store<S>): StoreApi<S> {
  let previousState = reduxStore.getState();

  return {
    getState: reduxStore.getState,
    getInitialState: reduxStore.getState,
    setState: (_partial, _replace) => {
      throw new Error('setState is not supported for Redux stores. Please use dispatch to update the state.');
    },
    subscribe: (listener) => {
      const unsubscribe = reduxStore.subscribe(() => {
        const currentState = reduxStore.getState();
        listener(currentState, previousState);
        previousState = currentState;
      });
      return unsubscribe;
    },
  };
}

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
      const { getBasicStore } = await import('../modes/basic/store.js');
      return getBasicStore();

    case 'handlers':
      const { getHandlersStore } = await import('../modes/handlers/store.js');
      return getHandlersStore();

    case 'reducers':
      const { getReducersStore } = await import('../modes/reducers/store.js');
      return getReducersStore();

    case 'redux':
      // For Redux mode, create a Redux store with a root reducer
      const { rootReducer } = await import('../modes/redux/features/index.js');

      const reduxStore = configureStore({
        reducer: rootReducer,
      });
      // Use our adapter instead of unsafe casting
      return createReduxAdapter(reduxStore);

    case 'custom':
      // For custom mode, get our EventEmitter-based store
      console.log('[Store] Custom mode detected - loading custom store');
      const { getCustomStore } = await import('../modes/custom/store.js');

      // Get the custom store which implements StateManager
      const customStore = getCustomStore();

      // Create an adapter that conforms to StoreApi
      return {
        getState: () => customStore.getState() as State,
        getInitialState: () => customStore.getState() as State,
        setState: (partial, replace) => {
          // Using processAction since StateManager doesn't have setState
          if (typeof partial === 'function') {
            const currentState = customStore.getState() as State;
            const newState = partial(currentState);

            // Use processAction with a custom action
            customStore.processAction({
              type: 'SET_STATE',
              payload: newState,
            });
          } else {
            // Use processAction with a custom action
            customStore.processAction({
              type: 'SET_STATE',
              payload: partial,
            });
          }
        },
        subscribe: (listener) => {
          return customStore.subscribe((state) => listener(state as State, state as State));
        },
      };

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
