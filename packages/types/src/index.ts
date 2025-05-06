import type { StoreApi } from 'zustand';
import type { WebContents } from 'electron';

export type Thunk<S> = (getState: StoreApi<S>['getState'], dispatch: Dispatch<S>) => void;

export type Action<T extends string = string> = {
  type: T;
  payload?: unknown;
  id?: string; // Unique identifier for tracking action acknowledgements
};

export type AnyState = Record<string, unknown>;
export type Reducer<S> = (state: S, args: Action) => S;
export type RootReducer<S extends AnyState> = (state: S, args: Action) => S;
export type Handler = (payload?: any) => void;
export type MainZustandBridgeOpts<S extends AnyState> = {
  handlers?: Record<string, Handler>;
  reducer?: RootReducer<S>;
};
export type BackendZustandBridgeOpts<S extends AnyState> = {
  handlers?: Record<string, Handler>;
  reducer?: RootReducer<S>;
};

/**
 * Represents the possible status of the bridge connection.
 * This is used by both Electron and Tauri to represent connection state.
 */
export type BridgeStatus = 'initializing' | 'ready' | 'error' | 'uninitialized';

/**
 * Extends the user's state with internal bridge status properties.
 * Used for maintaining internal state across platforms.
 */
export type BridgeState<S extends AnyState = AnyState> = S & {
  __bridge_status: BridgeStatus;
  __bridge_error?: unknown;
};

/**
 * Generic options for initializing a backend bridge.
 * Platforms will implement their specific versions.
 */
export interface BackendOptions<T = unknown> {
  invoke: <R = T>(cmd: string, args?: any) => Promise<R>;
  listen: <E = unknown>(event: string, handler: (event: E) => void) => Promise<() => void>;
}

/**
 * Event structure for backend events
 */
export interface BridgeEvent<T = unknown> {
  payload: T;
  // Allow other properties to exist on the event
  [key: string]: any;
}

// Shared base bridge interface that works across platforms
export interface BaseBridge<WindowId> {
  // Common cleanup method all implementations have
  unsubscribe: (...args: any[]) => void;

  // Method to get all currently subscribed window identifiers
  getSubscribedWindows: () => WindowId[];
}

export interface WebContentsWrapper {
  webContents: WebContents;
  // WebContentsView has isDestroyed only on its webContents property
  isDestroyed?: () => boolean;
}

// The object returned by mainZustandBridge
export interface ZustandBridge extends BaseBridge<number> {
  subscribe: (wrappers: [WebContentsWrapper, ...WebContentsWrapper[]]) => { unsubscribe: () => void };
}

export type WrapperOrWebContents = WebContentsWrapper | WebContents;

// The function type for initializing the bridge
export type MainZustandBridge = <S extends AnyState, Store extends StoreApi<S>>(
  store: Store,
  wrappers: WrapperOrWebContents,
  options?: MainZustandBridgeOpts<S>,
) => ZustandBridge;

export type Dispatch<S> = {
  (action: string, payload?: unknown): Promise<any>;
  (action: Action): Promise<any>;
  (action: Thunk<S>): Promise<any>;
};

interface BaseHandler<S> {
  dispatch: Dispatch<S>;
}

export interface Handlers<S extends AnyState> extends BaseHandler<S> {
  getState(): Promise<S>;
  subscribe(callback: (newState: S) => void): () => void;
}

export type ExtractState<S> = S extends {
  getState: () => infer T;
}
  ? T
  : never;

export type ReadonlyStoreApi<T> = Pick<StoreApi<T>, 'getState' | 'getInitialState' | 'subscribe'>;

/**
 * A typed dispatch function that supports actions, action strings, thunks, and optional action type mapping.
 *
 * @template S The state type
 * @template TActions A record mapping action type strings to their payload types
 */
export type DispatchFunc<S, TActions extends Record<string, any> = Record<string, any>> = {
  // Handle thunks
  (action: Thunk<S>): Promise<any>;

  // Handle string action types with optional payload
  (action: string, payload?: unknown): Promise<any>;

  // Handle strongly typed action objects
  <TType extends keyof TActions>(action: { type: TType; payload?: TActions[TType] }): Promise<any>;

  // Handle generic action objects
  (action: Action): Promise<any>;
};

// Shared state manager interface that can be implemented by different backends
export interface StateManager<State> {
  getState: () => State;
  subscribe: (listener: (state: State) => void) => () => void;
  processAction: (action: Action) => void;
}

// Base interface for backend bridges across platforms
export interface BackendBridge<WindowId> extends BaseBridge<WindowId> {
  subscribe: (windows: WrapperOrWebContents[]) => {
    unsubscribe: () => void;
  };
  unsubscribe: (windows?: WrapperOrWebContents[]) => void;
  destroy: () => void;
}
