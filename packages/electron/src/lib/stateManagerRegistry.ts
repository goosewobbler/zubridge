import type { Store } from 'redux';
import type { StoreApi } from 'zustand/vanilla';
import { debug } from '@zubridge/core';
import type { StateManager, AnyState } from '@zubridge/types';
import { createZustandAdapter, ZustandOptions } from '../adapters/zustand.js';
import { createReduxAdapter, ReduxOptions } from '../adapters/redux.js';
import type { CoreBridgeOptions } from '../bridge.js';

type CombinedOptions<S extends AnyState> = (ZustandOptions<S> | ReduxOptions<S>) & Partial<CoreBridgeOptions>;

// WeakMap allows stores to be garbage collected when no longer referenced
// Use a variable reference so we can replace it in tests
let stateManagerRegistry = new WeakMap<object, StateManager<any>>();

/**
 * Gets a state manager for the given store, creating one if it doesn't exist
 * @internal This is used by createDispatch and createCoreBridge
 */
export function getStateManager<S extends AnyState>(
  store: StoreApi<S> | Store<S>,
  options?: CombinedOptions<S>,
): StateManager<S> {
  debug('state-manager', '[DEBUG] getStateManager called');
  // Check if we already have a state manager for this store
  if (stateManagerRegistry.has(store)) {
    debug('state-manager', '[DEBUG] Returning cached state manager');
    return stateManagerRegistry.get(store) as StateManager<S>;
  }

  // Create a new state manager based on store type
  let stateManager: StateManager<S>;

  if ('setState' in store) {
    debug('state-manager', '[DEBUG] Creating Zustand adapter');
    stateManager = createZustandAdapter(store as StoreApi<S>, options as ZustandOptions<S>);
  } else if ('dispatch' in store) {
    debug('state-manager', '[DEBUG] Creating Redux adapter');
    stateManager = createReduxAdapter(store as Store<S>, options as ReduxOptions<S>);
  } else {
    throw new Error('Unrecognized store type. Must be a Zustand StoreApi or Redux Store.');
  }

  // Cache the state manager
  stateManagerRegistry.set(store, stateManager);

  return stateManager;
}

/**
 * Removes a state manager from the registry
 * Useful when cleaning up to prevent memory leaks in long-running applications
 */
export function removeStateManager(store: StoreApi<any> | Store<any>): void {
  stateManagerRegistry.delete(store);
}

/**
 * Clears all state managers from the registry
 * Mainly useful for testing
 */
export function clearStateManagers(): void {
  // WeakMap doesn't have a clear method, but we can replace it
  // with a new empty WeakMap to achieve the same effect
  stateManagerRegistry = new WeakMap<object, StateManager<any>>();
}
