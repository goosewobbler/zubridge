import '@testing-library/jest-dom/vitest';

import type { UnlistenFn } from '@tauri-apps/api/event';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { AnyState } from '@zubridge/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  type BackendOptions,
  cleanupZubridge,
  getState,
  getWindowSubscriptions,
  initializeBridge,
  internalStore,
  subscribe,
  TauriCommandError,
  TauriCommands,
  TauriEvents,
  unsubscribe,
  useZubridgeDispatch,
  useZubridgeStore,
} from '../src/index.js';
import { getThunkProcessor } from '../src/renderer/rendererThunkProcessor.js';
import type { StateUpdatePayload } from '../src/types/tauri.js';

// --- Mocks Setup ---
let mockBackendState: AnyState = { counter: 0, initial: true };
let stateUpdateListener: ((event: { payload: unknown }) => void) | null = null;
const unlistenMock = vi.fn();

const mockInvoke = vi.fn(async <R = unknown>(cmd: string, args?: unknown): Promise<R> => {
  // Match either plugin:zubridge|<name> or bare <name> so tests can drive
  // both the plugin and direct command flavours.
  const bare = cmd.startsWith('plugin:zubridge|') ? cmd.slice('plugin:zubridge|'.length) : cmd;
  switch (bare) {
    case 'get_initial_state':
      return mockBackendState as unknown as R;
    case 'get_state':
      return { value: mockBackendState } as unknown as R;
    case 'dispatch_action':
      return {
        action_id: (args as { args: { action: { id?: string } } }).args.action.id ?? 'a1',
      } as unknown as R;
    case 'batch_dispatch':
      return {
        batch_id: (args as { args: { batch_id: string } }).args.batch_id,
        acked_action_ids: [],
      } as unknown as R;
    case 'register_thunk':
      return { thunk_id: (args as { args: { thunk_id: string } }).args.thunk_id } as unknown as R;
    case 'complete_thunk':
      return { thunk_id: (args as { args: { thunk_id: string } }).args.thunk_id } as unknown as R;
    case 'state_update_ack':
      return undefined as unknown as R;
    case 'subscribe':
      return { keys: (args as { args: { keys: string[] } }).args.keys } as unknown as R;
    case 'unsubscribe':
      return { keys: [] } as unknown as R;
    case 'get_window_subscriptions':
      return { keys: [] } as unknown as R;
    default:
      throw new Error(`[Mock Invoke] Unknown command: ${cmd}`);
  }
});

const mockListenRaw = vi.fn(
  async (event: string, callback: (event: { payload: unknown }) => void): Promise<UnlistenFn> => {
    if (event === TauriEvents.STATE_UPDATE) {
      stateUpdateListener = callback;
      return unlistenMock;
    }
    return vi.fn();
  },
);

const mockListen = async <E = unknown>(
  event: string,
  handler: (event: E) => void,
): Promise<UnlistenFn> => {
  return mockListenRaw(event, handler as (event: { payload: unknown }) => void);
};

const baseOptions: BackendOptions = {
  invoke: mockInvoke as BackendOptions['invoke'],
  listen: mockListen,
};

function emitStateUpdate(payload: StateUpdatePayload) {
  if (!stateUpdateListener) {
    throw new Error('[TEST] No state-update listener registered');
  }
  act(() => {
    stateUpdateListener?.({ payload });
  });
}

beforeEach(async () => {
  mockBackendState = { counter: 10, initial: true };
  stateUpdateListener = null;
  vi.clearAllMocks();
  unlistenMock.mockReset();
  mockInvoke.mockClear();
  mockListenRaw.mockClear();
  await cleanupZubridge();
});

