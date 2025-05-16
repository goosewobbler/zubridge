import type { BaseState } from '../../../types.js';

/**
 * Types for the basic mode state
 * In the basic mode pattern, handlers are attached directly to the state object
 */
export interface State extends BaseState {
  // State properties
  'counter': number;
  'window': {
    isOpen: boolean;
  };

  // Action handlers
  'COUNTER:INCREMENT': () => void;
  'COUNTER:DECREMENT': () => void;
  'COUNTER:SET': (value: number) => void;
  'COUNTER:RESET': () => void;
  'WINDOW:CREATE': () => void;
  'WINDOW:CLOSE': (payload?: { windowId?: number }) => void;
}
