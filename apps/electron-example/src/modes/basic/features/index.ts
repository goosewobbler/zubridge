import { type StoreApi } from 'zustand';
import { type BaseState } from '@zubridge/apps-shared';
import { attachCounterHandlers } from './counter/index.js';
import { attachThemeHandlers } from './theme/index.js';
import { attachStateHandlers } from './state/index.js';
import { attachErrorHandlers } from './error/index.js';

/**
 * Types for the basic mode state
 * In the basic mode pattern, handlers are attached directly to the state object
 */
export interface State extends BaseState {
  // Action handlers
  'COUNTER:INCREMENT': () => void;
  'COUNTER:DECREMENT': () => void;
  'COUNTER:SET': (value: number) => void;
  'COUNTER:SET:SLOW': (value: number) => void;
  'THEME:TOGGLE': () => void;
  'THEME:SET': (isDark: boolean) => void;
  'STATE:RESET': () => void;
  'STATE:GENERATE-FILLER': () => void;
  'ERROR:TRIGGER_MAIN_PROCESS_ERROR': () => void;
}

/**
 * Attaches all feature handlers to the store
 */
export const attachFeatureHandlers = <S extends BaseState>(store: StoreApi<S>) => {
  // Attach all feature handlers
  attachCounterHandlers(store);
  attachThemeHandlers(store);
  attachStateHandlers(store);
  attachErrorHandlers(store);
};
