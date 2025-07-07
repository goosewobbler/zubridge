// Simple state interface for basic mode
export interface State {
  'counter': number;
  'theme': 'light' | 'dark';

  // Action handlers for basic mode
  'COUNTER:INCREMENT': () => void;
  'COUNTER:DECREMENT': () => void;
  'THEME:TOGGLE': () => void;

  // Index signature to satisfy AnyState requirement
  [key: string]: any;
}
