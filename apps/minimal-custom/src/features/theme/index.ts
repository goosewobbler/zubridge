import type { AnyState } from '@zubridge/types';

/**
 * Theme feature for custom mode
 * In custom mode, theme logic is handled by the custom state manager
 */

export const themeHandlers = {
  'THEME:TOGGLE': (state: AnyState) => {
    const currentTheme = state.theme as 'light' | 'dark' | undefined;
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    console.log(`[Custom Theme] Toggling theme from ${currentTheme || 'unknown'} to ${newTheme}`);
    return {
      theme: newTheme,
    };
  },
};
