import { type BaseState } from '@zubridge/apps-shared';
import type { Handler } from '@zubridge/types';
import {
  incrementCounter,
  decrementCounter,
  setCounter,
  setCounterSlow,
  doubleCounterSlow,
  halveCounterSlow,
  doubleCounter,
  halveCounter,
} from './counter/index.js';
import { toggleTheme, setTheme } from './theme/index.js';
import { resetState, generateLargeState } from './state/index.js';
import { triggerMainProcessError } from './error/index.js';

/**
 * Types for the handlers mode state
 */
export interface State extends BaseState {}

/**
 * Action handlers for the handlers mode
 * In this mode, we define handlers for each action type
 * rather than using reducers
 */
export interface CounterHandlers {
  'COUNTER:INCREMENT': () => void;
  'COUNTER:DECREMENT': () => void;
  'COUNTER:SET': (value: number) => void;
  'COUNTER:SET:SLOW': (value: number) => void;
  'COUNTER:DOUBLE:SLOW': () => void;
  'COUNTER:HALVE:SLOW': () => void;
  'COUNTER:DOUBLE': () => void;
  'COUNTER:HALVE': () => void;
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
  'STATE:GENERATE-FILLER': () => Promise<void>;
}

/**
 * Error action handlers for the handlers mode
 */
export interface ErrorHandlers {
  'ERROR:TRIGGER_MAIN_PROCESS_ERROR': () => void;
}

// Define ActionHandlers as a Record<string, Handler> to be compatible with createDispatch
export type ActionHandlers = Record<string, Handler> &
  CounterHandlers &
  ThemeHandlers &
  StateHandlers &
  ErrorHandlers;

/**
 * All handlers for the handlers mode
 */
export const handlers = {
  'COUNTER:INCREMENT': incrementCounter,
  'COUNTER:DECREMENT': decrementCounter,
  'COUNTER:SET': setCounter,
  'COUNTER:SET:SLOW': setCounterSlow,
  'COUNTER:DOUBLE:SLOW': doubleCounterSlow,
  'COUNTER:HALVE:SLOW': halveCounterSlow,
  'COUNTER:DOUBLE': doubleCounter,
  'COUNTER:HALVE': halveCounter,
  'THEME:TOGGLE': toggleTheme,
  'THEME:SET': setTheme,
  'STATE:RESET': resetState,
  'STATE:GENERATE-FILLER': generateLargeState,
  'ERROR:TRIGGER_MAIN_PROCESS_ERROR': triggerMainProcessError,
};
