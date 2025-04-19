/**
 * Base state interface that all mode-specific states share.
 * This defines the minimal structure expected across all modes.
 */
export interface BaseState {
  counter: number;
  theme: {
    isDark: boolean;
  };
  [key: string]: any; // Add index signature to satisfy AnyState constraint
}

/**
 * Type guard to check if a state object conforms to the BaseState interface
 */
export function isBaseState(state: unknown): state is BaseState {
  if (!state || typeof state !== 'object') return false;

  const s = state as any;
  return typeof s.counter === 'number' && s.theme && typeof s.theme === 'object' && typeof s.theme.isDark === 'boolean';
}

/**
 * Shared State type that all modes can use.
 * For now, it's just an alias for BaseState, but can be extended if needed.
 */
export type State = BaseState;
