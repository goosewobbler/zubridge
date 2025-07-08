import type { Handler } from '@zubridge/types';

/**
 * Types for the handlers mode state
 * In handlers mode, action handlers are separate functions
 */
export interface State {
  counter: number;
  theme: 'light' | 'dark';

  // Index signature to satisfy AnyState requirement
  [key: string]: any;
}

/**
 * Initial state for handlers mode
 */
export const initialState: State = {
  counter: 0,
  theme: 'dark',
};

/**
 * Action handlers for the handlers mode
 * In this mode, we define handlers for each action type
 * rather than using reducers
 */
export interface CounterHandlers {
  'COUNTER:INCREMENT': () => void;
  'COUNTER:DECREMENT': () => void;
}

/**
 * Theme action handlers for the handlers mode
 */
export interface ThemeHandlers {
  'THEME:TOGGLE': () => void;
}

// Define ActionHandlers as a Record<string, Handler> to be compatible with createDispatch
export type ActionHandlers = Record<string, Handler> & CounterHandlers & ThemeHandlers;

export * from './counter/index.js';
export * from './theme/index.js';