describe('@zubridge/tauri', () => {
  describe('initializeBridge', () => {
    it('throws if invoke or listen are missing', async () => {
      await expect(initializeBridge({} as unknown as BackendOptions)).rejects.toThrow(
        /invoke.*listen/,
      );
      await expect(
        initializeBridge({ invoke: mockInvoke } as unknown as BackendOptions),
      ).rejects.toThrow();
    });

    it('moves status uninitialized -> initializing -> ready', async () => {
      expect(internalStore.getState().__bridge_status).toBe('uninitialized');
      const initPromise = initializeBridge(baseOptions);
      await waitFor(() => expect(internalStore.getState().__bridge_status).toBe('initializing'));
      await act(async () => {
        await initPromise;
      });
      expect(internalStore.getState().__bridge_status).toBe('ready');
    });

    it('probes the plugin format for the initial state', async () => {
      await act(async () => {
        await initializeBridge(baseOptions);
      });
      expect(mockInvoke).toHaveBeenCalledWith(TauriCommands.GET_INITIAL_STATE);
    });

    it('falls back to direct format when the plugin probe fails', async () => {
      mockInvoke.mockImplementationOnce(async () => {
        throw new Error('plugin not registered');
      });
      mockInvoke.mockImplementationOnce(async () => mockBackendState);
      await act(async () => {
        await initializeBridge(baseOptions);
      });
      const calls = mockInvoke.mock.calls.map((c) => c[0]);
      expect(calls[0]).toBe(TauriCommands.GET_INITIAL_STATE);
      expect(calls[1]).toBe('get_initial_state');
    });

    it('subscribes to the state-update event', async () => {
      await act(async () => {
        await initializeBridge(baseOptions);
      });
      expect(mockListenRaw).toHaveBeenCalledWith(TauriEvents.STATE_UPDATE, expect.any(Function));
    });

    it('hydrates the local replica from the initial state', async () => {
      mockBackendState = { counter: 42, initial: false };
      await act(async () => {
        await initializeBridge(baseOptions);
      });
      const state = internalStore.getState();
      expect(state.counter).toBe(42);
      expect(state.initial).toBe(false);
      expect(state.__bridge_status).toBe('ready');
    });

    it('marks status as error and rethrows on initialization failure', async () => {
      mockInvoke.mockImplementationOnce(async () => {
        throw new Error('plugin probe boom');
      });
      mockInvoke.mockImplementationOnce(async () => {
        throw new Error('direct probe boom');
      });
      await expect(initializeBridge(baseOptions)).rejects.toThrow();
      expect(internalStore.getState().__bridge_status).toBe('error');
    });

    it('honours direct-format getInitialState override and routes other commands to direct too', async () => {
      // When a caller provides only a direct-format getInitialState override
      // and leaves the rest at defaults, the bridge must infer the flavour
      // from the override's shape rather than hardcoding 'plugin' — otherwise
      // dispatch_action and friends would resolve to plugin:zubridge|... and
      // every subsequent invoke would fail.
      const directOptions: BackendOptions = {
        invoke: mockInvoke as BackendOptions['invoke'],
        listen: mockListen,
        commands: {
          getInitialState: 'get_initial_state',
        },
      };
      await act(async () => {
        await initializeBridge(directOptions);
      });
      const { result } = renderHook(() => useZubridgeDispatch());
      await act(async () => {
        await result.current('INCREMENT');
      });
      expect(mockInvoke).toHaveBeenCalledWith(
        'dispatch_action',
        expect.objectContaining({
          args: expect.objectContaining({
            action: expect.objectContaining({ action_type: 'INCREMENT' }),
          }),
        }),
      );
      // Sanity: plugin-format dispatch_action must NOT have been called.
      const calls = mockInvoke.mock.calls.map((c) => c[0]);
      expect(calls).not.toContain(TauriCommands.DISPATCH_ACTION);
    });
  });

  describe('state-update events', () => {
    beforeEach(async () => {
      await act(async () => {
        await initializeBridge(baseOptions);
      });
    });

    it('applies a full_state payload', async () => {
      emitStateUpdate({ seq: 1, update_id: 'u1', full_state: { counter: 99, initial: false } });
      await waitFor(() => expect(internalStore.getState().counter).toBe(99));
      expect(internalStore.getState().initial).toBe(false);
    });

    it('applies a delta payload on top of current state', async () => {
      emitStateUpdate({ seq: 1, update_id: 'u1', full_state: { counter: 1, label: 'a' } });
      emitStateUpdate({
        seq: 2,
        update_id: 'u2',
        delta: { changed: { counter: 2 }, removed: [] },
      });
      await waitFor(() => expect(internalStore.getState().counter).toBe(2));
      expect(internalStore.getState().label).toBe('a');
    });

    it('removes keys via the delta `removed` list', async () => {
      emitStateUpdate({ seq: 1, update_id: 'u1', full_state: { a: 1, b: 2 } });
      emitStateUpdate({
        seq: 2,
        update_id: 'u2',
        delta: { changed: {}, removed: ['b'] },
      });
      await waitFor(() => expect(internalStore.getState().b).toBeUndefined());
      expect(internalStore.getState().a).toBe(1);
    });

    it('triggers a resync on a sequence gap (via subscription-filtered get_state)', async () => {
      emitStateUpdate({ seq: 1, update_id: 'u1', full_state: { counter: 1 } });
      mockBackendState = { counter: 1000 };
      // Skip seq 2 — bridge should resync via get_state (subscription-filtered),
      // not get_initial_state (unfiltered) which would leave stale unsubscribed
      // keys in the local replica.
      emitStateUpdate({
        seq: 5,
        update_id: 'u5',
        delta: { changed: { counter: 999 }, removed: [] },
      });
      await waitFor(() => expect(internalStore.getState().counter).toBe(1000));
      const calls = mockInvoke.mock.calls.map((c) => c[0]);
      expect(calls).toContain(TauriCommands.GET_STATE);
    });

    it('acknowledges receipt by invoking state_update_ack', async () => {
      emitStateUpdate({ seq: 1, update_id: 'ack-me', full_state: { counter: 1 } });
      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith(
          TauriCommands.STATE_UPDATE_ACK,
          expect.objectContaining({
            args: expect.objectContaining({ update_id: 'ack-me' }),
          }),
        );
      });
    });
  });

  describe('useZubridgeDispatch', () => {
    beforeEach(async () => {
      await act(async () => {
        await initializeBridge(baseOptions);
      });
    });

    it('dispatches a string action through dispatch_action', async () => {
      const { result } = renderHook(() => useZubridgeDispatch());
      await act(async () => {
        await result.current('INCREMENT');
      });
      expect(mockInvoke).toHaveBeenCalledWith(
        TauriCommands.DISPATCH_ACTION,
        expect.objectContaining({
          args: expect.objectContaining({
            action: expect.objectContaining({ action_type: 'INCREMENT' }),
          }),
        }),
      );
    });

    it('dispatches an action object', async () => {
      const { result } = renderHook(() => useZubridgeDispatch());
      await act(async () => {
        await result.current({ type: 'SET_COUNTER', payload: 5 });
      });
      expect(mockInvoke).toHaveBeenCalledWith(
        TauriCommands.DISPATCH_ACTION,
        expect.objectContaining({
          args: expect.objectContaining({
            action: expect.objectContaining({ action_type: 'SET_COUNTER', payload: 5 }),
          }),
        }),
      );
    });

    it('wraps backend dispatch failures in TauriCommandError', async () => {
      mockInvoke.mockImplementationOnce(async () => {
        throw new Error('backend rejected');
      });
      const { result } = renderHook(() => useZubridgeDispatch());
      await expect(
        act(async () => {
          await result.current('FAILS');
        }),
      ).rejects.toBeInstanceOf(TauriCommandError);
    });

    it('executes thunks locally and registers them with the backend', async () => {
      const { result } = renderHook(() => useZubridgeDispatch());
      let observedState: AnyState | undefined;
      await act(async () => {
        await result.current(async (getStateFn, dispatchFn) => {
          observedState = await getStateFn();
          await dispatchFn('THUNK_ACTION');
        });
      });
      expect(observedState).toEqual(expect.objectContaining({ counter: 10 }));
      const calls = mockInvoke.mock.calls.map((c) => c[0]);
      expect(calls).toContain(TauriCommands.REGISTER_THUNK);
      expect(calls).toContain(TauriCommands.COMPLETE_THUNK);
      expect(calls).toContain(TauriCommands.DISPATCH_ACTION);
    });

    it('returns a stable dispatch reference across re-renders', async () => {
      await act(async () => {
        await initializeBridge(baseOptions);
      });
      const { result, rerender } = renderHook(() => useZubridgeDispatch());
      const first = result.current;
      rerender();
      const second = result.current;
      expect(first).toBe(second);
    });

    it('surfaces thunk registration failures instead of silently dropping the body', async () => {
      // Make register_thunk reject. The thunk body must NOT run, and the
      // dispatch() call must reject with the registration error. Restore the
      // base mock impl after the assertion so subsequent tests aren't affected.
      const originalImpl = mockInvoke.getMockImplementation();
      const registrationError = new Error('register_thunk backend rejection');
      mockInvoke.mockImplementation(async (cmd: string, args?: unknown) => {
        const bare = cmd.startsWith('plugin:zubridge|')
          ? cmd.slice('plugin:zubridge|'.length)
          : cmd;
        if (bare === 'register_thunk') throw registrationError;
        if (originalImpl) return originalImpl(cmd, args);
        return undefined;
      });

      try {
        await act(async () => {
          await initializeBridge(baseOptions);
        });
        const { result } = renderHook(() => useZubridgeDispatch());

        const bodyRan = vi.fn();
        let caught: unknown;
        await act(async () => {
          try {
            await result.current(async () => {
              bodyRan();
            });
          } catch (err) {
            caught = err;
          }
        });
        expect(bodyRan).not.toHaveBeenCalled();
        expect((caught as Error)?.message).toMatch(/register_thunk/i);
      } finally {
        if (originalImpl) {
          mockInvoke.mockImplementation(originalImpl);
        }
      }
    });

    it('forwards a thrown thunk error to complete_thunk', async () => {
      const { result } = renderHook(() => useZubridgeDispatch());
      let caught: unknown;
      await act(async () => {
        try {
          await result.current(async () => {
            throw new Error('thunk body boom');
          });
        } catch (err) {
          caught = err;
        }
      });
      expect((caught as Error)?.message).toBe('thunk body boom');

      const completeCall = mockInvoke.mock.calls.find((c) => c[0] === TauriCommands.COMPLETE_THUNK);
      expect(completeCall).toBeDefined();
      const args = (completeCall?.[1] as { args: { error?: string } } | undefined)?.args;
      expect(args?.error).toBe('thunk body boom');
    });
  });

  describe('RendererThunkProcessor.dispatchAction', () => {
    beforeEach(async () => {
      await act(async () => {
        await initializeBridge(baseOptions);
      });
    });

    it('resolves promptly on actionSender success (no waiting for safety timeout)', async () => {
      // Tauri's invoke is synchronous from the caller's perspective so there
      // is no separate ack channel — the success path must call completeAction
      // itself. Without that, dispatchAction would hang for the full
      // actionCompletionTimeoutMs (30s/60s) before completing.
      const processor = getThunkProcessor();
      const start = Date.now();
      await processor.dispatchAction('DIRECT_DISPATCH');
      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(1000);
      expect(mockInvoke).toHaveBeenCalledWith(
        TauriCommands.DISPATCH_ACTION,
        expect.objectContaining({
          args: expect.objectContaining({
            action: expect.objectContaining({ action_type: 'DIRECT_DISPATCH' }),
          }),
        }),
      );
    });
  });

  describe('useZubridgeDispatch race conditions', () => {
    it('thunks dispatched before init completes wait for ready and still fire backend commands', async () => {
      // Make get_initial_state slow so the bridge stays in 'initializing' for
      // a while. A thunk dispatched in that window must wait for ready before
      // running, otherwise its actionSender/thunkRegistrar callbacks haven't
      // been wired into the thunk processor yet and the thunk executes against
      // an uninitialised processor.
      let releaseInit: (() => void) | undefined;
      const initStalled = new Promise<void>((r) => {
        releaseInit = r;
      });
      mockInvoke.mockImplementationOnce(async (cmd: string) => {
        if (cmd === TauriCommands.GET_INITIAL_STATE) {
          await initStalled;
          return mockBackendState;
        }
        return mockBackendState;
      });

      const initPromise = initializeBridge(baseOptions);

      // bridgeClient is non-null here (assigned synchronously inside the IIFE)
      // but BridgeClient.initialize() hasn't completed. Dispatch a thunk now.
      const { result } = renderHook(() => useZubridgeDispatch());
      const thunkDone = act(async () => {
        await result.current(async (_getStateFn, dispatchFn) => {
          await dispatchFn('STARTED_BEFORE_READY');
        });
      });

      // Now let init resolve.
      releaseInit?.();
      await initPromise;
      await thunkDone;

      // Thunk lifecycle commands must have been invoked AFTER init wired up
      // the processor.
      const calls = mockInvoke.mock.calls.map((c) => c[0]);
      expect(calls).toContain(TauriCommands.REGISTER_THUNK);
      expect(calls).toContain(TauriCommands.DISPATCH_ACTION);
      expect(calls).toContain(TauriCommands.COMPLETE_THUNK);
    });

    it('cleanup mid-initialization does not clobber a successor client', async () => {
      // First init: stall get_initial_state so the IIFE is suspended.
      let releaseFirstProbe: (() => void) | undefined;
      const firstStalled = new Promise<void>((r) => {
        releaseFirstProbe = r;
      });
      mockInvoke.mockImplementationOnce(async () => {
        await firstStalled;
        return mockBackendState;
      });

      const firstInit = initializeBridge(baseOptions);

      // Tear down mid-init.
      await cleanupZubridge();

      // Start a second init while the first probe is still suspended. This
      // second init must NOT be clobbered when the first eventually rejects
      // (BridgeClient throws because it sees this.destroyed === true).
      mockBackendState = { counter: 77, fresh: true };
      const secondInit = initializeBridge(baseOptions);

      // Release the first probe so its IIFE resumes and throws.
      releaseFirstProbe?.();
      await expect(firstInit).rejects.toThrow();
      await secondInit;

      expect(internalStore.getState().__bridge_status).toBe('ready');
      expect(internalStore.getState().counter).toBe(77);
    });
  });

  describe('subscriptions', () => {
    beforeEach(async () => {
      await act(async () => {
        await initializeBridge(baseOptions);
      });
    });

    it('subscribe forwards keys and returns the resolved set (label injected by runtime)', async () => {
      const result = await subscribe(['a', 'b']);
      expect(result).toEqual(['a', 'b']);
      expect(mockInvoke).toHaveBeenCalledWith(
        TauriCommands.SUBSCRIBE,
        expect.objectContaining({
          args: expect.objectContaining({ keys: ['a', 'b'] }),
        }),
      );
      // Renderer must NOT pass source_label — Tauri's runtime injects it.
      const subscribeCall = mockInvoke.mock.calls.find((c) => c[0] === TauriCommands.SUBSCRIBE);
      expect(
        (subscribeCall?.[1] as { args?: Record<string, unknown> } | undefined)?.args,
      ).not.toHaveProperty('source_label');
    });

    it('unsubscribe clears keys', async () => {
      await unsubscribe(['a']);
      expect(mockInvoke).toHaveBeenCalledWith(
        TauriCommands.UNSUBSCRIBE,
        expect.objectContaining({ args: expect.objectContaining({ keys: ['a'] }) }),
      );
    });

    it('getWindowSubscriptions returns an array', async () => {
      const keys = await getWindowSubscriptions();
      expect(Array.isArray(keys)).toBe(true);
    });
  });

  describe('getState', () => {
    beforeEach(async () => {
      await act(async () => {
        await initializeBridge(baseOptions);
      });
    });

    it('invokes get_state and unwraps the value field', async () => {
      mockBackendState = { counter: 7, foo: 'bar' };
      const state = await getState();
      expect(state).toEqual(mockBackendState);
      expect(mockInvoke).toHaveBeenCalledWith(
        TauriCommands.GET_STATE,
        expect.objectContaining({ args: expect.objectContaining({ keys: undefined }) }),
      );
    });
  });

  describe('useZubridgeStore', () => {
    it('returns a slice and updates on state-update events', async () => {
      await act(async () => {
        await initializeBridge(baseOptions);
      });
      const { result } = renderHook(() =>
        useZubridgeStore((s) => (s as { counter?: number }).counter),
      );
      expect(result.current).toBe(10);
      emitStateUpdate({ seq: 1, update_id: 'u1', full_state: { counter: 99 } });
      await waitFor(() => expect(result.current).toBe(99));
    });

    it('honours equalityFn by reusing the previous slice reference when equal', async () => {
      await act(async () => {
        await initializeBridge(baseOptions);
      });
      type Pair = { a: number; b: number };
      const equalityFn = (x: Pair, y: Pair) => x.a === y.a && x.b === y.b;
      const { result } = renderHook(() =>
        useZubridgeStore(
          (s) => ({ a: (s as { counter?: number }).counter ?? 0, b: 1 }) as Pair,
          equalityFn,
        ),
      );
      const first = result.current;
      // Emit an update that doesn't change the selected slice's logical value;
      // equalityFn should return true and the hook should keep the same ref.
      emitStateUpdate({ seq: 1, update_id: 'u1', full_state: { counter: 10, other: 'changed' } });
      await waitFor(() => expect(result.current.a).toBe(10));
      expect(result.current).toBe(first);

      // A real change must produce a new reference.
      emitStateUpdate({ seq: 2, update_id: 'u2', full_state: { counter: 11 } });
      await waitFor(() => expect(result.current.a).toBe(11));
      expect(result.current).not.toBe(first);
    });
  });

  describe('cleanupZubridge', () => {
    it('unsubscribes the listener and resets to uninitialized', async () => {
      await act(async () => {
        await initializeBridge(baseOptions);
      });
      expect(internalStore.getState().__bridge_status).toBe('ready');
      await cleanupZubridge();
      expect(internalStore.getState().__bridge_status).toBe('uninitialized');
      expect(unlistenMock).toHaveBeenCalled();
    });

    it('makes dispatch fail with a clear error after cleanup', async () => {
      await act(async () => {
        await initializeBridge(baseOptions);
      });
      await cleanupZubridge();
      const { result } = renderHook(() => useZubridgeDispatch());
      await expect(
        act(async () => {
          await result.current('AFTER_CLEANUP');
        }),
      ).rejects.toThrow();
    });
  });
});
