import { debug } from '@zubridge/core';
import type { Action, AnyState, BridgeState, FlushResult } from '@zubridge/types';

import { ActionBatcher } from '../batching/ActionBatcher.js';
import {
  BATCHING_DEFAULTS,
  type BatchAckPayload,
  type BatchingConfig,
  type BatchPayload,
  PRIORITY_LEVELS,
} from '../batching/types.js';
import { DirectCommands, TauriCommands, TauriEvents } from '../constants.js';
import { DeltaMerger } from '../deltas/DeltaMerger.js';
import type { Delta } from '../deltas/types.js';
import { TauriCommandError } from '../errors/index.js';
import type {
  BackendOptions,
  BatchingOptions,
  CommandConfig,
  ResolvedCommands,
  StateUpdatePayload,
} from '../types/tauri.js';
import { setActionValidatorStateProvider } from './actionValidator.js';
import { InvokeListeners } from './invokeListeners.js';
import {
  getThunkProcessor,
  type RendererThunkProcessor,
  resetThunkProcessor,
} from './rendererThunkProcessor.js';
import { setSubscriptionFetcher } from './subscriptionValidator.js';

type Invoke = BackendOptions['invoke'];

function resolveCommands(initial: 'plugin' | 'direct', config?: CommandConfig): ResolvedCommands {
  const fromTable = (key: keyof ResolvedCommands, plugin: string, direct: string): string => {
    const override = (config as Record<string, string | undefined> | undefined)?.[key];
    if (override) return override;
    return initial === 'plugin' ? plugin : direct;
  };
  return {
    getInitialState: fromTable(
      'getInitialState',
      TauriCommands.GET_INITIAL_STATE,
      DirectCommands.GET_INITIAL_STATE,
    ),
    getState: fromTable('getState', TauriCommands.GET_STATE, DirectCommands.GET_STATE),
    dispatchAction: fromTable(
      'dispatchAction',
      TauriCommands.DISPATCH_ACTION,
      DirectCommands.DISPATCH_ACTION,
    ),
    batchDispatch: fromTable(
      'batchDispatch',
      TauriCommands.BATCH_DISPATCH,
      DirectCommands.BATCH_DISPATCH,
    ),
    registerThunk: fromTable(
      'registerThunk',
      TauriCommands.REGISTER_THUNK,
      DirectCommands.REGISTER_THUNK,
    ),
    completeThunk: fromTable(
      'completeThunk',
      TauriCommands.COMPLETE_THUNK,
      DirectCommands.COMPLETE_THUNK,
    ),
    stateUpdateAck: fromTable(
      'stateUpdateAck',
      TauriCommands.STATE_UPDATE_ACK,
      DirectCommands.STATE_UPDATE_ACK,
    ),
    subscribe: fromTable('subscribe', TauriCommands.SUBSCRIBE, DirectCommands.SUBSCRIBE),
    unsubscribe: fromTable('unsubscribe', TauriCommands.UNSUBSCRIBE, DirectCommands.UNSUBSCRIBE),
    getWindowSubscriptions: fromTable(
      'getWindowSubscriptions',
      TauriCommands.GET_WINDOW_SUBSCRIPTIONS,
      DirectCommands.GET_WINDOW_SUBSCRIPTIONS,
    ),
    stateUpdateEvent: config?.stateUpdateEvent ?? TauriEvents.STATE_UPDATE,
  };
}

async function probeCommandFlavour(
  invoke: Invoke,
  config: CommandConfig | undefined,
): Promise<{ flavour: 'plugin' | 'direct'; initialState: AnyState }> {
  if (config?.getInitialState) {
    const initial = await invoke<AnyState>(config.getInitialState);
    return { flavour: 'plugin', initialState: initial };
  }

  try {
    const initial = await invoke<AnyState>(TauriCommands.GET_INITIAL_STATE);
    return { flavour: 'plugin', initialState: initial };
  } catch (pluginErr) {
    debug('tauri', 'Plugin probe failed, falling back to direct format:', pluginErr);
  }

  const initial = await invoke<AnyState>(DirectCommands.GET_INITIAL_STATE);
  return { flavour: 'direct', initialState: initial };
}

export interface BridgeClientCallbacks {
  onState: (next: AnyState, source?: StateUpdatePayload['source']) => void;
  onStatusChange: (status: BridgeState['__bridge_status'], error?: unknown) => void;
}

