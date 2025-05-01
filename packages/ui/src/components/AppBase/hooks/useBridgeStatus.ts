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
    if (store && store.__bridge_status) {
      setBridgeStatus(store.__bridge_status);
    }
  }, [store]);

  return bridgeStatus;
}
