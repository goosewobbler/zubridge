/**
 * Unified store interface that can handle both Zustand and Redux stores
 * Provides a common contract for what a store must provide
 */
export interface UnifiedStore<T> {
  getState: () => T;
  getInitialState: () => T;
  setState: (partial: Partial<T> | ((state: T) => Partial<T>), replace?: boolean) => void;
  subscribe: (listener: (state: T, prevState: T) => void) => () => void;
  // Additional methods can be added as needed
}

export { createReduxAdapter } from './redux.js';
export { createZustandAdapter } from './zustand.js';
export { createCustomAdapter } from './custom.js';
