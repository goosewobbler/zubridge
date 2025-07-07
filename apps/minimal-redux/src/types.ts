// State interface for Redux mode
export interface State {
  counter: number;
  theme: 'light' | 'dark';

  // Index signature to satisfy AnyState requirement
  [key: string]: any;
}
