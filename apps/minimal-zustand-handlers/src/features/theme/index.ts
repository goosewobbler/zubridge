import { type StoreApi } from 'zustand';

/**
 * Creates a theme toggle handler for the handlers mode
 * In handlers mode, each action has a dedicated handler function
 */
export const toggleTheme =
  <S extends { theme?: 'light' | 'dark'; [key: string]: unknown }>(store: StoreApi<S>) =>
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
