import { useState, useEffect } from 'react';

// Define a generic store type with bridge status
interface BridgeStateStore {
  __bridge_status?: 'ready' | 'error' | 'initializing';
  [key: string]: any;
}

type BridgeStatus = 'ready' | 'error' | 'initializing';

/**
 * Hook to extract bridge status from a store
 *
 * @param store The store object that contains __bridge_status
 * @returns The current bridge status
 */
export function useBridgeStatus(store: BridgeStateStore | null): BridgeStatus {
  const [bridgeStatus, setBridgeStatus] = useState<BridgeStatus>('initializing');

  useEffect(() => {
    // Initial check
    if (store) {
      console.log('[useBridgeStatus] Initial store state:', store);
      // If the store has a __bridge_status property, use it
      if (store.__bridge_status) {
        console.log('[useBridgeStatus] Setting bridge status to:', store.__bridge_status);
        setBridgeStatus(store.__bridge_status);
      } else {
        // If we have a store but no __bridge_status, assume it's ready
        console.log('[useBridgeStatus] No __bridge_status found in store, assuming ready');
        setBridgeStatus('ready');
      }
    }

    // If there's a subscribe method on the store, use it to listen for changes
    if (store && 'subscribe' in store && typeof store.subscribe === 'function') {
      const unsubscribe = store.subscribe((state: BridgeStateStore) => {
        console.log('[useBridgeStatus] Store updated, new state:', state);
        if (state.__bridge_status && state.__bridge_status !== bridgeStatus) {
          console.log('[useBridgeStatus] Updating bridge status to:', state.__bridge_status);
          setBridgeStatus(state.__bridge_status);
        }
      });

      return () => {
        // Clean up the subscription
        if (typeof unsubscribe === 'function') {
          unsubscribe();
        }
      };
    }
  }, [store, bridgeStatus]);

  return bridgeStatus;
}
