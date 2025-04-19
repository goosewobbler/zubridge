import type { AnyState } from '@zubridge/types';
import * as counter from './counter/index.js';
import * as theme from './theme/index.js';

/**
 * Get the initial state for all features
 */
export const getInitialState = (): AnyState => ({
  counter: counter.initialState,
  theme: theme.initialState,
});

/**
 * Action handlers for the custom mode
 */
export const handlers = {
  'COUNTER:INCREMENT': (state: AnyState) => counter.increment(state),
  'COUNTER:DECREMENT': (state: AnyState) => counter.decrement(state),
  'COUNTER:SET': (payload: number) => counter.setValue(payload),
  'THEME:TOGGLE': (state: AnyState) => theme.toggle(state),
  'THEME:SET': (payload: boolean) => theme.setValue(payload),
};
