import { createCoreBridge, createDispatch } from '@zubridge/electron/main';
import type { CustomBridge } from '@zubridge/types';
import type { BaseState } from '../../types.js';
import type { CustomStore } from './store.js';

/**
 * Creates a bridge using the custom store approach
 * This demonstrates how to use createCoreBridge with a custom state manager
 */
export const createCustomBridge = (customStore: CustomStore): CustomBridge<BaseState> => {
  console.log('[Custom Mode] Creating bridge with custom state manager');

  const coreBridge = createCoreBridge(customStore);

  // Create a dispatch function that works with our store
  const dispatchFn = createDispatch(customStore);

  // Log initial state for debugging
  console.log('[Custom Mode] Initial state:', customStore.getState());

  // Return the bridge interface that matches other bridge implementations
  return {
    subscribe: coreBridge.subscribe,
    unsubscribe: coreBridge.unsubscribe,
    destroy: coreBridge.destroy,
    dispatch: dispatchFn,
    getWindowSubscriptions: coreBridge.getWindowSubscriptions,
  };
};
