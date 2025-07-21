import { type StoreApi } from 'zustand';
import type { State } from '../index.js';

/**
 * Creates a theme toggle handler for the handlers mode
 * In handlers mode, each action has a dedicated handler function
 */
export const toggleTheme =
  <S extends State>(store: StoreApi<S>) =>
  () => {
    console.log('[Handler] Toggling theme');

    store.setState((state) => {
      const currentTheme = state.theme || 'light';
      const newTheme = currentTheme === 'dark' ? 'light' : 'dark';

      console.log(`[Handler] Changing theme from ${currentTheme} to ${newTheme}`);

      return {
        ...state,
        theme: newTheme,
      };
    });
  };

/**
 * Creates a theme set handler for the handlers mode
 * Allows setting the theme to a specific value (dark or light)
 */
export const setTheme =
  <S extends State>(store: StoreApi<S>) =>
  (isDark: boolean) => {
    const theme = isDark ? 'dark' : 'light';
    console.log(`[Handler] Setting theme to ${theme}`);

    store.setState((state) => ({
      ...state,
      theme,
    }));
  };
