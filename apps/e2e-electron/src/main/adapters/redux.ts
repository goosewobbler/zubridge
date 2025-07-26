import type { Store } from 'redux';
import type { UnifiedStore } from './index.js';

/**
 * Creates a Redux store adapter that conforms to the UnifiedStore interface
 * This is a more type-safe approach than casting
 */
export function createReduxAdapter<S>(reduxStore: Store<S>): UnifiedStore<S> {
  let previousState = reduxStore.getState();
  let storeSubscriptions: (() => void)[] = []; // Track subscriptions for cleanup
  let isDestroyed = false;

  return {
    getState: reduxStore.getState,
    getInitialState: reduxStore.getState,
    setState: (_partial, _replace) => {
      if (isDestroyed) {
        console.warn('[Redux Adapter] Cannot setState on destroyed store');
        return;
      }
      throw new Error('setState is not supported for Redux stores, use dispatch instead');
    },
    subscribe: (listener) => {
      if (isDestroyed) {
        console.warn('[Redux Adapter] Cannot subscribe to destroyed store');
        return () => {};
      }

      const unsubscribe = reduxStore.subscribe(() => {
        if (isDestroyed) return;
        try {
          const currentState = reduxStore.getState();
          listener(currentState, previousState);
          previousState = currentState;
        } catch (error) {
          console.warn('[Redux Adapter] Error in subscription listener:', error);
        }
      });

      // Track this subscription for cleanup
      storeSubscriptions.push(unsubscribe);

      return () => {
        try {
          unsubscribe();
          // Remove from tracking array
          const index = storeSubscriptions.indexOf(unsubscribe);
          if (index > -1) {
            storeSubscriptions.splice(index, 1);
          }
        } catch (error) {
          console.warn('[Redux Adapter] Error unsubscribing:', error);
        }
      };
    },
    destroy: () => {
      if (isDestroyed) {
        console.warn('[Redux Adapter] Store already destroyed');
        return;
      }

      // Clean up all tracked subscriptions - this is the critical part for Redux
      console.log('[Redux Adapter] Cleaning up', storeSubscriptions.length, 'subscriptions');
      storeSubscriptions.forEach((unsubscribe) => {
        try {
          unsubscribe();
        } catch (error) {
          console.warn('[Redux Adapter] Error unsubscribing during cleanup:', error);
        }
      });
      storeSubscriptions = [];
      isDestroyed = true;

      // Note: Redux stores don't have a built-in destroy method
      // The main cleanup is unsubscribing listeners to prevent memory leaks
      // Store reference cleanup happens at the application level
    },
  };
}
