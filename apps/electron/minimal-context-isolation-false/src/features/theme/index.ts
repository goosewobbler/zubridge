import type { StoreApi } from 'zustand';
import type { State } from '../index.js';

/**
 * Creates action handlers for theme operations in basic mode
 * In basic mode, these handlers are attached directly to the store state
 */
export const createThemeHandlers = (store: StoreApi<State>) => {
  return {
    'THEME:TOGGLE': () => {
      console.log('[Basic] Toggling theme');
      store.setState((state) => ({
        ...state,
        theme: state.theme === 'dark' ? 'light' : 'dark',
      }));
    },
  };
};
