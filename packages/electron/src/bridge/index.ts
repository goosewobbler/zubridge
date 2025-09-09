import { debug } from '@zubridge/core';
import type { AnyState, BackendBridge, StateManager } from '@zubridge/types';
import type { Store } from 'redux';
import type { StoreApi } from 'zustand';
import type { ReduxOptions } from '../adapters/redux.js';
import type { ZustandOptions } from '../adapters/zustand.js';
import { getStateManager } from '../registry/stateManagerRegistry.js';
import type { CoreBridgeOptions } from '../types/bridge.js';
import { createCoreBridge as createCoreBridgeImpl } from './BridgeFactory.js';

// Re-export types for external use
export type { CoreBridgeOptions };

/**
 * Creates a core bridge between the main process and renderer processes
 * This implements the Zubridge Electron backend contract without requiring a specific state management library
 */
export function createCoreBridge<State extends AnyState>(
  stateManager: StateManager<State>,
  options?: CoreBridgeOptions,
): BackendBridge<number> {
  return createCoreBridgeImpl(stateManager, options);
}

/**
 * Creates a bridge from a store (either Zustand or Redux)
 */
export function createBridgeFromStore<S extends AnyState = AnyState>(
  store: StoreApi<S> | Store<S>,
  options?: ZustandOptions<S> | ReduxOptions<S> | CoreBridgeOptions,
): BackendBridge<number> {
  debug('adapters', 'Creating bridge from store');

  // Get the appropriate state manager for this store
  const stateManager = getStateManager(store, options);
  debug('adapters', `Got state manager for store (type: ${typeof store})`);

  // Create a core bridge with this state manager
  return createCoreBridge(stateManager, options as CoreBridgeOptions);
}
