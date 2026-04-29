import { debug } from '@zubridge/core';
import type { Action, AnyState, BridgeState, DispatchFunc, Thunk } from '@zubridge/types';
import { useSyncExternalStore } from 'react';
import { createStore } from 'zustand/vanilla';

import { BridgeClient } from './renderer/bridgeClient.js';
import { getThunkProcessor } from './renderer/rendererThunkProcessor.js';
import type { BackendOptions } from './types/tauri.js';

/// <reference types="./vite-env" />

// Internal vanilla store holding the renderer-side state replica.
// Exported only for testing.
export const internalStore = createStore<BridgeState>(() => ({
  __bridge_status: 'uninitialized' as const,
}));

let bridgeClient: BridgeClient | null = null;
let initializePromise: Promise<void> | null = null;
let isInitializing = false;

/**
 * Initialise the Tauri bridge. Idempotent — repeat calls share the in-flight
 * initialise promise and reuse the live client.
 */
export async function initializeBridge(options?: BackendOptions): Promise<void> {
  if (!options?.invoke || !options?.listen) {
    initializePromise = null;
    isInitializing = false;
    throw new Error("Zubridge Tauri: 'invoke' AND 'listen' functions must be provided in options.");
  }

  if (initializePromise) return initializePromise;
  if (isInitializing) return initializePromise ?? Promise.resolve();
  isInitializing = true;

  internalStore.setState((s: BridgeState) => ({
    ...s,
    __bridge_status: 'initializing' as const,
  }));

  bridgeClient = new BridgeClient(options, {
    onState: (next) => {
      internalStore.setState(
        (prev: BridgeState) => ({
          ...next,
          __bridge_status: prev.__bridge_status,
        }),
        true,
      );
    },
    onStatusChange: (status, error) => {
      internalStore.setState((s: BridgeState) => ({
        ...s,
        __bridge_status: status,
        __bridge_error: error,
      }));
    },
  });

  const client = bridgeClient;
  initializePromise = (async () => {
    try {
      await client.initialize(options);
      internalStore.setState((s: BridgeState) => ({ ...s, __bridge_status: 'ready' as const }));
      debug('tauri', 'Initialization successful');
    } catch (error) {
      debug('tauri:error', 'Initialization failed:', error);
      initializePromise = null;
      internalStore.setState(
        (s: BridgeState) => ({
          ...s,
          __bridge_status: 'error' as const,
          __bridge_error: error,
        }),
        true,
      );
      throw error;
    } finally {
      isInitializing = false;
    }
  })();

  return initializePromise;
}

/**
 * Tear down the Tauri bridge — unsubscribes events and resets the local store.
 */
export async function cleanupZubridge(): Promise<void> {
  if (bridgeClient) {
    await bridgeClient.destroy();
    bridgeClient = null;
  }
  initializePromise = null;
  isInitializing = false;
  internalStore.setState({ __bridge_status: 'uninitialized' } as BridgeState, true);
}

// React hook to access state slices of the local replica.
export function useZubridgeStore<StateSlice>(
  selector: (state: BridgeState) => StateSlice,
  equalityFn?: (a: StateSlice, b: StateSlice) => boolean,
): StateSlice {
  const slice = useSyncExternalStore(
    internalStore.subscribe,
    () => selector(internalStore.getState()),
    () => selector(internalStore.getState()),
  );
  if (equalityFn) {
    // Compatibility: useSyncExternalStore handles equality natively via the snapshot identity.
  }
  return slice;
}

/**
 * Returns a dispatch function that supports actions, action strings, and
 * thunks. Thunks execute locally and have access to a `dispatch` that talks
 * to the backend via Tauri commands.
 */
export function useZubridgeDispatch<S extends AnyState = AnyState>(): DispatchFunc<S> {
  const dispatch = async (
    actionOrThunk: Thunk<S> | Action | string,
    payload?: unknown,
  ): Promise<unknown> => {
    if (!bridgeClient) {
      throw new Error('Zubridge is not initialized. Call initializeBridge first.');
    }

    if (typeof actionOrThunk === 'function') {
      const processor = getThunkProcessor();
      return processor.executeThunk(actionOrThunk as Thunk<S>);
    }

    const action: Action =
      typeof actionOrThunk === 'string' ? { type: actionOrThunk, payload } : actionOrThunk;

    let status = internalStore.getState().__bridge_status;
    if (status !== 'ready') {
      if (initializePromise) {
        try {
          await initializePromise;
          status = internalStore.getState().__bridge_status;
        } catch (initError) {
          throw initError;
        }
      }
      if (status !== 'ready') {
        throw new Error(`Zubridge initialization failed with status: ${status}`);
      }
    }

    await bridgeClient.dispatch(action);
    return Promise.resolve();
  };

  return dispatch as DispatchFunc<S>;
}

/**
 * Subscribe / unsubscribe a webview to a set of state keys. Returned promise
 * resolves with the active subscription set after the change has been applied
 * by the backend.
 */
export async function subscribe(keys: string[]): Promise<string[]> {
  if (!bridgeClient) throw new Error('Zubridge is not initialized.');
  return bridgeClient.subscribe(keys);
}

export async function unsubscribe(keys: string[]): Promise<string[]> {
  if (!bridgeClient) throw new Error('Zubridge is not initialized.');
  return bridgeClient.unsubscribe(keys);
}

export async function getWindowSubscriptions(): Promise<string[]> {
  if (!bridgeClient) throw new Error('Zubridge is not initialized.');
  return bridgeClient.getWindowSubscriptions();
}

/**
 * Directly fetches the current state from the Rust backend, optionally scoped
 * to specific keys.
 */
export async function getState(keys?: string[]): Promise<AnyState> {
  if (!bridgeClient) throw new Error('Zubridge is not initialized.');
  return bridgeClient.getState(keys);
}

export { DirectCommands, TauriCommands, TauriEvents } from './constants.js';
export {
  ActionProcessingError,
  ensureZubridgeError,
  isErrorOfType,
  isZubridgeError,
  SubscriptionError,
  TauriCommandError,
  ThunkExecutionError,
  ZubridgeError,
} from './errors/index.js';
export {
  canDispatchAction,
  getAffectedStateKeys,
  registerActionMapping,
  registerActionMappings,
  validateActionDispatch,
} from './renderer/actionValidator.js';
export {
  clearSubscriptionCache,
  getWindowSubscriptions as getValidatorSubscriptions,
  isSubscribedToKey,
  stateKeyExists,
  validateStateAccess,
  validateStateAccessBatch,
  validateStateAccessWithExistence,
} from './renderer/subscriptionValidator.js';
export { QueueOverflowError } from './types/errors.js';
// Re-export common types and utilities consumers may want.
export type { BackendOptions, BatchingOptions, CommandConfig } from './types/tauri.js';
export type { AnyState };
