import type { AnyState, Thunk } from '@zubridge/types';

/**
 * Base state interface shared across example apps
 */
export interface BaseState extends AnyState {
  counter: number;
  theme: 'light' | 'dark';
}

/**
 * Thunk context information to personalize log messages
 */
export interface ThunkContext {
  /** Where the thunk is executing (main process, renderer, tauri) */
  environment: 'main' | 'renderer' | 'tauri';
  /** Custom prefix for log messages */
  logPrefix?: string;
}

/**
 * Counter operation methods
 */
export type CounterMethod = 'action' | 'thunk' | 'main-thunk' | 'slow-thunk' | 'slow-main-thunk';

/**
 * Thunk creator function type that includes context
 */
export type ThunkCreator<S extends AnyState = BaseState> = (counter: number, context: ThunkContext) => Thunk<S>;
