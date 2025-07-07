import type { Store } from 'redux';
import type { UnifiedStore } from './index.js';

/**
 * Creates a Redux store adapter that conforms to the UnifiedStore interface
 * This is a more type-safe approach than casting
 */
export function createReduxAdapter<S>(reduxStore: Store<S>): UnifiedStore<S> {
  let previousState = reduxStore.getState();

  return {
    getState: reduxStore.getState,
    getInitialState: reduxStore.getState,
    setState: (_partial, _replace) => {
      throw new Error('setState is not supported for Redux stores, use dispatch instead');
    },
    subscribe: (listener) => {
      const unsubscribe = reduxStore.subscribe(() => {
        const currentState = reduxStore.getState();
        listener(currentState, previousState);
        previousState = currentState;
      });
      return unsubscribe;
    },
  };
}
