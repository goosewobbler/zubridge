import type { AnyState } from '@zubridge/types';
import { initialState, type BaseState } from '@zubridge/apps-shared';
import * as counter from './counter/index.js';
import * as theme from './theme/index.js';
import * as state from './state/index.js';
import * as error from './error/index.js';

/**
 * Get the initial state for all features
 */
export const getInitialState = (): BaseState => ({
  ...initialState,
});

/**
 * Action handlers for the custom mode
 */
export const handlers = {
  'COUNTER:INCREMENT': (state: AnyState) => counter.increment(state),
  'COUNTER:DECREMENT': (state: AnyState) => counter.decrement(state),
  'COUNTER:SET': (payload: number) => counter.setValue(payload),
  'COUNTER:SET:SLOW': (payload: number) => counter.setValueSlow(payload),
  'THEME:TOGGLE': (state: AnyState) => theme.toggle(state),
  'THEME:SET': (payload: boolean) => theme.setValue(payload),
  'STATE:RESET': () => state.reset(),
  'STATE:GENERATE-FILLER': () => state.generateLargeState(),
  'ERROR:TRIGGER_MAIN_PROCESS_ERROR': () => error.triggerMainProcessError(),
};
