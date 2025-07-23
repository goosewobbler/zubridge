import type { Store } from 'redux';
import type { UnifiedStore } from './index.js';

/**
 * Creates a Redux store adapter that conforms to the UnifiedStore interface
 * This is a more type-safe approach than casting
 */
export function createReduxAdapter<S>(reduxStore: Store<S>): UnifiedStore<S> {
  let previousState = reduxStore.getState();
  let storeSubscriptions: (() => void)[] = []; // Track subscriptions for cleanup

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

      // Track this subscription for cleanup
      storeSubscriptions.push(unsubscribe);

      return () => {
        unsubscribe();
        // Remove from tracking array
        const index = storeSubscriptions.indexOf(unsubscribe);
        if (index > -1) {
          storeSubscriptions.splice(index, 1);
        }
      };
    },
    destroy: () => {
      // Clean up all tracked subscriptions
      console.log('[Redux] Cleaning up', storeSubscriptions.length, 'subscriptions');
      storeSubscriptions.forEach((unsubscribe) => {
        try {
          unsubscribe();
        } catch (error) {
          console.warn('[Redux] Error unsubscribing during cleanup:', error);
        }
      });
      storeSubscriptions = [];

      reduxStore = undefined as unknown as Store<S>;
    },
  };
}
