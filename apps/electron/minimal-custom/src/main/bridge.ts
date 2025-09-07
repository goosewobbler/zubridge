import {
  createCoreBridge,
  createDispatch,
  type ZubridgeMiddleware,
  type ZustandBridge,
} from '@zubridge/electron/main';
import type { AnyState, StateManager } from '@zubridge/types';

/**
 * Creates a bridge using the custom store approach
 * This demonstrates how to use createCoreBridge with a custom state manager
 */
export function createBridge(
  store: StateManager<AnyState>,
  middleware?: ZubridgeMiddleware,
): ZustandBridge {
  console.log('[Custom Mode] Creating bridge with custom state manager');

  // Create the core bridge with our custom store
  const coreBridge = createCoreBridge(store, { middleware });

  // Create a dispatch function that works with our store
  const dispatchFn = createDispatch(store);

  // Log initial state for debugging
  console.log('[Custom Mode] Initial state:', store.getState());

  // Return the bridge interface that matches other bridge implementations
  const bridge = {
    subscribe: coreBridge.subscribe,
    unsubscribe: coreBridge.unsubscribe,
    getSubscribedWindows: coreBridge.getSubscribedWindows,
    destroy: coreBridge.destroy,
    dispatch: dispatchFn,
    getWindowSubscriptions: coreBridge.getWindowSubscriptions,
  };

  return bridge;
}
