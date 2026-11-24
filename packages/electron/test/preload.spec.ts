import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock external dependencies for preload tests
vi.mock('@zubridge/utils', () => ({
  debug: vi.fn(),
}));

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: vi.fn(),
  },
  ipcRenderer: {
    invoke: vi.fn(),
    send: vi.fn(),
    on: vi.fn(),
    removeListener: vi.fn(),
  },
}));

vi.mock('../src/renderer/rendererThunkProcessor.js', () => ({
  RendererThunkProcessor: vi.fn().mockImplementation(function () {
    return {
      initialize: vi.fn(),
      setStateProvider: vi.fn(),
    };
  }),
}));

vi.mock('../src/utils/globalErrorHandlers.js', () => ({
  setupRendererErrorHandlers: vi.fn(),
}));

vi.mock('../src/utils/preloadOptions.js', () => ({
  getPreloadOptions: vi.fn(() => ({
    actionCompletionTimeoutMs: 30000,
    maxQueueSize: 100,
    enableBatching: true,
    batching: {},
  })),
  getBatchingConfig: vi.fn(() => ({
    windowMs: 16,
    maxBatchSize: 50,
    priorityFlushThreshold: 80,
    ackTimeoutMs: 30000,
  })),
}));

describe('Preload Bridge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should export preloadBridge function', async () => {
    const { preloadBridge } = await import('../src/preload.js');
    expect(typeof preloadBridge).toBe('function');
  });

  it('should create preload bridge with handlers', async () => {
    const { preloadBridge } = await import('../src/preload.js');

    // Mock the global objects that preload.ts expects
    (global as typeof globalThis).window = {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as Window & typeof globalThis;
    vi.stubGlobal('document', {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    (global as typeof globalThis).process = { platform: 'darwin' } as NodeJS.Process;

    const result = preloadBridge();

    expect(result).toHaveProperty('handlers');
    expect(result).toHaveProperty('initialized');
    expect(result).toHaveProperty('getBatchStats');
    expect(result.handlers).toHaveProperty('subscribe');
    expect(result.handlers).toHaveProperty('getState');
    expect(result.handlers).toHaveProperty('dispatch');
  });

  describe('getBatchStats', () => {
    beforeEach(() => {
      (global as typeof globalThis).window = {
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      } as unknown as Window & typeof globalThis;
      vi.stubGlobal('document', {
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      });
      (global as typeof globalThis).process = { platform: 'darwin' } as NodeJS.Process;
    });

    it('should return batch stats when batching is enabled', async () => {
      const { preloadBridge } = await import('../src/preload.js');
      const result = preloadBridge({ enableBatching: true });

      const stats = result.getBatchStats();
      expect(stats).not.toBeNull();
      expect(stats).toHaveProperty('totalBatches', 0);
      expect(stats).toHaveProperty('totalActions', 0);
      expect(stats).toHaveProperty('averageBatchSize', 0);
      expect(stats).toHaveProperty('currentQueueSize', 0);
      expect(stats).toHaveProperty('isFlushing', false);
    });

    it('should return null when batching is disabled', async () => {
      const { getPreloadOptions } = await import('../src/utils/preloadOptions.js');
      vi.mocked(getPreloadOptions).mockReturnValueOnce({
        actionCompletionTimeoutMs: 30000,
        maxQueueSize: 100,
        enableBatching: false,
        batching: {},
      });

      const { preloadBridge } = await import('../src/preload.js');
      const result = preloadBridge({ enableBatching: false });

      expect(result.getBatchStats()).toBeNull();
    });
  });

  describe('STATE_UPDATE sequence handling', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      (global as typeof globalThis).window = {
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      } as unknown as Window & typeof globalThis;
      vi.stubGlobal('document', {
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      });
    });

    /**
     * Helper to set up preloadBridge and extract the STATE_UPDATE handler.
     * Subscribes a listener so the handler is registered, then returns
     * the handler and utilities.
     */
    async function setupStateUpdateHandler() {
      const { ipcRenderer } = await import('electron');
      const mockedIpc = vi.mocked(ipcRenderer);

      mockedIpc.invoke.mockImplementation(async (channel: string) => {
        if (channel === 'zubridge:get-window-id') {
          return 1;
        }
        if (channel === 'zubridge:get-state') {
          return { counter: 42 };
        }
        return undefined;
      });

      const { preloadBridge } = await import('../src/preload.js');
      const result = preloadBridge();

      const subscriberCallback = vi.fn();
      result.handlers.subscribe(subscriberCallback);

      // Find the STATE_UPDATE listener registered via ipcRenderer.on
      const onCalls = mockedIpc.on.mock.calls;
      const stateUpdateCall = onCalls.find((call) => call[0] === 'zubridge:state-update');
      const stateUpdateHandler = stateUpdateCall?.[1] as (
        event: unknown,
        payload: unknown,
      ) => Promise<void>;

      return { stateUpdateHandler, subscriberCallback, mockedIpc };
    }

    it('should detect gap when first message (seq=1) is dropped', async () => {
      const { stateUpdateHandler, subscriberCallback, mockedIpc } = await setupStateUpdateHandler();
      expect(stateUpdateHandler).toBeDefined();

      // Clear mocks from initialization so we only see calls from our handler
      mockedIpc.invoke.mockClear();
      mockedIpc.send.mockClear();
      subscriberCallback.mockClear();

      // Simulate seq=2 arriving first (seq=1 was dropped).
      // Without the fix, expectedSeq > 0 would prevent gap detection.
      await stateUpdateHandler(
        {},
        {
          updateId: 'u-2',
          delta: { type: 'delta', changed: { counter: 2 } },
          seq: 2,
        },
      );

      // Gap recovery should have called getState (with options=undefined)
      const getStateCalls = mockedIpc.invoke.mock.calls.filter(
        (call) => call[0] === 'zubridge:get-state',
      );
      expect(getStateCalls.length).toBeGreaterThanOrEqual(1);
      // Subscriber should be notified with the resynced state
      expect(subscriberCallback).toHaveBeenCalledWith({ counter: 42 });
    });

    it('should accept empty full-state sentinel without falling back to getState', async () => {
      const { stateUpdateHandler, subscriberCallback, mockedIpc } = await setupStateUpdateHandler();
      expect(stateUpdateHandler).toBeDefined();

      mockedIpc.invoke.mockClear();
      mockedIpc.send.mockClear();
      subscriberCallback.mockClear();

      // Send the empty sentinel that SubscriptionHandler sends when all
      // subscribed values are non-serializable
      await stateUpdateHandler(
        {},
        {
          updateId: 'u-sentinel',
          delta: { type: 'full', fullState: {} },
          seq: 1,
        },
      );

      // Should NOT fall back to getState — the sentinel is a valid full-state update
      const getStateCalls = mockedIpc.invoke.mock.calls.filter(
        (call) => call[0] === 'zubridge:get-state',
      );
      expect(getStateCalls).toHaveLength(0);

      // ACK should still be sent
      expect(mockedIpc.send).toHaveBeenCalledWith(
        'zubridge:state-update-ack',
        expect.objectContaining({ updateId: 'u-sentinel' }),
      );

      // Subscriber should NOT be notified — empty sentinel skips listener
      // notification to avoid a flash of empty state before real data arrives
      expect(subscriberCallback).not.toHaveBeenCalled();
    });

    it('should send ACK even for duplicate seq messages', async () => {
      const { stateUpdateHandler, subscriberCallback, mockedIpc } = await setupStateUpdateHandler();
      expect(stateUpdateHandler).toBeDefined();

      // First, send seq=1 normally
      await stateUpdateHandler(
        {},
        {
          updateId: 'u-1',
          delta: { type: 'delta', changed: { counter: 1 } },
          seq: 1,
        },
      );
      expect(subscriberCallback).toHaveBeenCalledTimes(1);

      mockedIpc.send.mockClear();
      subscriberCallback.mockClear();

      // Send seq=1 again (duplicate)
      await stateUpdateHandler(
        {},
        {
          updateId: 'u-1-dup',
          delta: { type: 'delta', changed: { counter: 1 } },
          seq: 1,
        },
      );

      // Subscriber should NOT be called again (state merge skipped)
      expect(subscriberCallback).not.toHaveBeenCalled();
      // But ACK should still be sent so thunks don't hang
      expect(mockedIpc.send).toHaveBeenCalledWith(
        'zubridge:state-update-ack',
        expect.objectContaining({ updateId: 'u-1-dup' }),
      );
    });
  });
});
