// @vitest-environment jsdom
import type { Action } from '@zubridge/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PreloadOptions } from '../src/types/preload.js';

const { processor, validateAction, setupErrorHandlers } = vi.hoisted(() => ({
  processor: {
    initialize: vi.fn(),
    setStateProvider: vi.fn(),
    executeThunk: vi.fn(),
    completeAction: vi.fn(),
    forceCleanupExpiredActions: vi.fn(),
    destroy: vi.fn(),
  },
  validateAction: vi.fn(),
  setupErrorHandlers: vi.fn(),
}));

vi.mock('@zubridge/utils', () => ({ debug: vi.fn() }));

vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld: vi.fn() },
  ipcRenderer: {
    invoke: vi.fn(),
    send: vi.fn(),
    on: vi.fn(),
    removeListener: vi.fn(),
  },
}));

vi.mock('../src/renderer/rendererThunkProcessor.js', () => ({
  RendererThunkProcessor: vi.fn().mockImplementation(function () {
    return processor;
  }),
}));

vi.mock('../src/utils/globalErrorHandlers.js', () => ({
  setupRendererErrorHandlers: setupErrorHandlers,
}));

vi.mock('../src/bridge/ipc/validation.js', () => ({
  validateActionInRenderer: validateAction,
}));

type Listener = (event: unknown, payload?: unknown) => unknown;
type InitOptions = {
  actionSender: (action: Action, parentId?: string, options?: { batch?: boolean }) => Promise<void>;
  batchFlusher: () => Promise<{ batchId: string; actionsSent: number; actionIds: string[] }>;
  thunkRegistrar: (
    thunkId: string,
    parentId?: string,
    immediate?: boolean,
    bypassAccessControl?: boolean,
  ) => Promise<void>;
  thunkCompleter: (thunkId: string) => Promise<void>;
};
type ValidatorApi = {
  getWindowSubscriptions: () => Promise<string[]>;
  isSubscribedToKey: (key: string) => Promise<boolean>;
  validateStateAccess: (key: string) => Promise<boolean>;
  stateKeyExists: (state: unknown, key: string) => boolean;
};

const flush = async (): Promise<void> => {
  for (let i = 0; i < 5; i++) {
    await Promise.resolve();
  }
};

async function setup(options?: PreloadOptions, ipcOverrides?: Record<string, unknown>) {
  vi.resetModules();
  const { ipcRenderer, contextBridge } = await import('electron');
  const ipc = vi.mocked(ipcRenderer);
  const bridge = vi.mocked(contextBridge);

  ipc.invoke.mockImplementation(async (channel: string) => {
    if (ipcOverrides && channel in ipcOverrides) {
      const value = ipcOverrides[channel];
      if (value instanceof Error) {
        throw value;
      }
      return value;
    }
    if (channel === 'zubridge:get-window-id') {
      return 7;
    }
    if (channel === 'zubridge:get-state') {
      return { counter: 1 };
    }
    return undefined;
  });

  const windowHandlers = new Map<string, (event?: unknown) => unknown>();
  const documentHandlers = new Map<string, () => unknown>();
  vi.stubGlobal('window', {
    addEventListener: vi.fn((name: string, fn: (event?: unknown) => unknown) => {
      windowHandlers.set(name, fn);
    }),
    removeEventListener: vi.fn(),
  });
  const doc = {
    visibilityState: 'visible',
    addEventListener: vi.fn((name: string, fn: () => unknown) => {
      documentHandlers.set(name, fn);
    }),
    removeEventListener: vi.fn(),
  };
  vi.stubGlobal('document', doc);

  const { preloadBridge } = await import('../src/preload.js');
  const result = preloadBridge<{ counter: number }>(options);
  await flush();

  const listenersFor = (channel: string): Listener[] =>
    ipc.on.mock.calls.filter((call) => call[0] === channel).map((call) => call[1] as Listener);
  const lastListener = (channel: string): Listener => {
    const found = listenersFor(channel).at(-1);
    if (!found) {
      throw new Error(`No listener registered for ${channel}`);
    }
    return found;
  };
  const sentOn = (channel: string) =>
    ipc.send.mock.calls.filter((call) => call[0] === channel).map((call) => call[1]);

  const initOptions = processor.initialize.mock.calls.at(-1)?.[0] as InitOptions & {
    windowId: number;
  };
  const validatorApi = bridge.exposeInMainWorld.mock.calls.find(
    (call) => call[0] === '__zubridge_subscriptionValidator',
  )?.[1] as ValidatorApi | undefined;

  return {
    result,
    ipc,
    bridge,
    doc,
    windowHandlers,
    documentHandlers,
    listenersFor,
    lastListener,
    sentOn,
    initOptions,
    validatorApi,
  };
}

