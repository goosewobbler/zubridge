/**
 * Types for the custom mode state
 * In custom mode, we use a custom state manager implementation
 */
export interface State {
  counter: number;
  theme: 'light' | 'dark';

  // Index signature to satisfy AnyState requirement
  [key: string]: unknown;
}

/**
 * Initial state for custom mode
 */
export const initialState: State = {
  counter: 0,
  theme: 'dark',
};

export * from './counter/index.js';
export * from './theme/index.js';

// Combine all handlers for use in the store
import { counterHandlers } from './counter/index.js';
import { themeHandlers } from './theme/index.js';

export const handlers = {
  ...counterHandlers,
  ...themeHandlers,
};
