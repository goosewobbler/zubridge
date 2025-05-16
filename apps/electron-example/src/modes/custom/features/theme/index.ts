import type { AnyState } from '@zubridge/types';

/**
 * Toggle theme action handler for custom mode
 */
export const toggle = (state: AnyState): Partial<AnyState> => {
  const currentTheme = state.theme as 'light' | 'dark' | undefined;
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';

  console.log(`[Custom Theme] Toggling theme from ${currentTheme || 'unknown'} to ${newTheme}`);

  return {
    theme: newTheme,
  };
};

/**
 * Set theme action handler for custom mode
 * @param isDark Whether dark theme should be enabled
 */
export const setValue = (isDark: boolean): Partial<AnyState> => {
  const theme = isDark ? 'dark' : 'light';
  console.log(`[Custom Theme] Setting theme to ${theme}`);

  return {
    theme,
  };
};

// Export default initial state
export const initialState = 'dark';
