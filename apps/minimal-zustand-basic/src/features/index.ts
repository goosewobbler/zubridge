/**
 * Types for the basic mode state
 * In basic mode, action handlers are properties of the state object
 */
export interface State {
  counter: number;
  theme: 'light' | 'dark';

  // Action handlers for basic mode
  'COUNTER:INCREMENT': () => void;
  'COUNTER:DECREMENT': () => void;
  'THEME:TOGGLE': () => void;

  // Index signature to satisfy AnyState requirement
  [key: string]: any;
}

/**
 * Initial state for basic mode
 */
export const initialState: State = {
  counter: 0,
  theme: 'dark',
  'COUNTER:INCREMENT': () => {},
  'COUNTER:DECREMENT': () => {},
  'THEME:TOGGLE': () => {},
};
