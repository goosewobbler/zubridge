import { type StoreApi } from 'zustand';
import type { UnifiedStore } from './index.js';

/**
 * Creates a Zustand store adapter that conforms to the UnifiedStore interface
 * This handles the incompatible method signatures between StoreApi and UnifiedStore
 */
export function createZustandAdapter<S>(zustandStore: StoreApi<S>): UnifiedStore<S> {
  let previousState = zustandStore.getState();

  return {
    getState: zustandStore.getState,
    getInitialState: zustandStore.getState,
    setState: (partial, replace) => {
      if (replace === true) {
        // When replace is true, we need the full state, not partial
        if (typeof partial === 'function') {
          const fullState = partial(zustandStore.getState()) as S;
          zustandStore.setState(fullState, true);
        } else {
          // Convert partial to full state
          zustandStore.setState({ ...zustandStore.getState(), ...partial } as S, true);
        }
      } else {
        // Normal case - partial update
        zustandStore.setState(partial as any);
      }
    },
    subscribe: (listener) => {
      return zustandStore.subscribe((currentState) => {
        listener(currentState, previousState);
        previousState = currentState;
      });
    },
  };
}