/**
 * Renderer-side bridge to `tauri-plugin-zubridge`. Owns the `invoke`/`listen`
 * primitives, applies incoming state-update events (with delta + sequence
 * resync), and exposes dispatch + thunk + subscription helpers.
 */
export class BridgeClient {
  private readonly invoke: Invoke;
  private readonly callbacks: BridgeClientCallbacks;
  private readonly listeners: InvokeListeners;
  private readonly windowLabel: string;
  private commands: ResolvedCommands | null = null;
  private deltaMerger = new DeltaMerger<AnyState>();
  private lastSeq = 0;
  private batcher: ActionBatcher | null = null;
  private thunkProcessor: RendererThunkProcessor | null = null;
  private currentState: AnyState = {};
  private destroyed = false;
  private resyncInFlight: Promise<void> | null = null;

  constructor(options: BackendOptions, callbacks: BridgeClientCallbacks) {
    this.invoke = options.invoke;
    this.callbacks = callbacks;
    this.listeners = new InvokeListeners(options.listen);
    this.windowLabel = options.windowLabel ?? readWindowLabel();
  }

  async initialize(options: BackendOptions): Promise<AnyState> {
    const { flavour, initialState } = await probeCommandFlavour(this.invoke, options.commands);
    this.commands = resolveCommands(flavour, options.commands);

    this.currentState = initialState ?? {};
    this.callbacks.onState(this.currentState);

    await this.listeners.on<StateUpdatePayload | { payload: StateUpdatePayload }>(
      this.commands.stateUpdateEvent,
      (raw) => this.handleStateUpdate(raw),
    );

    setSubscriptionFetcher(() => this.getWindowSubscriptions());
    setActionValidatorStateProvider(async () => this.currentState as Record<string, unknown>);

    const batchingOpts = parseBatching(options.batching);
    if (batchingOpts) {
      this.batcher = new ActionBatcher(batchingOpts, (payload) => this.sendBatch(payload));
    }

    this.thunkProcessor = getThunkProcessor();
    this.thunkProcessor.initialize({
      windowLabel: this.windowLabel,
      actionSender: (action, parentId, opts) => this.sendAction(action, parentId, opts),
      batchFlusher: () => this.flushBatch(),
      thunkRegistrar: (thunkId, parentId, immediate, bypassAccessControl) =>
        this.registerThunk(thunkId, parentId, immediate, bypassAccessControl),
      thunkCompleter: (thunkId, error) => this.completeThunk(thunkId, error),
    });
    this.thunkProcessor.setStateProvider(async (opts) => {
      if (opts?.bypassAccessControl) return this.currentState;
      // Future: filter to subscribed keys. For now the renderer-side replica
      // is already scoped by the backend's per-webview filter, so returning
      // it directly is correct.
      return this.currentState;
    });

    return this.currentState;
  }

  // ---- Command helpers ----

  private requireCommands(): ResolvedCommands {
    if (!this.commands) {
      throw new TauriCommandError('Bridge not initialized', { sourceLabel: this.windowLabel });
    }
    return this.commands;
  }

  async getState(keys?: string[]): Promise<AnyState> {
    const cmds = this.requireCommands();
    try {
      const result = await this.invoke<{ value: AnyState }>(cmds.getState, { args: { keys } });
      return result.value;
    } catch (error) {
      throw new TauriCommandError('get_state failed', {
        command: cmds.getState,
        sourceLabel: this.windowLabel,
        cause: error,
      });
    }
  }

  /**
   * Used by the renderer thunk processor to register a thunk before it runs.
   * The webview label is derived authoritatively on the Rust side from the
   * Tauri runtime; the renderer must not pass it.
   */
  async registerThunk(
    thunkId: string,
    parentId?: string,
    immediate?: boolean,
    bypassAccessControl?: boolean,
  ): Promise<void> {
    const cmds = this.requireCommands();
    try {
      await this.invoke(cmds.registerThunk, {
        args: {
          thunk_id: thunkId,
          parent_id: parentId,
          immediate,
          bypass_access_control: bypassAccessControl,
        },
      });
    } catch (error) {
      throw new TauriCommandError('register_thunk failed', {
        command: cmds.registerThunk,
        sourceLabel: this.windowLabel,
        thunkId,
        cause: error,
      });
    }
  }

