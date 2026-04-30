import type { Action } from '@zubridge/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getThunkProcessor,
  RendererThunkProcessor,
  resetThunkProcessor,
} from '../../src/renderer/rendererThunkProcessor.js';

const mockActionSender = vi.fn();
const mockThunkRegistrar = vi.fn();
const mockThunkCompleter = vi.fn();

const defaultPreloadOptions = {
  actionCompletionTimeoutMs: 5000,
  maxQueueSize: 100,
};

const baseInitOptions = () => ({
  windowLabel: 'main',
  actionSender: mockActionSender,
  thunkRegistrar: mockThunkRegistrar,
  thunkCompleter: mockThunkCompleter,
});

/**
 * Tauri's actionSender uses Tauri's invoke, which already resolves only when
 * the backend has processed the action. The renderer treats a successful
 * `await actionSender(...)` as an implicit ack — there is no separate
 * `completeAction` ping coming back over a different channel as in Electron.
 *
 * Most tests therefore use a plain resolved sender; the processor will
 * auto-complete the action when the invoke returns.
 */
describe('RendererThunkProcessor (Tauri)', () => {
  let processor: RendererThunkProcessor;

  beforeEach(() => {
    vi.clearAllMocks();
    mockActionSender.mockResolvedValue(undefined);
    mockThunkRegistrar.mockResolvedValue(undefined);
    mockThunkCompleter.mockResolvedValue(undefined);

    processor = new RendererThunkProcessor(defaultPreloadOptions);
    processor.initialize(baseInitOptions());
  });

  afterEach(() => {
    processor.destroy();
    resetThunkProcessor();
  });

  describe('initialization', () => {
    it('tracks the webview label rather than a numeric window id', () => {
      // @ts-expect-error private
      expect(processor.currentWindowLabel).toBe('main');
      // @ts-expect-error private
      expect(
        (processor as unknown as { currentWindowId?: number }).currentWindowId,
      ).toBeUndefined();
    });

    it('stores the configured actionSender', () => {
      // @ts-expect-error private
      expect(processor.actionSender).toBe(mockActionSender);
    });

    it('updates the timeout when initialize provides actionCompletionTimeoutMs', () => {
      const p = new RendererThunkProcessor({
        actionCompletionTimeoutMs: 1000,
        maxQueueSize: 10,
      });
      p.initialize({
        ...baseInitOptions(),
        actionCompletionTimeoutMs: 12345,
      });
      // @ts-expect-error private
      expect(p.actionCompletionTimeoutMs).toBe(12345);
      p.destroy();
    });

    it('uses the constructor timeout when initialize does not override it', () => {
      const p = new RendererThunkProcessor({
        actionCompletionTimeoutMs: 7777,
        maxQueueSize: 10,
      });
      p.initialize(baseInitOptions());
      // @ts-expect-error private
      expect(p.actionCompletionTimeoutMs).toBe(7777);
      p.destroy();
    });
  });

  describe('state provider', () => {
    it('passes the configured provider to the thunk via getState', async () => {
      const provider = vi.fn().mockResolvedValue({ counter: 42 });
      processor.setStateProvider(provider);

      const thunk = vi.fn(async (getState) => {
        const state = await getState();
        return (state as { counter: number }).counter;
      });

      const result = await processor.executeThunk(thunk);
      expect(result).toBe(42);
      expect(provider).toHaveBeenCalled();
    });

    it('forwards the explicit bypassAccessControl flag from getState() into the provider', async () => {
      const provider = vi
        .fn()
        .mockImplementation((opts?: { bypassAccessControl?: boolean }) =>
          Promise.resolve(opts?.bypassAccessControl ? { mode: 'admin' } : { mode: 'restricted' }),
        );
      processor.setStateProvider(provider);

      const thunk = vi.fn(async (getState) => {
        const restricted = await getState();
        const elevated = await getState({ bypassAccessControl: true });
        return { restricted, elevated };
      });

      const result = await processor.executeThunk(thunk);
      expect(result).toEqual({
        restricted: { mode: 'restricted' },
        elevated: { mode: 'admin' },
      });
    });

    it('rejects getState when no provider is configured', async () => {
      const thunk = vi.fn(async (getState) => {
        await getState();
      });
      await expect(processor.executeThunk(thunk)).rejects.toThrow(/No state provider available/);
    });

    it('lets a state provider that returns null surface as null to the thunk', async () => {
      processor.setStateProvider(vi.fn().mockResolvedValue(null));

      const thunk = vi.fn(async (getState) => getState());
      await expect(processor.executeThunk(thunk)).resolves.toBeNull();
    });
  });

  describe('thunk execution', () => {
    it('registers the thunk with the backend, runs it, and notifies completion', async () => {
      const thunk = vi.fn(async () => 'ok');
      const result = await processor.executeThunk(thunk);

      expect(result).toBe('ok');
      expect(mockThunkRegistrar).toHaveBeenCalled();
      expect(mockThunkCompleter).toHaveBeenCalled();
    });

    it('rethrows when the registrar throws (running the body would risk state divergence)', async () => {
      mockThunkRegistrar.mockRejectedValue(new Error('register fail'));
      const thunk = vi.fn(async () => 'survived');

      // The Tauri renderer surfaces registrar failures rather than swallowing
      // them: with no backend-side thunk record, action acks would be misrouted
      // and the local replica could diverge silently. Compare with the
      // completer-error path below, which is non-fatal because the body has
      // already run.
      await expect(processor.executeThunk(thunk)).rejects.toThrow(/register fail/);
      expect(thunk).not.toHaveBeenCalled();
    });

    it('still resolves the thunk result when the completer throws', async () => {
      mockThunkCompleter.mockRejectedValue(new Error('complete fail'));
      const thunk = vi.fn(async () => 'survived');

      await expect(processor.executeThunk(thunk)).resolves.toBe('survived');
    });

    it('rethrows a thunk error after notifying completion', async () => {
      const thunk = vi.fn(async () => {
        throw new Error('Thunk error');
      });
      await expect(processor.executeThunk(thunk)).rejects.toThrow('Thunk error');
      expect(mockThunkCompleter).toHaveBeenCalled();
    });

    it('forwards immediate and bypassAccessControl to the registrar', async () => {
      const thunk = vi.fn(async () => 'ok');

      await processor.executeThunk(thunk, {
        immediate: true,
        bypassAccessControl: true,
      });

      expect(mockThunkRegistrar).toHaveBeenCalledWith(
        expect.any(String),
        undefined, // parentId
        true,
        true,
      );
    });

    it('handles nested thunks (parent thunk dispatches a child thunk)', async () => {
      const child = vi.fn(async () => 99);
      const parent = vi.fn(async (_getState, dispatch) => dispatch(child));

      const result = await processor.executeThunk(parent);
      expect(result).toBe(99);
      expect(parent).toHaveBeenCalled();
      expect(child).toHaveBeenCalled();
    });

    it('throws on partial initialization — thunkRegistrar set but currentWindowLabel missing', async () => {
      const partialProcessor = new RendererThunkProcessor(defaultPreloadOptions);
      partialProcessor.initialize({ ...baseInitOptions() });
      // biome-ignore lint/suspicious/noExplicitAny: private field access
      (partialProcessor as any).currentWindowLabel = undefined;

      const thunk = vi.fn(async () => 'should-not-run');
      await expect(partialProcessor.executeThunk(thunk)).rejects.toThrow(
        'Inconsistent initialization',
      );
      expect(thunk).not.toHaveBeenCalled();
    });

    it('throws on partial initialization — currentWindowLabel set but thunkRegistrar missing', async () => {
      const partialProcessor = new RendererThunkProcessor(defaultPreloadOptions);
      partialProcessor.initialize({ ...baseInitOptions() });
      // biome-ignore lint/suspicious/noExplicitAny: private field access
      (partialProcessor as any).thunkRegistrar = undefined;

      const thunk = vi.fn(async () => 'should-not-run');
      await expect(partialProcessor.executeThunk(thunk)).rejects.toThrow(
        'Inconsistent initialization',
      );
      expect(thunk).not.toHaveBeenCalled();
    });
  });

  describe('action dispatch via thunk', () => {
    it('passes batch:false for normal dispatch and resolves when invoke returns', async () => {
      const thunk = vi.fn(async (_getState, dispatch) => {
        await dispatch({ type: 'NORMAL' });
        return 'done';
      });

      const result = await processor.executeThunk(thunk);
      expect(result).toBe('done');

      expect(mockActionSender).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'NORMAL' }),
        expect.any(String),
        { batch: false },
      );
    });

    it('marks the first action of a thunk with __startsThunk', async () => {
      const thunk = vi.fn(async (_getState, dispatch) => {
        await dispatch({ type: 'FIRST' });
        await dispatch({ type: 'SECOND' });
      });

      await processor.executeThunk(thunk);

      const calls = mockActionSender.mock.calls;
      expect(calls[0][0]).toMatchObject({ type: 'FIRST', __startsThunk: true });
      expect(calls[1][0].type).toBe('SECOND');
      expect(calls[1][0].__startsThunk).toBeUndefined();
    });

    it('passes batch:true when using dispatch.batch', async () => {
      const thunk = vi.fn(async (_getState, dispatch) => {
        await dispatch.batch({ type: 'BATCHED' });
      });

      await processor.executeThunk(thunk);

      expect(mockActionSender).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'BATCHED' }),
        expect.any(String),
        { batch: true },
      );
    });

    it('supports dispatch.batch with a string action and payload', async () => {
      const thunk = vi.fn(async (_getState, dispatch) => {
        await dispatch.batch('BATCHED_STRING', 42);
      });

      await processor.executeThunk(thunk);

      expect(mockActionSender).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'BATCHED_STRING', payload: 42 }),
        expect.any(String),
        { batch: true },
      );
    });

    it('forwards { immediate: true } via dispatch options to __immediate on the action', async () => {
      const thunk = vi.fn(async (_getState, dispatch) => {
        await dispatch({ type: 'IMM' }, { immediate: true });
      });

      await processor.executeThunk(thunk);

      expect(mockActionSender).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'IMM', __immediate: true }),
        expect.any(String),
        { batch: false },
      );
    });

    it('forwards { bypassAccessControl: true } to __bypassAccessControl on the action', async () => {
      const thunk = vi.fn(async (_getState, dispatch) => {
        await dispatch({ type: 'BYP' }, { bypassAccessControl: true });
      });

      await processor.executeThunk(thunk);

      expect(mockActionSender).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'BYP', __bypassAccessControl: true }),
        expect.any(String),
        { batch: false },
      );
    });

    // NB: when actionSender throws inside an executeThunk dispatch, the
    // direct rethrow happens before `return actionPromise` is reached, leaving
    // the inner actionPromise rejected without an awaiter. That unhandled
    // rejection is a pre-existing renderer quirk; the equivalent
    // dispatchAction (direct) failure path is exercised below instead.
  });

  describe('dispatch.flush', () => {
    it('returns the result from the configured batchFlusher', async () => {
      const flushResult = { batchId: 'b1', actionsSent: 3, actionIds: ['a', 'b', 'c'] };
      const flusher = vi.fn().mockResolvedValue(flushResult);

      const p = new RendererThunkProcessor(defaultPreloadOptions);
      p.initialize({ ...baseInitOptions(), batchFlusher: flusher });

      const thunk = vi.fn(async (_getState, dispatch) => dispatch.flush());

      const result = await p.executeThunk(thunk);
      expect(result).toEqual(flushResult);
      expect(flusher).toHaveBeenCalled();

      p.destroy();
    });

    it('returns an empty FlushResult when no batchFlusher is configured', async () => {
      const thunk = vi.fn(async (_getState, dispatch) => dispatch.flush());
      const result = await processor.executeThunk(thunk);
      expect(result).toEqual({ batchId: '', actionsSent: 0, actionIds: [] });
    });
  });

  describe('dispatchAction (direct, non-thunk path)', () => {
    // Unlike the thunk-context dispatch (which treats actionSender's resolved
    // invoke as an implicit ack), the direct dispatchAction relies on an
    // external completeAction call (from the bridge client's state-update
    // listener) or the safety timeout. In tests, we mirror that by completing
    // the action ourselves once actionSender has been called.
    const completingSender = () =>
      vi
        .fn<(action: Action, parentId?: string) => Promise<void>>()
        .mockImplementation(async (action, _parentId) => {
          queueMicrotask(() => {
            if (action.__id) processor.completeAction(action.__id as string, {});
          });
        });

    it('throws synchronously when no actionSender is configured', async () => {
      const p = new RendererThunkProcessor(defaultPreloadOptions);
      // Intentionally not calling initialize()
      await expect(p.dispatchAction('NO_SENDER')).rejects.toThrow(
        /Action sender not configured for direct dispatch/,
      );
      p.destroy();
    });

    it('sends a string action with payload through actionSender', async () => {
      const sender = completingSender();
      processor.initialize({ ...baseInitOptions(), actionSender: sender });

      await processor.dispatchAction('STRING_ACTION', { data: 'test' });

      expect(sender).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'STRING_ACTION',
          payload: { data: 'test' },
          __id: expect.any(String),
        }),
        undefined,
      );
    });

    it('forwards a parentId through to actionSender', async () => {
      const sender = completingSender();
      processor.initialize({ ...baseInitOptions(), actionSender: sender });

      await processor.dispatchAction('CHILD', undefined, 'parent-thunk');

      expect(sender).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'CHILD' }),
        'parent-thunk',
      );
    });

    it('rejects when actionSender throws', async () => {
      const failing = vi.fn().mockRejectedValue(new Error('boom'));
      processor.initialize({ ...baseInitOptions(), actionSender: failing });
      await expect(processor.dispatchAction('FAIL')).rejects.toThrow('boom');
    });

    it('rejects with the original error instance to preserve type and stack trace', async () => {
      class CustomError extends Error {
        readonly code = 42;
      }
      const original = new CustomError('custom');
      processor.initialize({
        ...baseInitOptions(),
        actionSender: vi.fn().mockRejectedValue(original),
      });

      const caught = await processor.dispatchAction('TYPED_FAIL').catch((e) => e);
      expect(caught).toBe(original);
      expect((caught as CustomError).code).toBe(42);
    });
  });

  describe('completeAction', () => {
    it('does not throw when called for an unknown action id', () => {
      expect(() => processor.completeAction('unknown', { result: 'x' })).not.toThrow();
    });

    it('is idempotent — calling completeAction twice is safe', () => {
      const actionId = 'duplicate';
      // Seed pending state directly (simulates an in-flight dispatch).
      // biome-ignore lint/suspicious/noExplicitAny: private field access
      (processor as any).pendingDispatches.add(actionId);

      expect(() => processor.completeAction(actionId, { result: 'first' })).not.toThrow();
      expect(() => processor.completeAction(actionId, { result: 'second' })).not.toThrow();
    });

    it('clears the action from pending dispatches', () => {
      const actionId = 'pending-1';
      // biome-ignore lint/suspicious/noExplicitAny: private field access
      (processor as any).pendingDispatches.add(actionId);
      processor.completeAction(actionId, { result: 'x' });
      // biome-ignore lint/suspicious/noExplicitAny: private field access
      expect((processor as any).pendingDispatches.has(actionId)).toBe(false);
    });
  });

  describe('forceCleanupExpiredActions', () => {
    it('clears all pending dispatches', () => {
      // biome-ignore lint/suspicious/noExplicitAny: private field access
      const pd = (processor as any).pendingDispatches as Set<string>;
      pd.add('a');
      pd.add('b');
      expect(pd.size).toBe(2);

      processor.forceCleanupExpiredActions();
      expect(pd.size).toBe(0);
    });
  });

  describe('destroy', () => {
    it('clears all references and the pending queue', () => {
      // biome-ignore lint/suspicious/noExplicitAny: private field access
      (processor as any).pendingDispatches.add('test');

      processor.destroy();

      // biome-ignore lint/suspicious/noExplicitAny: private field access
      expect((processor as any).actionSender).toBeUndefined();
      // biome-ignore lint/suspicious/noExplicitAny: private field access
      expect((processor as any).thunkRegistrar).toBeUndefined();
      // biome-ignore lint/suspicious/noExplicitAny: private field access
      expect((processor as any).thunkCompleter).toBeUndefined();
      // biome-ignore lint/suspicious/noExplicitAny: private field access
      expect((processor as any).stateProvider).toBeUndefined();
      // biome-ignore lint/suspicious/noExplicitAny: private field access
      expect((processor as any).currentWindowLabel).toBeUndefined();
      // biome-ignore lint/suspicious/noExplicitAny: private field access
      expect((processor as any).pendingDispatches.size).toBe(0);
    });
  });

  describe('singleton (getThunkProcessor / resetThunkProcessor)', () => {
    afterEach(() => {
      resetThunkProcessor();
    });

    it('returns the same instance for repeated calls', () => {
      const a = getThunkProcessor(defaultPreloadOptions);
      const b = getThunkProcessor(defaultPreloadOptions);
      expect(a).toBe(b);
      expect(a).toBeInstanceOf(RendererThunkProcessor);
    });

    it('returns a fresh instance after resetThunkProcessor', () => {
      const first = getThunkProcessor(defaultPreloadOptions);
      resetThunkProcessor();
      const second = getThunkProcessor(defaultPreloadOptions);
      expect(first).not.toBe(second);
    });

    it('resetThunkProcessor is a no-op when no instance exists', () => {
      // Ensure clean slate
      resetThunkProcessor();
      expect(() => resetThunkProcessor()).not.toThrow();
    });
  });
});
