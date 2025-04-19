import type { Action, Reducer } from '@zubridge/electron';

export interface ThemeState {
  isDark: boolean;
}

export type ThemeAction = { type: 'THEME:TOGGLE' } | { type: 'THEME:SET'; payload: boolean };

/**
 * Reducer for theme state
 * In the reducers pattern, the reducer function handles
 * all the theme-related actions
 */
export const reducer: Reducer<ThemeState> = (state = { isDark: true }, action: Action) => {
  // Get type from action, handling both string and object actions
  const actionType = typeof action === 'string' ? action : action.type;

  switch (actionType) {
    case 'THEME:TOGGLE':
      console.log('[Reducer] Handling THEME:TOGGLE');
      return {
        isDark: !state.isDark,
      };

    case 'THEME:SET': {
      console.log('[Reducer] Handling THEME:SET');
      // Only proceed if action is an object with payload
      if (typeof action === 'object' && 'payload' in action) {
        const isDark = action.payload as boolean;
        console.log(`[Reducer] Setting theme to ${isDark ? 'dark' : 'light'}`);
        return {
          isDark,
        };
      }
      return state;
    }

    default:
      return state;
  }
};
