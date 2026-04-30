import { debug } from '@zubridge/core';
import type { Action, AnyState, BridgeState, DispatchFunc, Thunk } from '@zubridge/types';
import { useRef, useSyncExternalStore } from 'react';
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
let cleanupPromise: Promise<void> | null = null;

/**
 * Initialise the Tauri bridge. Idempotent — repeat calls share the in-flight
 * initialise promise and reuse the live client.
 *
 * If a previous `cleanupZubridge` is still tearing down its listeners, this
 * function waits for that to complete before creating a new client. Without
 * the wait, fire-and-forget callers (`cleanupZubridge(); initializeBridge();`)
 * could race and leave the previous client's state-update listener firing
 * into the new client's store.
 */
export async function initializeBridge(options?: BackendOptions): Promise<void> {
  if (!options?.invoke || !options?.listen) {
    throw new Error("Zubridge Tauri: 'invoke' AND 'listen' functions must be provided in options.");
  }

  if (cleanupPromise) {
    await cleanupPromise;
  }

  if (initializePromise) return initializePromise;

  // Assign initializePromise FIRST so a concurrent caller in the same tick
  // hits the guard above and shares this promise. Everything else — store
  // status update, BridgeClient construction, listener subscription — runs
  // inside the IIFE.
  initializePromise = (async () => {
    internalStore.setState((s: BridgeState) => ({
      ...s,
      __bridge_status: 'initializing' as const,
    }));

    const client = new BridgeClient(options, {
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
    bridgeClient = client;

    try {
      await client.initialize(options);
      internalStore.setState((s: BridgeState) => ({ ...s, __bridge_status: 'ready' as const }));
      debug('tauri', 'Initialization successful');
    } catch (error) {
      debug('tauri:error', 'Initialization failed:', error);
      // On failure clear the global state so a subsequent initializeBridge
      // call starts fresh.
      try {
        await client.destroy();
      } catch {
        /* swallow */
      }
      bridgeClient = null;
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
    }
  })();

  return initializePromise;
}

/**
 * Tear down the Tauri bridge — unsubscribes events and resets the local store.
 *
 * Module-level state (`bridgeClient`, `initializePromise`, store status) is
 * reset synchronously so a fire-and-forget caller followed by a new
 * `initializeBridge` call sees a clean slate. The actual listener teardown
 * runs asynchronously inside `cleanupPromise`; `initializeBridge` awaits that
 * promise before constructing a new client, so the two clients can never share
 * an active state-update listener.
 *
 * Concurrent calls share the same in-flight cleanup.
 */
export async function cleanupZubridge(): Promise<void> {
  if (cleanupPromise) return cleanupPromise;

  const client = bridgeClient;
  bridgeClient = null;
  initializePromise = null;
  internalStore.setState({ __bridge_status: 'uninitialized' } as BridgeState, true);

  // Start the async work, expose it as cleanupPromise for concurrent callers,
  // then await it and clear cleanupPromise in the outer finally. Putting the
  // clear inside the IIFE itself was unsafe: when the IIFE body finished
  // synchronously (no client to destroy), its finally would set
  // `cleanupPromise = null`, but the *outer* `cleanupPromise = (IIFE)()`
  // assignment evaluates after the IIFE returns and would immediately
  // overwrite it back to the IIFE's resolved Promise.
  const work = (async () => {
    if (client) {
      await client.destroy();
    }
  })();
  cleanupPromise = work;
  try {
    await work;
  } finally {
    cleanupPromise = null;
  }
}

// React hook to access state slices of the local replica.
//
// `equalityFn`, when supplied, is honoured by memoising the snapshot: if the
// freshly-selected slice compares equal to the previous one, the hook returns
// the previous reference so React skips the re-render. Without it, the hook
// falls back to reference equality, which is what `useSyncExternalStore`
// natively does.
export function useZubridgeStore<StateSlice>(
  selector: (state: BridgeState) => StateSlice,
  equalityFn?: (a: StateSlice, b: StateSlice) => boolean,
): StateSlice {
  const lastSliceRef = useRef<{ value: StateSlice } | null>(null);

  const getSnapshot = (): StateSlice => {
    const next = selector(internalStore.getState());
    const prev = lastSliceRef.current;
    if (prev && equalityFn && equalityFn(prev.value, next)) {
      return prev.value;
    }
    lastSliceRef.current = { value: next };
    return next;
  };

  return useSyncExternalStore(internalStore.subscribe, getSnapshot, getSnapshot);
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

    // Wait for the bridge to be 'ready' before either path. The thunk
    // processor's actionSender/thunkRegistrar/thunkCompleter are wired up
    // inside BridgeClient.initialize() — which runs *after* `bridgeClient` is
    // assigned in the init IIFE — so a thunk dispatched in that window would
    // execute against an uninitialised processor and silently drop every
    // backend interaction.
    await ensureReady();

    if (typeof actionOrThunk === 'function') {
      const processor = getThunkProcessor();
      return processor.executeThunk(actionOrThunk as Thunk<S>);
    }

    const action: Action =
      typeof actionOrThunk === 'string' ? { type: actionOrThunk, payload } : actionOrThunk;

    await bridgeClient.dispatch(action);
    return Promise.resolve();
  };

  return dispatch as DispatchFunc<S>;
}

async function ensureReady(): Promise<void> {
  let status = internalStore.getState().__bridge_status;
  if (status === 'ready') return;
  if (initializePromise) {
    await initializePromise;
    status = internalStore.getState().__bridge_status;
  }
  if (status !== 'ready') {
    throw new Error(`Zubridge initialization failed with status: ${status}`);
  }
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
