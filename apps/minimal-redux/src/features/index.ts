/**
 * Types for the Redux mode state
 * In Redux mode, we use Redux Toolkit to manage state
 */
export interface State {
  counter: number;
  theme: 'light' | 'dark';

  // Index signature to satisfy AnyState requirement
  [key: string]: any;
}

/**
 * Initial state for Redux mode
 */
export const initialState: State = {
  counter: 0,
  theme: 'dark',
};
