import { useSyncExternalStore } from 'react';
import { createStore } from 'zustand/vanilla';

import type { UnlistenFn } from '@tauri-apps/api/event';
import type {
  AnyState,
  Action,
  Thunk,
  DispatchFunc,
  BridgeState,
  BridgeEvent,
  BackendOptions as BaseBackendOptions,
} from '@zubridge/types';

// Add type declaration reference if vite-env.d.ts is used
/// <reference types="./vite-env" />

/**
 * Command format options for Tauri integration
 */
export interface CommandConfig {
  /** Command name for getting initial state */
  getInitialState?: string;
  /** Command name for dispatching actions */
  dispatchAction?: string;
  /** Event name for state updates */
  stateUpdateEvent?: string;
}

/**
 * Options for initializing the Tauri bridge
 */
export interface BackendOptions<T = unknown> extends BaseBackendOptions<T> {
  invoke: <R = T>(cmd: string, args?: any, options?: any) => Promise<R>;
  listen: <E = unknown>(event: string, handler: (event: E) => void) => Promise<UnlistenFn>;
  /** Command configuration - if not provided, will try both plugin and direct formats */
  commands?: CommandConfig;
}

// --- Internal Store and Synchronization Logic ---

// Default command names
const DEFAULT_COMMANDS = {
  // Plugin format (Tauri v2)
  PLUGIN_GET_INITIAL_STATE: 'plugin:zubridge|get_initial_state',
  PLUGIN_DISPATCH_ACTION: 'plugin:zubridge|dispatch_action',
  // Direct format (Tauri v1 or custom implementation)
  DIRECT_GET_INITIAL_STATE: 'get_initial_state',
  DIRECT_DISPATCH_ACTION: 'dispatch_action',
  // Default event name
  STATE_UPDATE_EVENT: 'zubridge://state-update',
};

// Internal vanilla store holding the state replica
// Exported only for testing
export const internalStore = createStore<BridgeState>(() => ({
  // Start as uninitialized, let initializeBridge set initializing
  __bridge_status: 'uninitialized' as const,
}));

let initializePromise: Promise<void> | null = null;
let unlistenStateUpdate: UnlistenFn | null = null;
let isInitializing = false; // <-- Guard flag

// Module-level variables to hold the provided functions
let providedInvoke: BackendOptions['invoke'] | null = null;
let providedListen: BackendOptions['listen'] | null = null;

// Active command names - will be set during initialization
let activeCommands = {
  getInitialState: '',
  dispatchAction: '',
  stateUpdateEvent: DEFAULT_COMMANDS.STATE_UPDATE_EVENT,
};

/**
 * Helper function to invoke commands with fallback support
 * Tries both plugin format and direct format if command name isn't specified
 */
async function invokeWithFallback<R>(
  invoke: BackendOptions['invoke'],
  commandConfig: CommandConfig | undefined,
  args?: any,
): Promise<R> {
  // If specific command names are provided, use them directly
  if (commandConfig?.getInitialState) {
    activeCommands.getInitialState = commandConfig.getInitialState;
    return invoke<R>(commandConfig.getInitialState, args);
  }

  // Try plugin format first, then direct format
  try {
    const result = await invoke<R>(DEFAULT_COMMANDS.PLUGIN_GET_INITIAL_STATE, args);
    activeCommands.getInitialState = DEFAULT_COMMANDS.PLUGIN_GET_INITIAL_STATE;
    activeCommands.dispatchAction = DEFAULT_COMMANDS.PLUGIN_DISPATCH_ACTION;
    return result;
  } catch (pluginError) {
    console.log('Zubridge Tauri: Plugin format failed, trying direct format...');
    try {
      const result = await invoke<R>(DEFAULT_COMMANDS.DIRECT_GET_INITIAL_STATE, args);
      activeCommands.getInitialState = DEFAULT_COMMANDS.DIRECT_GET_INITIAL_STATE;
      activeCommands.dispatchAction = DEFAULT_COMMANDS.DIRECT_DISPATCH_ACTION;
      return result;
    } catch (directError) {
      console.error('Zubridge Tauri: Both command formats failed:', { pluginError, directError });
      throw new Error(
        `Zubridge Tauri: Failed to connect to backend. Tried both plugin and direct formats. ` +
          `Consider providing explicit command names in the options.`,
      );
    }
  }
}

/**
 * Initializes the connection to the Tauri backend.
 * Fetches the initial state and sets up a listener for state updates.
 * This function is idempotent and safe to call multiple times.
 */
