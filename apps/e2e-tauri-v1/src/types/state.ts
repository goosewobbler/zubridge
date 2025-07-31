/**
 * Common base state interface that all mode-specific states share.
 * This defines the minimal structure expected across all modes.
 */
export interface BaseState {
  counter: number;
  window: {
    isOpen: boolean;
  };
  [key: string]: any; // Add index signature to satisfy AnyState constraint
}

/**
 * Type guard to check if a state object conforms to the BaseState interface
 */
export function isBaseState(state: unknown): state is BaseState {
  if (!state || typeof state !== 'object') return false;

  const s = state as any;
  return (
    typeof s.counter === 'number' && s.window && typeof s.window === 'object' && typeof s.window.isOpen === 'boolean'
  );
}

/**
 * Shared State type that all modes can use
 * This is the common state structure across all modes
 */
export type State = BaseState;
