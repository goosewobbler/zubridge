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
      const currentIsDark = state.theme?.isDark ?? false;
      const newIsDark = !currentIsDark;

      console.log(
        `[Handler] Changing theme from ${currentIsDark ? 'dark' : 'light'} to ${newIsDark ? 'dark' : 'light'}`,
      );

      return {
        ...state,
        theme: {
          ...state.theme,
          isDark: newIsDark,
        },
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
    console.log(`[Handler] Setting theme to ${isDark ? 'dark' : 'light'}`);

    store.setState((state) => ({
      ...state,
      theme: {
        ...state.theme,
        isDark,
      },
    }));
  };
