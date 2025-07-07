import type { Action, Reducer } from '@zubridge/electron';

/**
 * Reducer for theme state
 * In the reducers pattern, the reducer function handles
 * all the theme-related actions
 */
export const reducer: Reducer<'light' | 'dark'> = (state = 'dark', action: Action) => {
  // Get type from action, handling both string and object actions
  const actionType = typeof action === 'string' ? action : action.type;

  switch (actionType) {
    case 'THEME:TOGGLE':
      console.log('[Reducer] Handling THEME:TOGGLE');
      return state === 'dark' ? 'light' : 'dark';

    case 'THEME:SET': {
      console.log('[Reducer] Handling THEME:SET');
      // Only proceed if action is an object with payload
      if (typeof action === 'object' && 'payload' in action) {
        const isDark = action.payload as boolean;
        const theme = isDark ? 'dark' : 'light';
        console.log(`[Reducer] Setting theme to ${theme}`);
        return theme;
      }
      return state;
    }

    default:
      return state;
  }
};