describe('preloadBridge handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const fn of Object.values(processor)) {
      fn.mockReset();
    }
    processor.executeThunk.mockResolvedValue({ type: 'DONE' });
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  describe('initialisation', () => {
    it('should install the renderer error handlers', async () => {
      await setup();

      expect(setupErrorHandlers).toHaveBeenCalledTimes(1);
    });

    it('should initialise the thunk processor with the window id from the main process', async () => {
      const { initOptions } = await setup();

      expect(initOptions.windowId).toBe(7);
    });

    it('should wire the state provider to getState', async () => {
      const { ipc } = await setup();
      const provider = processor.setStateProvider.mock.calls[0][0] as (
        options?: unknown,
      ) => Promise<unknown>;

      await expect(provider({ bypassAccessControl: true })).resolves.toEqual({ counter: 1 });
      expect(ipc.invoke).toHaveBeenCalledWith('zubridge:get-state', { bypassAccessControl: true });
    });

    it('should not throw when the window id lookup fails', async () => {
      const { result } = await setup(undefined, {
        'zubridge:get-window-id': new Error('no window'),
      });

      expect(result.handlers).toBeDefined();
      expect(processor.initialize).not.toHaveBeenCalled();
    });
  });

  describe('getState', () => {
    it('should forward options to the main process', async () => {
      const { result, ipc } = await setup();

      await expect(result.handlers.getState({ bypassAccessControl: true })).resolves.toEqual({
        counter: 1,
      });
      expect(ipc.invoke).toHaveBeenCalledWith('zubridge:get-state', { bypassAccessControl: true });
    });
  });

  describe('subscribe', () => {
    it('should register the state update listener once for multiple subscribers', async () => {
      const { result, listenersFor } = await setup();

      result.handlers.subscribe(vi.fn());
      result.handlers.subscribe(vi.fn());

      expect(listenersFor('zubridge:state-update')).toHaveLength(1);
    });

    it('should remove the state update listener when the last subscriber leaves', async () => {
      const { result, ipc } = await setup();
      const unsubscribeA = result.handlers.subscribe(vi.fn());
      const unsubscribeB = result.handlers.subscribe(vi.fn());

      unsubscribeA();
      expect(ipc.removeListener).not.toHaveBeenCalledWith(
        'zubridge:state-update',
        expect.anything(),
      );

      unsubscribeB();
      expect(ipc.removeListener).toHaveBeenCalledWith('zubridge:state-update', expect.anything());
    });

    it('should resync from the main process when the sequence jumps backwards', async () => {
      const { result, lastListener, ipc } = await setup();
      const callback = vi.fn();
      result.handlers.subscribe(callback);
      const handler = lastListener('zubridge:state-update');
      await handler(
        {},
        { updateId: 'u1', seq: 1, delta: { type: 'full', fullState: { counter: 1 } } },
      );
      await handler(
        {},
        { updateId: 'u2', seq: 2, delta: { type: 'delta', changed: { counter: 2 } } },
      );
      callback.mockClear();
      ipc.invoke.mockClear();

      await handler(
        {},
        { updateId: 'u3', seq: 1, delta: { type: 'delta', changed: { counter: 9 } } },
      );

      expect(ipc.invoke).toHaveBeenCalledWith('zubridge:get-state', undefined);
      expect(callback).toHaveBeenCalledWith({ counter: 1 });
    });

    it('should merge deltas into cached state and notify subscribers', async () => {
      const { result, lastListener } = await setup();
      const callback = vi.fn();
      result.handlers.subscribe(callback);
      const handler = lastListener('zubridge:state-update');

      await handler(
        {},
        { updateId: 'u1', seq: 1, delta: { type: 'full', fullState: { counter: 1, name: 'a' } } },
      );
      await handler(
        {},
        { updateId: 'u2', seq: 2, delta: { type: 'delta', changed: { counter: 2 } } },
      );
      await handler({}, { updateId: 'u3', seq: 3, delta: { type: 'delta', removed: ['name'] } });

      expect(callback).toHaveBeenNthCalledWith(1, { counter: 1, name: 'a' });
      expect(callback).toHaveBeenNthCalledWith(2, { counter: 2, name: 'a' });
      expect(callback).toHaveBeenNthCalledWith(3, { counter: 2 });
    });

    it('should fall back to getState when an update carries no delta', async () => {
      const { result, lastListener, ipc } = await setup();
      const callback = vi.fn();
      result.handlers.subscribe(callback);

      await lastListener('zubridge:state-update')({}, { updateId: 'u1' });

      expect(callback).toHaveBeenCalledWith({ counter: 1 });
      expect(ipc.send).toHaveBeenCalledWith('zubridge:state-update-ack', {
        updateId: 'u1',
        windowId: 7,
        thunkId: undefined,
      });
    });

    it('should include the thunk id in the acknowledgement', async () => {
      const { result, lastListener, sentOn } = await setup();
      result.handlers.subscribe(vi.fn());

      await lastListener('zubridge:state-update')(
        {},
        {
          updateId: 'u1',
          thunkId: 't1',
          seq: 1,
          delta: { type: 'full', fullState: { counter: 1 } },
        },
      );

      expect(sentOn('zubridge:state-update-ack')).toEqual([
        { updateId: 'u1', windowId: 7, thunkId: 't1' },
      ]);
    });

    it('should not throw when the window id lookup for the acknowledgement fails', async () => {
      const { result, lastListener } = await setup(undefined, {
        'zubridge:get-window-id': new Error('gone'),
      });
      result.handlers.subscribe(vi.fn());

      await expect(
        lastListener('zubridge:state-update')(
          {},
          { updateId: 'u1', seq: 1, delta: { type: 'full', fullState: { counter: 1 } } },
        ),
      ).resolves.toBeUndefined();
    });

    it('should not throw when sending the acknowledgement fails', async () => {
      const { result, lastListener, ipc } = await setup();
      const callback = vi.fn();
      result.handlers.subscribe(callback);
      ipc.send.mockImplementation((channel: string) => {
        if (channel === 'zubridge:state-update-ack') {
          throw new Error('send failed');
        }
      });

      await expect(
        lastListener('zubridge:state-update')(
          {},
          { updateId: 'u1', seq: 1, delta: { type: 'full', fullState: { counter: 1 } } },
        ),
      ).resolves.toBeUndefined();
      expect(ipc.send).toHaveBeenCalledWith('zubridge:state-update-ack', expect.anything());
      expect(callback).toHaveBeenCalledWith({ counter: 1 });
    });
  });

  describe('dispatch without batching', () => {
    const options: PreloadOptions = { enableBatching: false, batching: { ackTimeoutMs: 1000 } };

    it('should send a string action and resolve on a matching acknowledgement', async () => {
      const { result, lastListener, sentOn } = await setup(options);

      const promise = result.handlers.dispatch('INCREMENT', 5);
      const [{ action }] = sentOn('zubridge:dispatch') as Array<{ action: Action }>;

      expect(action).toMatchObject({ type: 'INCREMENT', payload: 5 });
      expect(typeof action.__id).toBe('string');

      lastListener('zubridge:dispatch-ack')({}, { actionId: 'other' });
      lastListener('zubridge:dispatch-ack')({}, { actionId: action.__id });

      await expect(promise).resolves.toEqual(action);
    });

    it('should keep an existing action id and apply dispatch options from a string action', async () => {
      const { result, lastListener, sentOn } = await setup(options);

      const promise = result.handlers.dispatch('GO', undefined, {
        bypassAccessControl: true,
        immediate: true,
      });
      const [{ action }] = sentOn('zubridge:dispatch') as Array<{ action: Action }>;
      lastListener('zubridge:dispatch-ack')({}, { actionId: action.__id });
      const resolved = await promise;

      expect(resolved.__bypassAccessControl).toBe(true);
      expect(resolved.__immediate).toBe(true);
    });

    it('should preserve the id of an action object and read options from the second argument', async () => {
      const { result, lastListener, sentOn } = await setup(options);

      const promise = result.handlers.dispatch(
        { type: 'SET', payload: 1, __id: 'fixed' },
        { immediate: true },
      );
      const [{ action }] = sentOn('zubridge:dispatch') as Array<{ action: Action }>;
      lastListener('zubridge:dispatch-ack')({}, { actionId: 'fixed' });

      expect(action.__id).toBe('fixed');
      expect(action.__immediate).toBe(true);
      await expect(promise).resolves.toMatchObject({ type: 'SET', __id: 'fixed' });
    });

    it('should reject when the acknowledgement carries an error', async () => {
      const { result, lastListener, sentOn } = await setup(options);

      const promise = result.handlers.dispatch('FAIL');
      const [{ action }] = sentOn('zubridge:dispatch') as Array<{ action: Action }>;
      lastListener('zubridge:dispatch-ack')({}, { actionId: action.__id, error: 'nope' });

      await expect(promise).rejects.toThrow('nope');
    });

    it('should reject and remove its listener when no acknowledgement arrives', async () => {
      const { result, ipc, sentOn } = await setup(options);

      const promise = result.handlers.dispatch('SLOW');
      const rejection = expect(promise).rejects.toThrow(/Timeout waiting for acknowledgment/);
      const [{ action }] = sentOn('zubridge:dispatch') as Array<{ action: Action }>;
      await vi.advanceTimersByTimeAsync(1001);

      await rejection;
      expect(ipc.removeListener).toHaveBeenCalledWith(
        'zubridge:dispatch-ack',
        expect.any(Function),
      );
      expect(action.type).toBe('SLOW');
    });

    it('should throw without sending when validation fails', async () => {
      validateAction.mockImplementationOnce(() => {
        throw new Error('invalid action');
      });
      const { result, sentOn } = await setup(options);

      await expect(result.handlers.dispatch('BAD')).rejects.toThrow('invalid action');
      expect(sentOn('zubridge:dispatch')).toHaveLength(0);
    });

    it('should notify the thunk processor when a dispatch acknowledgement arrives', async () => {
      const { lastListener } = await setup(options);
      const payload = { actionId: 'a1', thunkState: { activeThunks: [1, 2] } };

      lastListener('zubridge:dispatch-ack')({}, payload);

      expect(processor.completeAction).toHaveBeenCalledWith('a1', payload);
    });
  });

  describe('dispatch with batching', () => {
    it('should send queued actions as a batch and resolve from the batch acknowledgement', async () => {
      const { result, lastListener, sentOn } = await setup({ batching: { windowMs: 10 } });

      const promise = result.handlers.dispatch('INCREMENT');
      expect(sentOn('zubridge:batch-dispatch')).toHaveLength(0);
      await vi.advanceTimersByTimeAsync(20);

      const [batch] = sentOn('zubridge:batch-dispatch') as Array<{
        batchId: string;
        actions: Array<{ id: string; action: Action }>;
      }>;
      expect(batch.actions).toHaveLength(1);
      expect(batch.actions[0].action.type).toBe('INCREMENT');

      lastListener('zubridge:batch-ack')(
        {},
        {
          batchId: batch.batchId,
          results: [{ actionId: batch.actions[0].id, success: true }],
        },
      );

      await expect(promise).resolves.toMatchObject({ type: 'INCREMENT' });
    });

    it('should reject queued actions when the batch acknowledgement reports an error', async () => {
      const { result, lastListener, sentOn } = await setup({ batching: { windowMs: 10 } });

      const promise = result.handlers.dispatch('INCREMENT');
      const rejection = expect(promise).rejects.toThrow('batch failed');
      await vi.advanceTimersByTimeAsync(20);
      const [batch] = sentOn('zubridge:batch-dispatch') as Array<{ batchId: string }>;

      lastListener('zubridge:batch-ack')(
        {},
        { batchId: batch.batchId, results: [], error: 'batch failed' },
      );

      await rejection;
    });

    it('should ignore acknowledgements for unknown batches', async () => {
      const { lastListener } = await setup();
      const listener = lastListener('zubridge:batch-ack');

      expect(() => listener({}, undefined)).not.toThrow();
      expect(() => listener({}, { batchId: 'unknown', results: [] })).not.toThrow();
    });

    it('should reject when the batch acknowledgement never arrives', async () => {
      const { result } = await setup({ batching: { windowMs: 10, ackTimeoutMs: 1000 } });

      const promise = result.handlers.dispatch('INCREMENT');
      const rejection = expect(promise).rejects.toThrow(/Timeout waiting for batch acknowledgment/);
      await vi.advanceTimersByTimeAsync(1100);

      await rejection;
    });

    it('should expose batch stats', async () => {
      const { result } = await setup({ batching: { windowMs: 10 } });

      void result.handlers.dispatch('INCREMENT').catch(() => undefined);

      expect(result.getBatchStats()?.currentQueueSize).toBe(1);
    });

    it('should return null stats when batching is disabled', async () => {
      const { result } = await setup({ enableBatching: false });

      expect(result.getBatchStats()).toBeNull();
    });
  });

  describe('thunk dispatch', () => {
    it('should forward the thunk and bypass flags to the processor', async () => {
      const { result } = await setup();
      const thunk = vi.fn();

      await result.handlers.dispatch(thunk as never, { bypassAccessControl: true });

      expect(processor.executeThunk).toHaveBeenCalledWith(thunk, {
        bypassAccessControl: true,
        immediate: false,
      });
    });

    it('should return an action result with an id', async () => {
      processor.executeThunk.mockResolvedValue({ type: 'DONE', payload: 1 });
      const { result } = await setup();

      const action = await result.handlers.dispatch(vi.fn() as never);

      expect(action).toMatchObject({ type: 'DONE', payload: 1 });
      expect(typeof action.__id).toBe('string');
    });

    it('should keep the id of a returned action', async () => {
      processor.executeThunk.mockResolvedValue({ type: 'DONE', __id: 'keep' });
      const { result } = await setup();

      await expect(result.handlers.dispatch(vi.fn() as never)).resolves.toMatchObject({
        __id: 'keep',
      });
    });

    it('should convert a string result into an action', async () => {
      processor.executeThunk.mockResolvedValue('FINISHED');
      const { result } = await setup();

      await expect(result.handlers.dispatch(vi.fn() as never)).resolves.toMatchObject({
        type: 'FINISHED',
      });
    });

    it('should wrap any other result in a THUNK_RESULT action', async () => {
      processor.executeThunk.mockResolvedValue(undefined);
      const { result } = await setup();

      await expect(result.handlers.dispatch(vi.fn() as never)).resolves.toMatchObject({
        type: 'THUNK_RESULT',
        payload: undefined,
      });
    });

    it('should rethrow thunk execution errors', async () => {
      processor.executeThunk.mockRejectedValue(new Error('thunk failed'));
      const { result } = await setup();

      await expect(result.handlers.dispatch(vi.fn() as never)).rejects.toThrow('thunk failed');
    });
  });

  describe('thunk processor wiring', () => {
    const action: Action = { type: 'A', __id: 'a1' };

    it('should send a top-level action through the batcher and complete it on acknowledgement', async () => {
      const { initOptions, lastListener, sentOn } = await setup({ batching: { windowMs: 10 } });

      const promise = initOptions.actionSender(action);
      await vi.advanceTimersByTimeAsync(20);
      const [batch] = sentOn('zubridge:batch-dispatch') as Array<{
        batchId: string;
        actions: Array<{ id: string }>;
      }>;
      lastListener('zubridge:batch-ack')(
        {},
        { batchId: batch.batchId, results: [{ actionId: batch.actions[0].id, success: true }] },
      );
      await promise;

      expect(validateAction).toHaveBeenCalledWith(action, undefined);
      expect(processor.completeAction).toHaveBeenCalledWith('a1', action);
    });

    it('should send thunk child actions directly unless batching is requested', async () => {
      const { initOptions, sentOn } = await setup();

      await initOptions.actionSender(action, 'parent');

      expect(sentOn('zubridge:dispatch')).toEqual([{ action, parentId: 'parent' }]);
      expect(sentOn('zubridge:batch-dispatch')).toHaveLength(0);
    });

    it('should batch thunk child actions when explicitly requested', async () => {
      const { initOptions, sentOn } = await setup({ batching: { windowMs: 10 } });

      void initOptions.actionSender(action, 'parent', { batch: true }).catch(() => undefined);
      await vi.advanceTimersByTimeAsync(20);

      expect(sentOn('zubridge:batch-dispatch')).toHaveLength(1);
      expect(sentOn('zubridge:dispatch')).toHaveLength(0);
    });

    it('should send directly when batching is disabled', async () => {
      const { initOptions, sentOn } = await setup({ enableBatching: false });

      await initOptions.actionSender(action);

      expect(sentOn('zubridge:dispatch')).toEqual([{ action, parentId: undefined }]);
    });

    it('should flush nothing when batching is disabled', async () => {
      const { initOptions } = await setup({ enableBatching: false });

      await expect(initOptions.batchFlusher()).resolves.toEqual({
        batchId: '',
        actionsSent: 0,
        actionIds: [],
      });
    });

    it('should flush queued actions through the batcher', async () => {
      const { result, initOptions, lastListener, sentOn } = await setup({
        batching: { windowMs: 1000 },
      });
      void result.handlers.dispatch('INCREMENT').catch(() => undefined);

      const flushing = initOptions.batchFlusher();
      await flush();
      const [batch] = sentOn('zubridge:batch-dispatch') as Array<{
        batchId: string;
        actions: Array<{ id: string }>;
      }>;
      lastListener('zubridge:batch-ack')(
        {},
        { batchId: batch.batchId, results: [{ actionId: batch.actions[0].id, success: true }] },
      );

      await expect(flushing).resolves.toMatchObject({ actionsSent: 1 });
    });

    it('should register a thunk and resolve on a successful acknowledgement', async () => {
      const { initOptions, lastListener, sentOn } = await setup();

      const promise = initOptions.thunkRegistrar('t1', 'parent', true, false);
      lastListener('zubridge:register-thunk-ack')({}, { thunkId: 't1', success: true });

      await expect(promise).resolves.toBeUndefined();
      expect(sentOn('zubridge:register-thunk')).toEqual([
        { thunkId: 't1', parentId: 'parent', immediate: true, bypassAccessControl: false },
      ]);
    });

    it('should reject thunk registration on a failed acknowledgement', async () => {
      const { initOptions, lastListener } = await setup();

      const promise = initOptions.thunkRegistrar('t1');
      lastListener('zubridge:register-thunk-ack')(
        {},
        { thunkId: 't1', success: false, error: 'denied' },
      );

      await expect(promise).rejects.toBe('denied');
    });

    it('should reject thunk registration with a default error when none is given', async () => {
      const { initOptions, lastListener } = await setup();

      const promise = initOptions.thunkRegistrar('t1');
      lastListener('zubridge:register-thunk-ack')({}, { thunkId: 't1', success: false });

      await expect(promise).rejects.toThrow('Thunk registration failed');
    });

    it('should ignore registration acknowledgements it is not waiting for', async () => {
      const { lastListener } = await setup();
      const listener = lastListener('zubridge:register-thunk-ack');

      expect(() => listener({}, undefined)).not.toThrow();
      expect(() => listener({}, { thunkId: 'unknown', success: true })).not.toThrow();
    });

    it('should reject thunk registration on timeout', async () => {
      const { initOptions } = await setup({ batching: { ackTimeoutMs: 1000 } });

      const promise = initOptions.thunkRegistrar('t1');
      const rejection = expect(promise).rejects.toThrow(
        'Timeout waiting for REGISTER_THUNK_ACK for thunk t1',
      );
      await vi.advanceTimersByTimeAsync(1001);

      await rejection;
    });

    it('should notify the main process when a thunk completes', async () => {
      const { initOptions, sentOn } = await setup();

      await initOptions.thunkCompleter('t1');

      expect(sentOn('zubridge:complete-thunk')).toEqual([{ thunkId: 't1' }]);
    });
  });

  describe('subscription validator API', () => {
    const withSubscriptions = (subscriptions: unknown) =>
      setup(undefined, { 'zubridge:get-window-subscriptions': subscriptions });

    it('should be exposed through the context bridge', async () => {
      const { validatorApi } = await setup();

      expect(validatorApi).toBeDefined();
    });

    it('should fall back to attaching to window when the context bridge throws', async () => {
      vi.resetModules();
      const { contextBridge } = await import('electron');
      vi.mocked(contextBridge.exposeInMainWorld).mockImplementationOnce(() => {
        throw new Error('context isolation disabled');
      });
      const windowStub: Record<string, unknown> = {
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      };
      vi.stubGlobal('window', windowStub);
      vi.stubGlobal('document', { addEventListener: vi.fn(), removeEventListener: vi.fn() });
      const { ipcRenderer } = await import('electron');
      vi.mocked(ipcRenderer.invoke).mockResolvedValue(1);

      const { preloadBridge } = await import('../src/preload.js');
      preloadBridge();
      await flush();

      expect(windowStub.__zubridge_subscriptionValidator).toBeDefined();
    });

    it('should return the subscriptions for the current window', async () => {
      const { validatorApi, ipc } = await withSubscriptions(['a', 'b']);

      await expect(validatorApi?.getWindowSubscriptions()).resolves.toEqual(['a', 'b']);
      expect(ipc.invoke).toHaveBeenCalledWith('zubridge:get-window-subscriptions', 7);
    });

    it('should return an empty list for a non-array response', async () => {
      const { validatorApi } = await withSubscriptions('nope');

      await expect(validatorApi?.getWindowSubscriptions()).resolves.toEqual([]);
    });

    it('should return an empty list when the lookup fails', async () => {
      const { validatorApi } = await withSubscriptions(new Error('ipc down'));

      await expect(validatorApi?.getWindowSubscriptions()).resolves.toEqual([]);
    });

    it.each([
      [['*'], 'anything', true],
      [['user'], 'user', true],
      [['user'], 'user.profile', true],
      [['user.profile'], 'user', false],
      [['user.profile.name'], 'user.profile', false],
      [['user.profile'], 'user.profile.name', true],
      [['user'], 'users', false],
      [['other'], 'user.profile', false],
      [[], 'user', false],
    ])(
      'should evaluate isSubscribedToKey with %j for %s as %s',
      async (subscriptions, key, expected) => {
        const { validatorApi } = await withSubscriptions(subscriptions);

        await expect(validatorApi?.isSubscribedToKey(key)).resolves.toBe(expected);
      },
    );

    it('should validate state access against subscriptions', async () => {
      const { validatorApi } = await withSubscriptions(['allowed']);

      await expect(validatorApi?.validateStateAccess('allowed')).resolves.toBe(true);
      await expect(validatorApi?.validateStateAccess('denied')).resolves.toBe(false);
    });

    it.each([
      [{ a: { b: 1 } }, 'a.b', true],
      [{ a: { b: 1 } }, 'a.c', false],
      [{ a: 1 }, 'a.b', false],
      [{ a: null }, 'a.b', false],
      [{}, '', false],
      [null, 'a', false],
      ['string', 'a', false],
    ])('should evaluate stateKeyExists(%j, %s) as %s', async (state, key, expected) => {
      const { validatorApi } = await setup();

      expect(validatorApi?.stateKeyExists(state, key)).toBe(expected);
    });
  });

  describe('page lifecycle cleanup', () => {
    it('should register lifecycle listeners', async () => {
      const { windowHandlers, documentHandlers } = await setup();

      expect([...windowHandlers.keys()]).toEqual(['beforeunload', 'pagehide']);
      expect([...documentHandlers.keys()]).toEqual(['visibilitychange']);
    });

    it('should reject pending thunk registrations on beforeunload', async () => {
      const { initOptions, windowHandlers } = await setup();
      const registration = initOptions.thunkRegistrar('t1');
      const rejection = expect(registration).rejects.toThrow('Page unload');

      windowHandlers.get('beforeunload')?.();

      await rejection;
    });

    it('should stop notifying subscribers after beforeunload', async () => {
      const { result, lastListener, windowHandlers } = await setup();
      const callback = vi.fn();
      result.handlers.subscribe(callback);
      const handler = lastListener('zubridge:state-update');

      windowHandlers.get('beforeunload')?.();
      await handler(
        {},
        { updateId: 'u1', seq: 1, delta: { type: 'full', fullState: { counter: 5 } } },
      );

      expect(callback).not.toHaveBeenCalled();
    });

    it('should destroy the batcher and thunk processor on a full pagehide', async () => {
      const { result, windowHandlers, initOptions, ipc } = await setup();
      const registration = initOptions.thunkRegistrar('t1');
      const rejection = expect(registration).rejects.toThrow('Complete cleanup');

      await windowHandlers.get('pagehide')?.({ persisted: false });
      await rejection;

      expect(processor.destroy).toHaveBeenCalledTimes(1);
      expect(ipc.removeListener).toHaveBeenCalledWith(
        'zubridge:dispatch-ack',
        expect.any(Function),
      );
      expect(result.getBatchStats()).toBeNull();
    });

    it('should only clean up expired actions when the page is cached', async () => {
      const { windowHandlers } = await setup();

      await windowHandlers.get('pagehide')?.({ persisted: true });

      expect(processor.forceCleanupExpiredActions).toHaveBeenCalledTimes(1);
      expect(processor.destroy).not.toHaveBeenCalled();
    });

    it('should clean up expired actions when the page becomes hidden', async () => {
      const { doc, documentHandlers } = await setup();

      doc.visibilityState = 'hidden';
      documentHandlers.get('visibilitychange')?.();
      await flush();

      expect(processor.forceCleanupExpiredActions).toHaveBeenCalledTimes(1);
    });

    it('should do nothing when the page becomes visible', async () => {
      const { documentHandlers } = await setup();

      documentHandlers.get('visibilitychange')?.();
      await flush();

      expect(processor.forceCleanupExpiredActions).not.toHaveBeenCalled();
    });
  });
});
