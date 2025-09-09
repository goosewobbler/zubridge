/**
 * Interface for the counter state which can be either a number or an object with a value property
 */
export interface CounterObject {
  value: number;
}

/**
 * Type for the theme state - now using string-based model exclusively
 */
export type ThemeState = 'dark' | 'light';

/**
 * Interface for the common state shape across platforms
 */
export interface AppState {
  counter?: number | CounterObject;
  theme?: ThemeState;
  __bridge_status?: 'ready' | 'error' | 'initializing' | 'uninitialized';
}

/**
 * Type for a state selector function
 */
export type Selector<T> = (state: AppState) => T;

/**
 * Generic selector that can be used with any store implementation
 */
export function useSelector<T>(store: unknown, selector: Selector<T>): T {
  // This is a utility function that will be implemented by the platform-specific HOCs
  // for example, in Electron it will call useStore(selector)
  return selector(store as AppState);
}

/**
 * Get the counter value from the state, handling both number and object formats
 */
export const getCounterSelector: Selector<number> = (state: AppState) => {
  const counterValue = state.counter;

  if (counterValue && typeof counterValue === 'object' && 'value' in counterValue) {
    return counterValue.value;
  }

  return (counterValue as number) ?? 0;
};

/**
 * Get the dark mode state from the theme using string-based model
 */
export const getThemeSelector: Selector<boolean> = (state: AppState) => {
  // Default to light theme if no theme is set
  if (!state.theme) {
    return false;
  }

  // Simple string check - 'dark' = true, anything else = false
  return state.theme === 'dark';
};

/**
 * Get the bridge status from the state
 */
export const getBridgeStatusSelector: Selector<string> = (state: AppState) => {
  const status = state.__bridge_status || 'ready';

  // Normalize status for Tauri which uses 'uninitialized' instead of 'initializing'
  if (status === 'uninitialized') {
    return 'initializing';
  }

  return status;
};