export async function initializeBridge(options?: BackendOptions): Promise<void> {
  // Validate options - Ensure both invoke and listen are required again
  if (!options?.invoke || !options?.listen) {
    initializePromise = null;
    isInitializing = false;
    throw new Error("Zubridge Tauri: 'invoke' AND 'listen' functions must be provided in options.");
  }

  // Store functions if not initializing
  if (!isInitializing) {
    if (!providedInvoke) providedInvoke = options.invoke;
    if (!providedListen) providedListen = options.listen;
  }

  if (initializePromise || isInitializing) {
    return initializePromise ?? Promise.resolve();
  }

  // Ensure we have functions before proceeding
  if (!providedInvoke || !providedListen) {
    isInitializing = false;
    throw new Error("Zubridge Tauri: Stored 'invoke' or 'listen' function is missing unexpectedly.");
  }

  isInitializing = true;
  const currentInvoke = providedInvoke;
  const currentListen = providedListen;

  // Set up event name from options if provided
  if (options?.commands?.stateUpdateEvent) {
    activeCommands.stateUpdateEvent = options.commands.stateUpdateEvent;
  }

  // Set up dispatch command from options if provided
  if (options?.commands?.dispatchAction) {
    activeCommands.dispatchAction = options.commands.dispatchAction;
  }

  const promise = (async () => {
    internalStore.setState((s: BridgeState) => ({ ...s, __bridge_status: 'initializing' as const }));
    try {
      // Try to get initial state with fallback support
      const initialState = await invokeWithFallback<AnyState>(currentInvoke, options?.commands);

      internalStore.setState(
        (_prevState: BridgeState) => {
          return {
            ...(initialState as AnyState),
            __bridge_status: 'initializing' as const,
          };
        },
        true, // Replace state
      );

      console.log(`Zubridge Tauri: Setting up state update listener on ${activeCommands.stateUpdateEvent}...`);
      unlistenStateUpdate = await currentListen(activeCommands.stateUpdateEvent, (event: BridgeEvent<AnyState>) => {
        console.log('Zubridge Tauri: Received state update event.', event.payload);
        internalStore.setState(
          (prevState: BridgeState) => {
            return {
              ...event.payload,
              __bridge_status: prevState.__bridge_status,
            };
          },
          true, // Replace state
        );
      });
      console.log('Zubridge Tauri: State update listener active.');

      // Set status to ready NOW THAT LISTENER IS ACTIVE
      internalStore.setState((s: BridgeState) => ({ ...s, __bridge_status: 'ready' as const }));
      console.log(`Zubridge Tauri: Initialization successful. Using commands: ${JSON.stringify(activeCommands)}`);
    } catch (error) {
      console.error('Zubridge Tauri: Initialization failed!', error);
      // Clean up listener if partially set up
      if (unlistenStateUpdate) {
        unlistenStateUpdate();
        unlistenStateUpdate = null;
      }
      initializePromise = null;
      internalStore.setState(
        (s: BridgeState) => ({
          ...s,
          __bridge_status: 'error' as const,
          __bridge_error: error,
        }),
        true, // Replace state
      );
      throw error;
    } finally {
      isInitializing = false;
    }
  })();

  initializePromise = promise;
  return initializePromise;
}

/**
 * Cleans up the Tauri event listener and resets the internal state.
 * Useful for testing or specific teardown scenarios.
 */
export function cleanupZubridge(): void {
  if (unlistenStateUpdate) {
    unlistenStateUpdate();
    unlistenStateUpdate = null;
  }
  initializePromise = null;
  isInitializing = false;
  // Reset to a clean initial state
  internalStore.setState({ __bridge_status: 'uninitialized' } as BridgeState, true);
  providedInvoke = null;
  providedListen = null;
  // Reset command names to default
  activeCommands = {
    getInitialState: '',
    dispatchAction: '',
    stateUpdateEvent: DEFAULT_COMMANDS.STATE_UPDATE_EVENT,
  };
}

// --- React Hooks ---

/**
 * React hook to access the Zubridge state, synchronized with the Tauri backend.
 * Ensures the bridge is initialized before returning state.
 *
 * @template StateSlice The type of the state slice selected.
 * @param selector Function to select a slice of the state. The full state includes internal `__bridge_` properties.
 * @param equalityFn Optional function to compare selected state slices for memoization.
 * @returns The selected state slice.
 */
export function useZubridgeStore<StateSlice>(
  selector: (state: BridgeState) => StateSlice,
  equalityFn?: (a: StateSlice, b: StateSlice) => boolean,
): StateSlice {
  // Use useSyncExternalStore for safe subscription to the vanilla store
  const slice = useSyncExternalStore(
    internalStore.subscribe,
    () => selector(internalStore.getState()),
    () => selector(internalStore.getState()), // SSR/initial snapshot
  );

  // Note: React's default shallow equality check works well with useSyncExternalStore
  // If a custom equalityFn is provided, React uses it. No extra implementation needed here.
  if (equalityFn) {
    // Just acknowledging it's used by useSyncExternalStore
  }

  return slice;
}

/**
 * React hook to get the dispatch function for sending actions to the Tauri backend.
 *
 * @returns Dispatch function that supports actions, action strings, and thunks
 */
