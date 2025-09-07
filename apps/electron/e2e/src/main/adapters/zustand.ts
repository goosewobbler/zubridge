import type { StoreApi } from 'zustand';
import type { UnifiedStore } from './index.js';

/**
 * Creates a Zustand store adapter that conforms to the UnifiedStore interface
 * This handles the incompatible method signatures between StoreApi and UnifiedStore
 */
export function createZustandAdapter<S>(zustandStore: StoreApi<S>): UnifiedStore<S> {
  let previousState = zustandStore.getState();
  let isDestroyed = false;
  let storeSubscriptions: (() => void)[] = []; // Track subscriptions for cleanup

  return {
    getState: zustandStore.getState,
    getInitialState: zustandStore.getState,
    setState: (partial, replace) => {
      if (isDestroyed) {
        console.warn('[Zustand Adapter] Cannot setState on destroyed store');
        return;
      }

      try {
        // Handle function vs object partial updates with proper Zustand typing
        if (typeof partial === 'function') {
          if (replace) {
            // When replace=true, must return complete state S
            zustandStore.setState((state: S) => partial(state) as S, true);
          } else {
            // When replace=false, can return Partial<S>
            zustandStore.setState((state: S) => partial(state), false);
          }
        } else {
          // Direct partial object update
          if (replace) {
            zustandStore.setState(partial as S, true);
          } else {
            zustandStore.setState(partial, false);
          }
        }
      } catch (error) {
        console.warn('[Zustand Adapter] Error in setState:', error);
      }
    },
    subscribe: (listener) => {
      if (isDestroyed) {
        console.warn('[Zustand Adapter] Cannot subscribe to destroyed store');
        return () => {};
      }

      const unsubscribe = zustandStore.subscribe((currentState) => {
        if (isDestroyed) return;
        try {
          listener(currentState, previousState);
          previousState = currentState;
        } catch (error) {
          console.warn('[Zustand Adapter] Error in subscription listener:', error);
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
          console.warn('[Zustand Adapter] Error unsubscribing:', error);
        }
      };
    },
    destroy: () => {
      if (isDestroyed) {
        console.warn('[Zustand Adapter] Store already destroyed');
        return;
      }

      // Clean up all tracked subscriptions - critical for preventing memory leaks
      console.log('[Zustand Adapter] Cleaning up', storeSubscriptions.length, 'subscriptions');
      storeSubscriptions.forEach((unsubscribe) => {
        try {
          unsubscribe();
        } catch (error) {
          console.warn('[Zustand Adapter] Error unsubscribing during cleanup:', error);
        }
      });
      storeSubscriptions = [];
      isDestroyed = true;

      // Note: Zustand stores don't have a built-in destroy method
      // Main cleanup is unsubscribing listeners and clearing references
      // Store reference cleanup happens at the application level
    },
  };
}
