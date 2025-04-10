import type { StoreApi } from 'zustand';
import type { WebContents } from 'electron';

export type Thunk<S> = (getState: StoreApi<S>['getState'], dispatch: Dispatch<S>) => void;

export type Action<T extends string = string> = {
  type: T;
  payload: unknown;
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

// Shared base bridge interface that works across platforms
export interface BaseBridge<WindowId> {
  // Common cleanup method all implementations have
  unsubscribe: (...args: any[]) => void;

  // Method to get all currently subscribed window identifiers
  getSubscribedWindows: () => WindowId[];
}

export interface WebContentsWrapper {
  webContents: WebContents;
  isDestroyed(): boolean;
}

// The object returned by mainZustandBridge
export interface ZustandBridge extends BaseBridge<number> {
  subscribe: (wrappers: WebContentsWrapper[]) => { unsubscribe: () => void };
}

// The function type for initializing the bridge
export type MainZustandBridge = <S extends AnyState, Store extends StoreApi<S>>(
  store: Store,
  wrappers: WebContentsWrapper[],
  options?: MainZustandBridgeOpts<S>,
) => ZustandBridge;

export type Dispatch<S> = {
  (action: string, payload?: unknown): void;
  (action: Action): void;
  (action: Thunk<S>): void;
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

export type DispatchFunc<S> = (action: Thunk<S> | Action | string, payload?: unknown) => unknown;
