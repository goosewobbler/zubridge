import type { BackendOptions as BaseBackendOptions, BridgeEvent } from '@zubridge/types';
import type { JsonValue } from './json.js';

/**
 * Configurable Tauri command names. Provided to override the plugin defaults,
 * or to opt into the direct (non-plugin) format. When a name is omitted from
 * `CommandConfig`, the bridge tries the plugin format first, then falls back
 * to the direct format.
 */
export interface CommandConfig {
  getInitialState?: string;
  getState?: string;
  dispatchAction?: string;
  batchDispatch?: string;
  registerThunk?: string;
  completeThunk?: string;
  stateUpdateAck?: string;
  subscribe?: string;
  unsubscribe?: string;
  getWindowSubscriptions?: string;
  stateUpdateEvent?: string;
}

/** Active resolved commands once the bridge has chosen a transport flavour. */
export interface ResolvedCommands {
  getInitialState: string;
  getState: string;
  dispatchAction: string;
  batchDispatch: string;
  registerThunk: string;
  completeThunk: string;
  stateUpdateAck: string;
  subscribe: string;
  unsubscribe: string;
  getWindowSubscriptions: string;
  stateUpdateEvent: string;
}

/**
 * Options accepted by the Tauri bridge when initialising. Supplies the Tauri
 * `invoke` and `listen` primitives plus optional command-name overrides.
 */
export interface BackendOptions<T = unknown> extends BaseBackendOptions<T> {
  invoke: <R = T>(cmd: string, args?: unknown, options?: unknown) => Promise<R>;
  listen: <E = unknown>(event: string, handler: (event: E) => void) => Promise<() => void>;
  /** Webview label this renderer runs inside. Defaults to the current webview's label when available. */
  windowLabel?: string;
  commands?: CommandConfig;
  /** Request batching configuration. Pass `false` to disable batching entirely. */
  batching?: BatchingOptions | false;
}

export interface BatchingOptions {
  /** Max actions per batch before forcing a flush. Default 50. */
  maxBatchSize?: number;
  /** Flush window in milliseconds. Default 16ms (one animation frame). */
  windowMs?: number;
}

/**
 * Wire shape of a state update event emitted by the Rust plugin.
 */
export interface StateUpdatePayload {
  seq: number;
  update_id: string;
  delta?: {
    changed: Record<string, JsonValue>;
    removed: string[];
  };
  full_state?: JsonValue;
  source?: {
    action_id?: string;
    thunk_id?: string;
  };
}

export type StateUpdateEvent = BridgeEvent<StateUpdatePayload>;
