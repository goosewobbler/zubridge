import type { Handler } from '@zubridge/types';
import { incrementCounter, decrementCounter, setCounter } from './counter/index.js';
import { toggleTheme, setTheme } from './theme/index.js';
import { resetState } from './state/index.js';
import { triggerMainProcessError } from './error/index.js';

/**
 * Types for the handlers mode state
 */
export interface State {
  counter: number;
  theme: 'light' | 'dark';
  filler: { meta: { estimatedSize: string } };
  [key: string]: unknown; // Index signature to satisfy AnyState requirement
}

/**
 * Action handlers for the handlers mode
 * In this mode, we define handlers for each action type
 * rather than using reducers
 */
export interface CounterHandlers {
  'COUNTER:INCREMENT': () => void;
  'COUNTER:DECREMENT': () => void;
  'COUNTER:SET': (value: number) => void;
}

/**
 * Theme action handlers for the handlers mode
 */
export interface ThemeHandlers {
  'THEME:TOGGLE': () => void;
  'THEME:SET': (isDark: boolean) => void;
}

/**
 * State action handlers for the handlers mode
 */
export interface StateHandlers {
  'STATE:RESET': () => void;
}

/**
 * Error action handlers for the handlers mode
 */
export interface ErrorHandlers {
  'ERROR:TRIGGER_MAIN_PROCESS_ERROR': () => void;
}

// Define ActionHandlers as a Record<string, Handler> to be compatible with createDispatch
export type ActionHandlers = Record<string, Handler> & CounterHandlers & ThemeHandlers & StateHandlers & ErrorHandlers;
