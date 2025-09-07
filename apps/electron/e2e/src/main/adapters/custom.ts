import type { CustomStore } from '../../modes/custom/store.js';
import type { State } from '../../types.js';
import type { UnifiedStore } from './index.js';

/**
 * Creates a custom store adapter that converts a StateManager to the UnifiedStore interface
 * Useful for EventEmitter-based stores and other custom implementations
 */
export function createCustomAdapter(customStore: CustomStore): UnifiedStore<State> {
  let isDestroyed = false;
  let storeSubscriptions: (() => void)[] = []; // Track subscriptions for cleanup

  return {
    getState: () => customStore.getState() as unknown as State,
    getInitialState: () => customStore.getState() as unknown as State,
    setState: (partial, replace) => {
      if (isDestroyed) {
        console.warn('[Custom Adapter] Cannot setState on destroyed store');
        return;
      }

      try {
        // Use the native setState method which properly handles replace parameter
        if (typeof partial === 'function') {
          const currentState = customStore.getState() as unknown as State;
          const newState = partial(currentState);
          customStore.setState(newState, replace);
        } else {
          customStore.setState(partial, replace);
        }
      } catch (error) {
        console.warn('[Custom Adapter] Error in setState:', error);
      }
    },
    subscribe: (listener) => {
      if (isDestroyed) {
        console.warn('[Custom Adapter] Cannot subscribe to destroyed store');
        return () => {};
      }

      let previousState = customStore.getState() as unknown as State;
      const unsubscribe = customStore.subscribe((state) => {
        if (isDestroyed) return;
        try {
          const currentState = state as unknown as State;
          listener(currentState, previousState);
          previousState = currentState;
        } catch (error) {
          console.warn('[Custom Adapter] Error in subscription listener:', error);
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
          console.warn('[Custom Adapter] Error unsubscribing:', error);
        }
      };
    },
    destroy: () => {
      if (isDestroyed) {
        console.warn('[Custom Adapter] Store already destroyed');
        return;
      }

      // Clean up all tracked subscriptions - this removes EventEmitter listeners
      console.log('[Custom Adapter] Cleaning up', storeSubscriptions.length, 'subscriptions');
      storeSubscriptions.forEach((unsubscribe) => {
        try {
          unsubscribe();
        } catch (error) {
          console.warn('[Custom Adapter] Error unsubscribing during cleanup:', error);
        }
      });
      storeSubscriptions = [];
      isDestroyed = true;

      // Note: Don't call destroyCustomStore() here as it's a singleton
      // The singleton cleanup (removeAllListeners) should be managed at the application level
      // Individual adapter cleanup focuses on its own subscriptions
    },
  };
}