  async completeThunk(thunkId: string, error?: string): Promise<void> {
    const cmds = this.requireCommands();
    try {
      await this.invoke(cmds.completeThunk, {
        args: {
          thunk_id: thunkId,
          error,
        },
      });
    } catch (err) {
      debug('tauri:error', `complete_thunk failed for ${thunkId}:`, err);
    }
  }

  async subscribe(keys: string[]): Promise<string[]> {
    const cmds = this.requireCommands();
    try {
      const result = await this.invoke<{ keys: string[] }>(cmds.subscribe, {
        args: { keys },
      });
      return result.keys;
    } catch (error) {
      throw new TauriCommandError('subscribe failed', {
        command: cmds.subscribe,
        sourceLabel: this.windowLabel,
        cause: error,
      });
    }
  }

  async unsubscribe(keys: string[]): Promise<string[]> {
    const cmds = this.requireCommands();
    try {
      const result = await this.invoke<{ keys: string[] }>(cmds.unsubscribe, {
        args: { keys },
      });
      return result.keys;
    } catch (error) {
      throw new TauriCommandError('unsubscribe failed', {
        command: cmds.unsubscribe,
        sourceLabel: this.windowLabel,
        cause: error,
      });
    }
  }

  async getWindowSubscriptions(): Promise<string[]> {
    const cmds = this.requireCommands();
    try {
      const result = await this.invoke<{ keys: string[] }>(cmds.getWindowSubscriptions);
      return result.keys;
    } catch (error) {
      debug('tauri:error', 'get_window_subscriptions failed:', error);
      return [];
    }
  }

  /** Renderer-side dispatch entry point. */
  async dispatch(action: Action, parentId?: string, opts?: { batch?: boolean }): Promise<void> {
    return this.sendAction(action, parentId, opts);
  }

  private async sendAction(
    action: Action,
    parentId?: string,
    opts?: { batch?: boolean },
  ): Promise<void> {
    const cmds = this.requireCommands();
    const batcher = this.batcher;
    if (batcher && opts?.batch) {
      await new Promise<void>((resolve, reject) => {
        const enriched = { ...action, __thunkParentId: parentId ?? action.__thunkParentId };
        const priority = pickPriority(enriched);
        batcher.enqueue(enriched, () => resolve(), reject, priority, parentId);
      });
      return;
    }
    const wire = this.toWireAction(action, parentId);
    try {
      await this.invoke(cmds.dispatchAction, { args: { action: wire } });
    } catch (error) {
      throw new TauriCommandError(`dispatch_action failed: ${describe(error)}`, {
        command: cmds.dispatchAction,
        sourceLabel: this.windowLabel,
        actionType: action.type,
        cause: error,
      });
    }
  }

  private async sendBatch(payload: BatchPayload): Promise<BatchAckPayload> {
    const cmds = this.requireCommands();
    const wireActions = payload.actions.map((entry) =>
      this.toWireAction(entry.action, entry.parentId),
    );
    try {
      const response = await this.invoke<{
        batch_id: string;
        acked_action_ids: string[];
      }>(cmds.batchDispatch, {
        args: {
          batch_id: payload.batchId,
          actions: wireActions,
        },
      });
      return {
        batchId: response.batch_id,
        results: response.acked_action_ids.map((actionId) => ({
          actionId,
          success: true,
        })),
      };
    } catch (error) {
      const message = describe(error);
      return {
        batchId: payload.batchId,
        results: payload.actions.map((entry) => ({
          actionId: entry.id,
          success: false,
          error: message,
        })),
        error: message,
      };
    }
  }

  private async flushBatch(): Promise<FlushResult> {
    if (!this.batcher) return { batchId: '', actionsSent: 0, actionIds: [] };
    return this.batcher.flushWithResult(true);
  }

  private toWireAction(action: Action, parentId?: string) {
    // source_label is set authoritatively on the Rust side from the runtime;
    // the renderer must not pass it (would be ignored anyway).
    return {
      id: action.__id,
      action_type: action.type,
      payload: action.payload,
      thunk_parent_id: parentId ?? action.__thunkParentId,
      immediate: action.__immediate,
      keys: action.__keys,
      bypass_access_control: action.__bypassAccessControl,
      starts_thunk: action.__startsThunk,
      ends_thunk: action.__endsThunk,
    };
  }

  // ---- State update handling ----

