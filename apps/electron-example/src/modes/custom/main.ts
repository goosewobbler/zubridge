import { createCoreBridge, createDispatch } from '@zubridge/electron/main';
import type { BrowserWindow } from 'electron';
import type { ZustandBridge } from '@zubridge/electron/main';
import type { StateManager } from '@zubridge/types';
import { getCustomStore } from './store.js';

/**
 * Creates a bridge using the custom store approach
 * This demonstrates how to use createCoreBridge with a custom state manager
 */
export const createCustomBridge = (windows: BrowserWindow[] = []): ZustandBridge => {
  console.log('[Custom Mode] Creating bridge with custom state manager');

  // Get a CustomStore instance from our implementation
  // This is important because it already implements the StateManager interface
  const customStore = getCustomStore();

  // Create the core bridge with our custom store
  const coreBridge = createCoreBridge(customStore, windows);

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
  };
};
