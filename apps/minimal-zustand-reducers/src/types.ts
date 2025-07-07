import type { State } from './features/index.js';

// Re-export the State type for convenience
export type { State };

// Index signature to satisfy AnyState requirement
export interface AppState extends State {
  [key: string]: unknown;
}