export function useZubridgeDispatch<S extends AnyState = AnyState>(): DispatchFunc<S> {
  const dispatch = async (actionOrThunk: Thunk<S> | Action | string, payload?: unknown): Promise<void> => {
    // For thunks (function actions), execute them locally in the renderer process
    if (typeof actionOrThunk === 'function') {
      try {
        // Execute the thunk with getState and dispatch functions
        return (actionOrThunk as Thunk<S>)(() => internalStore.getState() as S, dispatch);
      } catch (error) {
        console.error('Zubridge Tauri: Error executing thunk:', error);
        throw error;
      }
    }

    // Handle string action type with payload
    const action: Action = typeof actionOrThunk === 'string' ? { type: actionOrThunk, payload } : actionOrThunk;

    // Ensure invoke was provided during initialization
    if (!providedInvoke) {
      console.error('Zubridge Tauri: Dispatch failed. Bridge not initialized with invoke function.');
      throw new Error('Zubridge is not initialized (missing invoke function).');
    }
    const currentInvoke = providedInvoke; // Capture for async use

    let status = internalStore.getState().__bridge_status;

    // If not ready, wait for initialization to complete (if it's in progress)
    if (status !== 'ready') {
      if (initializePromise) {
        console.log(`Zubridge Tauri: Dispatch waiting for initialization (${status})...`);
        try {
          await initializePromise;
          status = internalStore.getState().__bridge_status; // Re-check status after waiting
          if (status !== 'ready') {
            // Initialization finished but resulted in an error or unexpected state
            const error = internalStore.getState().__bridge_error;
            console.error(
              `Zubridge Tauri: Initialization finished with status '${status}'. Cannot dispatch. Error:`,
              error,
            );
            throw new Error(`Zubridge initialization failed with status: ${status}`);
          }
          console.log(`Zubridge Tauri: Initialization complete, proceeding with dispatch.`);
        } catch (initError) {
          console.error(
            `Zubridge Tauri: Initialization failed while waiting in dispatch. Cannot dispatch. Error:`,
            initError,
          );
          throw initError; // Re-throw the initialization error
        }
      } else {
        // Not ready and no initialization promise exists (shouldn't happen if initializeBridge was called)
        console.error(
          `Zubridge Tauri: Dispatch called while status is '${status}' and initialization promise is missing. Cannot dispatch. Action:`,
          action,
        );
        throw new Error(`Zubridge is not initialized and initialization is not in progress.`);
      }
    }

    // Ensure we have an active dispatch command
    if (!activeCommands.dispatchAction) {
      console.error('Zubridge Tauri: No active dispatch command found. Cannot dispatch action.');
      throw new Error('Zubridge dispatch command not determined. Try reinitializing the bridge.');
    }

    // Original dispatch logic
    try {
      // Convert to payload format expected by backend
      const actionPayload = {
        action: {
          action_type: action.type,
          payload: action.payload,
        },
      };

      // Use the active dispatch command
      await currentInvoke(activeCommands.dispatchAction, actionPayload);
      return Promise.resolve();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[useZubridgeDispatch] Error invoking dispatch action for ${action.type}:`, errorMessage, error);
      // Rethrow or handle error as needed by the application
      throw error;
    }
  };

  return dispatch as DispatchFunc<S>;
}

// --- Direct State Interaction Functions ---

/**
 * Directly fetches the entire current state from the Rust backend.
 * Use sparingly, prefer `useZubridgeStore` for reactive updates in components.
 * @returns A promise that resolves with the full application state.
 */
export async function getState(): Promise<AnyState> {
  if (!providedInvoke) throw new Error('Zubridge not initialized.');
  if (!activeCommands.getInitialState) {
    throw new Error('Zubridge getInitialState command not determined. Try initializing the bridge first.');
  }

  try {
    const response = await providedInvoke(activeCommands.getInitialState);
    return (response as { value: AnyState }).value;
  } catch (error) {
    console.error('Zubridge Tauri: Failed to get state directly:', error);
    throw error;
  }
}

/**
 * Directly updates the entire state in the Rust backend.
 * Use with caution, as this bypasses the action dispatch flow and might
 * overwrite state unexpectedly if not coordinated properly.
 * @param state The complete state object to set in the backend.
 * @returns A promise that resolves when the update command completes.
 */
export async function updateState(state: AnyState): Promise<void> {
  if (!providedInvoke) throw new Error('Zubridge not initialized.');
  try {
    await providedInvoke('update_state', { state: { value: state } });
  } catch (error) {
    console.error('Zubridge Tauri: Failed to update state directly:', error);
    throw error;
  }
}

// Optional: Re-export base types if needed by consumers
export type { AnyState };

// Initialize automatically when the module loads?
// Generally better to let the first hook usage trigger it.
// initializeBridge();
