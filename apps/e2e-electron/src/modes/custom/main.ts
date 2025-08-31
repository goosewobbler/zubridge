import type { ZubridgeMiddleware } from '@zubridge/electron/main';
import { createCoreBridge, createDispatch } from '@zubridge/electron/main';
import type { CustomBridge } from '@zubridge/types';
import type { BaseState } from '../../types.js';
import type { CustomStore } from './store.js';

/**
 * Creates a bridge using the custom store approach
 * This demonstrates how to use createCoreBridge with a custom state manager
 */
export const createCustomBridge = (
  customStore: CustomStore,
  middleware?: ZubridgeMiddleware,
): CustomBridge<BaseState> => {
  console.log('[Custom Mode] Creating bridge with custom state manager');

  // Create the core bridge with our custom store
  const coreBridge = createCoreBridge(customStore, { middleware });

  // Create a dispatch function that works with our store
  const dispatchFn = createDispatch(customStore);

  // Log initial state for debugging
  console.log('[Custom Mode] Initial state:', customStore.getState());

  // Return the bridge interface that matches other bridge implementations
  return {
    subscribe: coreBridge.subscribe,
    unsubscribe: coreBridge.unsubscribe,
    getSubscribedWindows: coreBridge.getSubscribedWindows,
    destroy: coreBridge.destroy,
    dispatch: dispatchFn,
    getWindowSubscriptions: coreBridge.getWindowSubscriptions,
  };
};
