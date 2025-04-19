import type { AnyState } from '@zubridge/types';

/**
 * Theme state interface
 */
export interface ThemeState {
  isDark: boolean;
}

/**
 * Toggle theme action handler for custom mode
 */
export const toggle = (state: AnyState): Partial<AnyState> => {
  const currentTheme = state.theme as ThemeState | undefined;
  const isDark = !(currentTheme?.isDark ?? false);

  console.log(
    `[Custom Theme] Toggling theme from ${currentTheme?.isDark ? 'dark' : 'light'} to ${isDark ? 'dark' : 'light'}`,
  );

  return {
    theme: {
      isDark,
    },
  };
};

/**
 * Set theme action handler for custom mode
 * @param isDark Whether dark theme should be enabled
 */
export const setValue = (isDark: boolean): Partial<AnyState> => {
  console.log(`[Custom Theme] Setting theme to ${isDark ? 'dark' : 'light'}`);

  return {
    theme: {
      isDark,
    },
  };
};

// Export default initial state
export const initialState: ThemeState = {
  isDark: true,
};
