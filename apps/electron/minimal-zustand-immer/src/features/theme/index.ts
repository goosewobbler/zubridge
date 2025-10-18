import type { StoreApi } from 'zustand';
import type { State } from '../index.js';

/**
 * Creates action handlers for theme operations using Immer middleware
 * With immer middleware, setState automatically uses produce() internally
 * This allows direct mutation syntax which is cleaner than manual produce() calls
 */
export const createThemeHandlers = (store: StoreApi<State>) => {
  return {
    'THEME:TOGGLE': () => {
      console.log('[Immer] Toggling theme');
      store.setState((state) => {
        state.theme = state.theme === 'dark' ? 'light' : 'dark';
      });
    },
  };
};