  private handleStateUpdate(raw: StateUpdatePayload | { payload: StateUpdatePayload }): void {
    const payload: StateUpdatePayload =
      'payload' in raw && (raw as { payload: StateUpdatePayload }).payload
        ? (raw as { payload: StateUpdatePayload }).payload
        : (raw as StateUpdatePayload);
    if (!payload || typeof payload !== 'object') return;

    // Drop in-flight events while a resync is pending. Applying them on top of
    // a state that's about to be replaced wholesale risks transient inconsistent
    // snapshots leaking to consumers.
    if (this.resyncInFlight) {
      debug('tauri', 'Dropping state update while resync is in flight', payload);
      return;
    }

    if (typeof payload.seq === 'number') {
      // Detect sequence gaps and trigger resync. Allow seq to start at 1 for
      // a fresh subscription or after an intentional resync (lastSeq === 0).
      if (this.lastSeq !== 0 && payload.seq !== this.lastSeq + 1) {
        debug(
          'tauri',
          `State-update sequence gap detected (got ${payload.seq}, expected ${this.lastSeq + 1}), resyncing.`,
        );
        void this.resync();
        return;
      }
      this.lastSeq = payload.seq;
    }

    let next: AnyState | null = null;
    if (payload.full_state) {
      next = payload.full_state as AnyState;
    } else if (payload.delta) {
      const delta: Delta<AnyState> = {
        type: 'delta',
        changed: payload.delta.changed as Record<string, unknown>,
        removed: payload.delta.removed,
      };
      next = this.deltaMerger.merge(this.currentState, delta) as AnyState;
    }

    if (next) {
      this.currentState = next;
      this.callbacks.onState(next, payload.source);
    }

    if (payload.update_id) {
      void this.acknowledgeUpdate(payload.update_id);
    }
  }

  private async acknowledgeUpdate(updateId: string): Promise<void> {
    if (!this.commands) return;
    try {
      await this.invoke(this.commands.stateUpdateAck, {
        args: { update_id: updateId },
      });
    } catch (err) {
      debug('tauri:error', `state_update_ack failed for ${updateId}:`, err);
    }
  }

  private async resync(): Promise<void> {
    // De-dupe concurrent resyncs (multiple gaps can fire before the first
    // get_initial_state resolves).
    if (this.resyncInFlight) return this.resyncInFlight;
    const cmds = this.requireCommands();
    this.resyncInFlight = (async () => {
      try {
        const fresh = await this.invoke<AnyState>(cmds.getInitialState);
        this.currentState = fresh;
        this.lastSeq = 0;
        this.callbacks.onState(fresh);
      } catch (err) {
        debug('tauri:error', 'Resync failed:', err);
      } finally {
        this.resyncInFlight = null;
      }
    })();
    return this.resyncInFlight;
  }

  // ---- Lifecycle ----

  async destroy(): Promise<void> {
    if (this.destroyed) return;
    this.destroyed = true;
    await this.listeners.destroy();
    this.batcher?.destroy();
    this.batcher = null;
    setSubscriptionFetcher(null);
    setActionValidatorStateProvider(null);
    resetThunkProcessor();
    this.commands = null;
    this.lastSeq = 0;
    this.currentState = {};
  }
}

function readWindowLabel(): string {
  // Tauri exposes the current webview label via __TAURI_INTERNALS__.metadata.currentWindow.
  // When unavailable (test/SSR/non-Tauri context) we fall back to "main".
  type TauriInternals = {
    metadata?: { currentWindow?: { label?: string } };
  };
  const internals = (globalThis as unknown as { __TAURI_INTERNALS__?: TauriInternals })
    .__TAURI_INTERNALS__;
  return internals?.metadata?.currentWindow?.label ?? 'main';
}

function parseBatching(input: BackendOptions['batching']): Required<BatchingConfig> | null {
  if (input === false) return null;
  const opts = (input ?? {}) as BatchingOptions;
  return {
    ...BATCHING_DEFAULTS,
    maxBatchSize: opts.maxBatchSize ?? BATCHING_DEFAULTS.maxBatchSize,
    windowMs: opts.windowMs ?? BATCHING_DEFAULTS.windowMs,
  };
}

function pickPriority(action: Action): number {
  if (action.__immediate) return PRIORITY_LEVELS.IMMEDIATE;
  if (action.__thunkParentId) return PRIORITY_LEVELS.NORMAL_THUNK_ACTION;
  return PRIORITY_LEVELS.NORMAL_ACTION;
}

function describe(error: unknown): string {
  if (error instanceof Error) return error.message;
  return typeof error === 'string' ? error : JSON.stringify(error);
}
