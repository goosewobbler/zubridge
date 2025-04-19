import { type StoreApi } from 'zustand';
import type { BaseState } from '../../../../types/index.js';

/**
 * Attaches the theme handlers to the state object
 * In the basic mode, handlers are part of the state object itself
 */
export const attachThemeHandlers = <S extends BaseState>(store: StoreApi<S>) => {
  const { setState } = store;

  // Set up theme initial state
  setState((state) => ({
    ...state,
    'theme': {
      isDark: true, // Initialize to dark mode
    },

    // Implement the toggle theme handler
    'THEME:TOGGLE': () => {
      console.log('[Basic] Toggling theme');
      setState((state) => ({
        ...state,
        theme: {
          isDark: !state.theme.isDark,
        },
      }));
    },

    // Implement the set theme handler
    'THEME:SET': (isDark: boolean) => {
      console.log(`[Basic] Setting theme to ${isDark ? 'dark' : 'light'}`);
      setState((state) => ({
        ...state,
        theme: {
          isDark,
        },
      }));
    },
  }));
};
