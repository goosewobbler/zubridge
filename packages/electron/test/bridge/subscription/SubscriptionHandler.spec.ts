import type { AnyState, StateManager } from '@zubridge/types';
import type { WebContents } from 'electron';
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import type { ResourceManager } from '../../../src/bridge/resources/ResourceManager.js';
import { SubscriptionHandler } from '../../../src/bridge/subscription/SubscriptionHandler.js';
import type { SubscriptionManager } from '../../../src/subscription/SubscriptionManager.js';
import {
  getWebContents,
  safelySendToWindow,
  type WebContentsTracker,
} from '../../../src/utils/windows.js';

// Helper function for mock implementation
const getWebContentsFromMock = (wc: unknown): WebContents => {
  if (wc && typeof wc === 'object' && 'webContents' in wc) {
    return wc.webContents as WebContents;
  }
  return wc as WebContents;
};

// Mock dependencies
vi.mock('electron', () => ({
  ipcMain: {
    emit: vi.fn(),
  },
}));

vi.mock('../../../src/thunk/init.js', () => ({
  thunkManager: {
    cleanupDeadRenderer: vi.fn(),
    getCurrentThunkActionId: vi.fn(() => undefined),
    trackStateUpdateForThunk: vi.fn(),
  },
}));

vi.mock('../../../src/utils/windows.js', () => ({
  getWebContents: vi.fn(),
  safelySendToWindow: vi.fn(),
  isDestroyed: vi.fn(() => false),
  setupDestroyListener: vi.fn(),
}));

vi.mock('../../../src/utils/serialization.js', () => ({
  sanitizeState: vi.fn((state) => state),
}));

describe('SubscriptionHandler', () => {
  let subscriptionHandler: SubscriptionHandler<AnyState>;
  let mockWebContents: WebContents[];
  let mockResourceManager: {
    getSubscriptionManager: Mock<(id: number) => unknown>;
    addSubscriptionManager: Mock<(id: number, manager: unknown) => void>;
    removeSubscriptionManager: Mock<(id: number) => void>;
    hasDestroyListener: Mock<(id: number) => boolean>;
    addDestroyListener: Mock<(id: number) => void>;
    getMiddlewareCallbacks: Mock<() => unknown>;
    setMiddlewareCallbacks: Mock<(callbacks: unknown) => void>;
    clearAll: Mock<() => void>;
  };
  let mockStateManager: StateManager<AnyState>;
  let mockWindowTracker: { getActiveWebContents: () => { id: number }[] };

  beforeEach(() => {
    vi.clearAllMocks();

    // Create mock WebContents
    mockWebContents = [
      { id: 123, send: vi.fn(), isDestroyed: vi.fn(() => false) } as unknown as WebContents,
      { id: 456, send: vi.fn(), isDestroyed: vi.fn(() => false) } as unknown as WebContents,
      { id: 789, send: vi.fn(), isDestroyed: vi.fn(() => false) } as unknown as WebContents,
    ];

    // Create mock resource manager
    mockResourceManager = {
      getSubscriptionManager: vi.fn(),
      addSubscriptionManager: vi.fn(),
      removeSubscriptionManager: vi.fn(),
      hasDestroyListener: vi.fn(() => false),
      addDestroyListener: vi.fn(),
      getMiddlewareCallbacks: vi.fn(() => ({})),
      setMiddlewareCallbacks: vi.fn(),
      clearAll: vi.fn(),
    };

    // Create mock state manager
    mockStateManager = {
      getState: vi.fn(() => ({ counter: 42 })),
      subscribe: vi.fn(),
      processAction: vi.fn(),
    };

    // Create mock window tracker
    mockWindowTracker = {
      getActiveWebContents: vi.fn(() => []),
      track: vi.fn(() => true),
      untrack: vi.fn(),
      cleanup: vi.fn(),
    } as unknown as WebContentsTracker;

    subscriptionHandler = new SubscriptionHandler(
      mockStateManager,
      mockResourceManager as unknown as ResourceManager<AnyState>,
      mockWindowTracker as unknown as WebContentsTracker,
    );

    // Set up getWebContents mock to return WebContents directly
    (getWebContents as Mock).mockImplementation(getWebContentsFromMock);
  });

  describe('subscribe', () => {
    it('should subscribe windows with specified keys', () => {
      const keys = ['counter', 'user'];
      const mockSubManager = {
        subscribe: vi.fn(() => ({ status: 'registered' as const, unsubscribe: vi.fn() })),
        unsubscribe: vi.fn(),
        getCurrentSubscriptionKeys: vi.fn(() => []),
      };
      (mockResourceManager.getSubscriptionManager as Mock).mockReturnValue(mockSubManager);

      const result = subscriptionHandler.subscribe(mockWebContents, keys);

      expect(result).toBeDefined();
      expect(mockResourceManager.getSubscriptionManager).toHaveBeenCalledTimes(3);
      expect(mockResourceManager.getSubscriptionManager).toHaveBeenCalledWith(123);
      expect(mockResourceManager.getSubscriptionManager).toHaveBeenCalledWith(456);
      expect(mockResourceManager.getSubscriptionManager).toHaveBeenCalledWith(789);
    });

    it('should return unsubscribe function', () => {
      const keys = ['counter'];
      const mockSubManager = {
        subscribe: vi.fn(() => ({ status: 'registered' as const, unsubscribe: vi.fn() })),
        unsubscribe: vi.fn(),
        getCurrentSubscriptionKeys: vi.fn(() => []),
      };
      (mockResourceManager.getSubscriptionManager as Mock).mockReturnValue(mockSubManager);

      const result = subscriptionHandler.subscribe(mockWebContents, keys);

      expect(typeof result.unsubscribe).toBe('function');
    });

    it('should not send initial state when keys is empty array', () => {
      const mockSubManager = {
        subscribe: vi.fn(() => ({ status: 'registered' as const, unsubscribe: vi.fn() })),
        unsubscribe: vi.fn(),
        getCurrentSubscriptionKeys: vi.fn(() => []),
      };
      (mockResourceManager.getSubscriptionManager as Mock).mockReturnValue(mockSubManager);
      (safelySendToWindow as Mock).mockClear();

      const result = subscriptionHandler.subscribe(mockWebContents, []);

      // Should set up subscription manager (for GET_STATE filtering) but not send initial state
      expect(typeof result.unsubscribe).toBe('function');
      expect(safelySendToWindow).not.toHaveBeenCalled();
    });

    it('should send empty full-state sentinel when all subscribed values are non-serializable', async () => {
      const { sanitizeState } = await import('../../../src/utils/serialization.js');
      // Simulate sanitizeState stripping all values (e.g. all functions)
      (sanitizeState as Mock).mockReturnValueOnce({});

      const stateWithFn = { onUpdate: () => {} };
      const stateManager: StateManager<AnyState> = {
        getState: vi.fn(() => stateWithFn),
        subscribe: vi.fn(),
        processAction: vi.fn(),
      };

      const singleWc = {
        id: 900,
        isDestroyed: vi.fn(() => false),
        send: vi.fn(),
      } as unknown as WebContents;

      const mockSubManager = {
        subscribe: vi.fn(() => ({ status: 'registered' as const, unsubscribe: vi.fn() })),
        unsubscribe: vi.fn(),
        getCurrentSubscriptionKeys: vi.fn(() => []),
      };
      (mockResourceManager.getSubscriptionManager as Mock).mockReturnValue(mockSubManager);
      (safelySendToWindow as Mock).mockClear();

      const handler = new SubscriptionHandler(
        stateManager,
        mockResourceManager as unknown as ResourceManager<AnyState>,
        mockWindowTracker as unknown as WebContentsTracker,
      );

      handler.selectiveSubscribe(singleWc, ['onUpdate']);

      // An empty full-state sentinel is sent so the renderer knows the
      // subscription is live and doesn't wait indefinitely for initial state
      expect(safelySendToWindow).toHaveBeenCalledWith(
        singleWc,
        expect.any(String),
        expect.objectContaining({
          delta: { type: 'full', fullState: {} },
        }),
      );
    });
  });

  describe('unsubscribe', () => {
    it('should unsubscribe windows with specified keys', () => {
      const keys = ['counter', 'user'];
      const mockSubManager = {
        unsubscribe: vi.fn(),
        getCurrentSubscriptionKeys: vi.fn(() => []),
      };
      (mockResourceManager.getSubscriptionManager as Mock).mockReturnValue(mockSubManager);

      subscriptionHandler.unsubscribe(mockWebContents, keys);

      expect(mockResourceManager.getSubscriptionManager).toHaveBeenCalledTimes(3);
      mockWebContents.forEach((wc) => {
        expect(mockSubManager.unsubscribe).toHaveBeenCalledWith(keys, expect.any(Function), wc.id);
      });
    });

    it('should not untrack window when partial unsubscribe leaves remaining subscriptions', () => {
      const mockSubManager = {
        unsubscribe: vi.fn(),
        getCurrentSubscriptionKeys: vi.fn(() => ['theme']),
      };
      (mockResourceManager.getSubscriptionManager as Mock).mockReturnValue(mockSubManager);

      const wc = mockWebContents[0];
      subscriptionHandler.unsubscribe(wc, ['counter']);

      expect(mockSubManager.unsubscribe).toHaveBeenCalledWith(
        ['counter'],
        expect.any(Function),
        wc.id,
      );
      // Window still has 'theme' subscription — must NOT be untracked
      expect((mockWindowTracker as unknown as { untrack: Mock }).untrack).not.toHaveBeenCalled();
    });

    it('should untrack window when unsubscribe removes all remaining subscriptions', () => {
      const mockSubManager = {
        unsubscribe: vi.fn(),
        getCurrentSubscriptionKeys: vi.fn(() => []),
      };
      (mockResourceManager.getSubscriptionManager as Mock).mockReturnValue(mockSubManager);

      const wc = mockWebContents[0];
      subscriptionHandler.unsubscribe(wc, ['counter']);

      // No subscriptions remain — window should be untracked
      expect((mockWindowTracker as unknown as { untrack: Mock }).untrack).toHaveBeenCalledWith(wc);
    });
  });

  describe('serialization maxDepth configuration', () => {
    it('should pass serializationMaxDepth to sanitizeState when sending state updates', async () => {
      // Create deep nested state
      const deepState = {
        level1: {
          level2: {
            level3: {
              level4: {
                level5: 'deep',
              },
            },
          },
        },
      };

      mockStateManager.getState = vi.fn(() => deepState);

      const mockWebContents = {
        id: 123,
        isDestroyed: vi.fn(() => false),
        send: vi.fn(),
      } as unknown as WebContents;

      const mockSubManager = {
        subscribe: vi.fn((_keys, callback) => {
          // Store callback to call later
          setTimeout(() => callback(deepState), 0);
          return { status: 'registered' as const, unsubscribe: vi.fn() };
        }),
        unsubscribe: vi.fn(),
        getCurrentSubscriptionKeys: vi.fn(() => ['*']),
      };

      mockResourceManager.getSubscriptionManager.mockReturnValue(null);
      mockResourceManager.addSubscriptionManager.mockImplementation(() => {
        mockResourceManager.getSubscriptionManager.mockReturnValue(mockSubManager);
      });
      (mockWindowTracker as unknown as { track: Mock }).track.mockReturnValue(true);

      // Create SubscriptionHandler with maxDepth: 3
      const handlerWithMaxDepth = new SubscriptionHandler(
        mockStateManager,
        mockResourceManager as unknown as ResourceManager<AnyState>,
        mockWindowTracker as unknown as WebContentsTracker,
        3,
      );

      // Get the mocked sanitizeState
      const { sanitizeState } = await import('../../../src/utils/serialization.js');
      (sanitizeState as Mock).mockClear();

      // Subscribe
      handlerWithMaxDepth.selectiveSubscribe(mockWebContents, ['*']);

      // Wait for async callback
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Verify sanitizeState was called with maxDepth: 3 for both initial state and update
      expect(sanitizeState).toHaveBeenCalledWith(deepState, { maxDepth: 3 });
    });

    it('should pass serializationMaxDepth to sanitizeState when sending initial state', async () => {
      // Create deep nested state
      const deepState = {
        level1: {
          level2: {
            level3: {
              level4: {
                level5: 'deep',
              },
            },
          },
        },
      };

      mockStateManager.getState = vi.fn(() => deepState);

      const mockWebContents = {
        id: 123,
        isDestroyed: vi.fn(() => false),
        send: vi.fn(),
      } as unknown as WebContents;

      const mockSubManager = {
        subscribe: vi.fn(() => ({ status: 'registered' as const, unsubscribe: vi.fn() })),
        unsubscribe: vi.fn(),
        getCurrentSubscriptionKeys: vi.fn(() => ['*']),
      };

      mockResourceManager.getSubscriptionManager.mockReturnValue(null);
      mockResourceManager.addSubscriptionManager.mockImplementation(() => {
        mockResourceManager.getSubscriptionManager.mockReturnValue(mockSubManager);
      });
      (mockWindowTracker.track as Mock).mockReturnValue(true);

      // Create SubscriptionHandler with maxDepth: 2
      const handlerWithMaxDepth = new SubscriptionHandler(
        mockStateManager,
        mockResourceManager,
        mockWindowTracker,
        2,
      );

      // Get the mocked sanitizeState
      const { sanitizeState } = await import('../../../src/utils/serialization.js');
      (sanitizeState as Mock).mockClear();

      // Subscribe
      handlerWithMaxDepth.selectiveSubscribe(mockWebContents, ['*']);

      // Verify sanitizeState was called with maxDepth: 2 for initial state
      expect(sanitizeState).toHaveBeenCalledWith(deepState, { maxDepth: 2 });
    });
  });

  describe('deltas-disabled key filtering', () => {
    it('should send selective subscriptions as delta type when deltas are disabled', async () => {
      const fullState = { counter: 42, user: { name: 'Alice' }, secret: 'hidden' };
      const stateManager: StateManager<AnyState> = {
        getState: vi.fn(() => fullState),
        subscribe: vi.fn(),
        processAction: vi.fn(),
      };

      const singleWc = {
        id: 100,
        isDestroyed: vi.fn(() => false),
        send: vi.fn(),
      } as unknown as WebContents;

      let stateCallback: ((state: AnyState) => void) | undefined;
      const mockSubManager = {
        subscribe: vi.fn((_keys: unknown, cb: (state: AnyState) => void) => {
          stateCallback = cb;
          return { status: 'registered' as const, unsubscribe: vi.fn() };
        }),
        unsubscribe: vi.fn(),
        getCurrentSubscriptionKeys: vi.fn(() => []),
      };

      // Return the mock directly so selectiveSubscribe uses it (not a real SubscriptionManager)
      mockResourceManager.getSubscriptionManager.mockReturnValue(mockSubManager);

      // Create handler with deltas disabled
      const handler = new SubscriptionHandler(
        stateManager,
        mockResourceManager as unknown as ResourceManager<AnyState>,
        mockWindowTracker as unknown as WebContentsTracker,
        undefined,
        { enabled: false },
      );

      handler.selectiveSubscribe(singleWc, ['counter']);

      // Simulate a state update via the subscription callback
      if (!stateCallback) throw new Error('stateCallback was not captured');
      (safelySendToWindow as Mock).mockClear();
      stateCallback(fullState);

      await new Promise((resolve) => setTimeout(resolve, 10));

      // Selective subscriptions with deltas disabled should send as 'delta' type
      // so the renderer merges into cachedState rather than replacing it
      type SendPayload = {
        delta: {
          type: string;
          changed?: Record<string, unknown>;
          fullState?: Record<string, unknown>;
        };
      };
      const sendCalls = (safelySendToWindow as Mock).mock.calls as unknown[][];
      const deltaSend = sendCalls.find((call) => (call[2] as SendPayload).delta.type === 'delta');
      expect(deltaSend).toBeDefined();
      const changed = (deltaSend?.[2] as SendPayload | undefined)?.delta.changed;
      expect(changed).toHaveProperty('counter');
      expect(changed).not.toHaveProperty('user');
      expect(changed).not.toHaveProperty('secret');
    });

    it('should send full subscription as full type when deltas are disabled', async () => {
      const fullState = { counter: 42, user: { name: 'Alice' } };
      const stateManager: StateManager<AnyState> = {
        getState: vi.fn(() => fullState),
        subscribe: vi.fn(),
        processAction: vi.fn(),
      };

      const singleWc = {
        id: 101,
        isDestroyed: vi.fn(() => false),
        send: vi.fn(),
      } as unknown as WebContents;

      let stateCallback: ((state: AnyState) => void) | undefined;
      const mockSubManager = {
        subscribe: vi.fn((_keys: unknown, cb: (state: AnyState) => void) => {
          stateCallback = cb;
          return { status: 'registered' as const, unsubscribe: vi.fn() };
        }),
        unsubscribe: vi.fn(),
        getCurrentSubscriptionKeys: vi.fn(() => []),
      };

      mockResourceManager.getSubscriptionManager.mockReturnValue(mockSubManager);

      // Create handler with deltas disabled, no keys (full subscription)
      const handler = new SubscriptionHandler(
        stateManager,
        mockResourceManager as unknown as ResourceManager<AnyState>,
        mockWindowTracker as unknown as WebContentsTracker,
        undefined,
        { enabled: false },
      );

      handler.selectiveSubscribe(singleWc);

      if (!stateCallback) throw new Error('stateCallback was not captured');
      (safelySendToWindow as Mock).mockClear();
      stateCallback(fullState);

      await new Promise((resolve) => setTimeout(resolve, 10));

      // Full subscription should still send as 'full' type
      type SendPayload = { delta: { type: string; fullState?: Record<string, unknown> } };
      const sendCalls = (safelySendToWindow as Mock).mock.calls as unknown[][];
      const fullSend = sendCalls.find((call) => (call[2] as SendPayload).delta.type === 'full');
      expect(fullSend).toBeDefined();
      const sentFullState = (fullSend?.[2] as SendPayload | undefined)?.delta.fullState;
      expect(sentFullState).toHaveProperty('counter');
      expect(sentFullState).toHaveProperty('user');
    });

    it('should not send when all sanitized values are empty with deltas disabled', async () => {
      // sanitizeState is mocked as identity, so simulate empty sanitized result
      // by having state with only function values (which getPartialState returns,
      // but sanitizeState would normally strip)
      const { sanitizeState } = await import('../../../src/utils/serialization.js');
      // Make sanitizeState return empty object to simulate all values stripped
      (sanitizeState as Mock).mockReturnValueOnce({});

      const fullState = { cb: () => 'fn' };
      const stateManager: StateManager<AnyState> = {
        getState: vi.fn(() => fullState),
        subscribe: vi.fn(),
        processAction: vi.fn(),
      };

      const singleWc = {
        id: 102,
        isDestroyed: vi.fn(() => false),
        send: vi.fn(),
      } as unknown as WebContents;

      let stateCallback: ((state: AnyState) => void) | undefined;
      const mockSubManager = {
        subscribe: vi.fn((_keys: unknown, cb: (state: AnyState) => void) => {
          stateCallback = cb;
          return vi.fn();
        }),
        unsubscribe: vi.fn(),
        getCurrentSubscriptionKeys: vi.fn(() => []),
      };

      mockResourceManager.getSubscriptionManager.mockReturnValue(mockSubManager);

      const handler = new SubscriptionHandler(
        stateManager,
        mockResourceManager as unknown as ResourceManager<AnyState>,
        mockWindowTracker as unknown as WebContentsTracker,
        undefined,
        { enabled: false },
      );

      handler.selectiveSubscribe(singleWc);

      if (!stateCallback) throw new Error('stateCallback was not captured');
      (safelySendToWindow as Mock).mockClear();
      // Make sanitizeState return empty for the update too
      (sanitizeState as Mock).mockReturnValueOnce({});
      stateCallback(fullState);

      await new Promise((resolve) => setTimeout(resolve, 10));

      // Should not send — prevents tracking a thunk that never gets ACKed
      expect(safelySendToWindow).not.toHaveBeenCalled();
    });
  });

  describe('normalizedKeys for initial delta', () => {
    it('should use normalized keys for the initial delta payload', () => {
      const fullState = { counter: 42, user: { name: 'Alice' } };
      const stateManager: StateManager<AnyState> = {
        getState: vi.fn(() => fullState),
        subscribe: vi.fn(),
        processAction: vi.fn(),
      };

      const singleWc = {
        id: 200,
        isDestroyed: vi.fn(() => false),
        send: vi.fn(),
      } as unknown as WebContents;

      const mockSubManager = {
        subscribe: vi.fn(() => ({ status: 'registered' as const, unsubscribe: vi.fn() })),
        unsubscribe: vi.fn(),
        getCurrentSubscriptionKeys: vi.fn(() => []),
      };

      mockResourceManager.getSubscriptionManager.mockReturnValue(null);
      mockResourceManager.addSubscriptionManager.mockImplementation(() => {
        mockResourceManager.getSubscriptionManager.mockReturnValue(mockSubManager);
      });

      const handler = new SubscriptionHandler(
        stateManager,
        mockResourceManager as unknown as ResourceManager<AnyState>,
        mockWindowTracker as unknown as WebContentsTracker,
      );

      // Subscribe with untrimmed and duplicate keys
      (safelySendToWindow as Mock).mockClear();
      handler.selectiveSubscribe(singleWc, [' counter ', 'counter']);

      // The initial delta should use the normalized key 'counter' (trimmed, deduped)
      type DeltaPayload = { delta: { type: string; changed?: Record<string, unknown> } };
      const sendCalls = (safelySendToWindow as Mock).mock.calls as unknown[][];
      const deltaSend = sendCalls.find((call) => (call[2] as DeltaPayload).delta.type === 'delta');
      expect(deltaSend).toBeDefined();
      const changed = (deltaSend?.[2] as DeltaPayload | undefined)?.delta.changed;
      expect(changed).toHaveProperty('counter', 42);
      // Should not have the untrimmed key
      expect(changed).not.toHaveProperty(' counter ');
    });

    it('should find state values when all keys have whitespace', () => {
      const fullState = { counter: 42, user: { name: 'Alice' } };
      const stateManager: StateManager<AnyState> = {
        getState: vi.fn(() => fullState),
        subscribe: vi.fn(),
        processAction: vi.fn(),
      };

      const singleWc = {
        id: 201,
        isDestroyed: vi.fn(() => false),
        send: vi.fn(),
      } as unknown as WebContents;

      const mockSubManager = {
        subscribe: vi.fn(() => ({ status: 'registered' as const, unsubscribe: vi.fn() })),
        unsubscribe: vi.fn(),
        getCurrentSubscriptionKeys: vi.fn(() => []),
      };

      mockResourceManager.getSubscriptionManager.mockReturnValue(null);
      mockResourceManager.addSubscriptionManager.mockImplementation(() => {
        mockResourceManager.getSubscriptionManager.mockReturnValue(mockSubManager);
      });

      const handler = new SubscriptionHandler(
        stateManager,
        mockResourceManager as unknown as ResourceManager<AnyState>,
        mockWindowTracker as unknown as WebContentsTracker,
      );

      // Subscribe with only whitespace-padded keys — before the fix,
      // getPartialState used raw keys so ' counter ' wouldn't match 'counter'
      (safelySendToWindow as Mock).mockClear();
      handler.selectiveSubscribe(singleWc, [' counter ']);

      type DeltaPayload = { delta: { type: string; changed?: Record<string, unknown> } };
      const sendCalls = (safelySendToWindow as Mock).mock.calls as unknown[][];
      const deltaSend = sendCalls.find((call) => (call[2] as DeltaPayload).delta.type === 'delta');
      expect(deltaSend).toBeDefined();
      const changed = (deltaSend?.[2] as DeltaPayload | undefined)?.delta.changed;
      // Should find the value using normalized key 'counter'
      expect(changed).toHaveProperty('counter', 42);
    });

    it('should omit undefined-valued keys from full-subscription initial delta', () => {
      const fullState = { counter: 42, removed: undefined, active: true };
      const stateManager: StateManager<AnyState> = {
        getState: vi.fn(() => fullState),
        subscribe: vi.fn(),
        processAction: vi.fn(),
      };

      const singleWc = {
        id: 202,
        isDestroyed: vi.fn(() => false),
        send: vi.fn(),
      } as unknown as WebContents;

      const mockSubManager = {
        subscribe: vi.fn(() => ({ status: 'registered' as const, unsubscribe: vi.fn() })),
        unsubscribe: vi.fn(),
        getCurrentSubscriptionKeys: vi.fn(() => []),
      };

      mockResourceManager.getSubscriptionManager.mockReturnValue(null);
      mockResourceManager.addSubscriptionManager.mockImplementation(() => {
        mockResourceManager.getSubscriptionManager.mockReturnValue(mockSubManager);
      });

      const handler = new SubscriptionHandler(
        stateManager,
        mockResourceManager as unknown as ResourceManager<AnyState>,
        mockWindowTracker as unknown as WebContentsTracker,
      );

      // Full subscription (no keys = all state)
      (safelySendToWindow as Mock).mockClear();
      handler.selectiveSubscribe(singleWc);

      type DeltaPayload = { delta: { type: string; changed?: Record<string, unknown> } };
      const sendCalls = (safelySendToWindow as Mock).mock.calls as unknown[][];
      const deltaSend = sendCalls.find((call) => (call[2] as DeltaPayload).delta.type === 'delta');
      expect(deltaSend).toBeDefined();
      const changed = (deltaSend?.[2] as DeltaPayload | undefined)?.delta.changed;

      // Should include defined values
      expect(changed).toHaveProperty('counter', 42);
      expect(changed).toHaveProperty('active', true);
      // Should NOT include the undefined-valued key — matching selective subscription behaviour
      expect(changed).not.toHaveProperty('removed');
    });
  });

  describe('integration: multi-subscription and lifecycle', () => {
    /**
     * Helper that wires up a real-storage ResourceManager mock so that
     * SubscriptionManagers created by selectiveSubscribe are stored and
     * retrievable — enabling full notify() → IPC lifecycle tests.
     */
    function createStoringResourceManager() {
      const subManagers = new Map<number, unknown>();
      const destroyListeners = new Set<number>();
      return {
        mock: {
          getSubscriptionManager: vi.fn((id: number) => subManagers.get(id) ?? null),
          addSubscriptionManager: vi.fn((id: number, mgr: unknown) => {
            subManagers.set(id, mgr);
          }),
          removeSubscriptionManager: vi.fn((id: number) => {
            subManagers.delete(id);
          }),
          hasDestroyListener: vi.fn((id: number) => destroyListeners.has(id)),
          addDestroyListener: vi.fn((id: number) => {
            destroyListeners.add(id);
          }),
          getMiddlewareCallbacks: vi.fn(() => ({})),
          setMiddlewareCallbacks: vi.fn(),
          clearAll: vi.fn(),
        } as unknown as ResourceManager<AnyState>,
        subManagers,
      };
    }

    it('should handle multiple selective subscriptions on the same window without overwriting', () => {
      const fullState = { counter: 10, user: { name: 'Alice' }, theme: 'dark' };
      const stateManager: StateManager<AnyState> = {
        getState: vi.fn(() => fullState),
        subscribe: vi.fn(),
        processAction: vi.fn(),
      };

      const wc = {
        id: 500,
        isDestroyed: vi.fn(() => false),
        send: vi.fn(),
      } as unknown as WebContents;

      const { mock: rm } = createStoringResourceManager();

      const handler = new SubscriptionHandler(
        stateManager,
        rm,
        mockWindowTracker as unknown as WebContentsTracker,
      );

      (safelySendToWindow as Mock).mockClear();

      // First subscription: counter
      handler.selectiveSubscribe(wc, ['counter']);
      // Second subscription: user
      handler.selectiveSubscribe(wc, ['user']);

      // Both initial deltas should have been sent
      type DeltaPayload = { delta: { type: string; changed?: Record<string, unknown> } };
      const sendCalls = (safelySendToWindow as Mock).mock.calls as unknown[][];
      const deltas = sendCalls
        .filter((call) => (call[2] as DeltaPayload).delta.type === 'delta')
        .map((call) => (call[2] as DeltaPayload).delta.changed);

      // Should have initial deltas for both subscriptions
      expect(deltas.length).toBeGreaterThanOrEqual(2);

      // One delta should contain counter, another should contain user
      const hasCounter = deltas.some((d) => d && 'counter' in d);
      const hasUser = deltas.some((d) => d && 'user' in d);
      expect(hasCounter).toBe(true);
      expect(hasUser).toBe(true);

      // Neither should leak the theme key (not subscribed)
      const leaksTheme = deltas.some((d) => d && 'theme' in d);
      expect(leaksTheme).toBe(false);
    });

    it('should propagate state changes to both subscriptions on the same window', () => {
      const fullState = { counter: 10, user: { name: 'Alice' }, theme: 'dark' };
      const stateManager: StateManager<AnyState> = {
        getState: vi.fn(() => fullState),
        subscribe: vi.fn(),
        processAction: vi.fn(),
      };

      const wc = {
        id: 510,
        isDestroyed: vi.fn(() => false),
        send: vi.fn(),
      } as unknown as WebContents;

      const { mock: rm, subManagers } = createStoringResourceManager();

      const handler = new SubscriptionHandler(
        stateManager,
        rm,
        mockWindowTracker as unknown as WebContentsTracker,
      );

      // Subscribe to counter, then to user — two independent subscriptions
      handler.selectiveSubscribe(wc, ['counter']);
      handler.selectiveSubscribe(wc, ['user']);

      (safelySendToWindow as Mock).mockClear();

      // Trigger a counter-only state change (user unchanged)
      const subMgr = subManagers.get(510) as SubscriptionManager<AnyState>;
      const newState = { counter: 42, user: { name: 'Alice' }, theme: 'dark' };
      subMgr.notify(fullState, newState);

      type DeltaPayload = {
        delta: { type: string; changed?: Record<string, unknown>; removed?: string[] };
      };
      const sendCalls = (safelySendToWindow as Mock).mock.calls as unknown[][];

      // The counter subscription must fire — the user subscription should not
      const counterUpdate = sendCalls.find((call) => {
        const d = (call[2] as DeltaPayload).delta?.changed;
        return d && 'counter' in d;
      });
      expect(counterUpdate).toBeDefined();

      // The user subscription should NOT fire (user didn't change)
      const userUpdate = sendCalls.find((call) => {
        const d = (call[2] as DeltaPayload).delta?.changed;
        return d && 'user' in d;
      });
      expect(userUpdate).toBeUndefined();
    });

    it('should send deltas with only changed subscribed keys on state update', () => {
      const initialState = { counter: 1, user: { name: 'Alice' }, unrelated: 'foo' };
      const stateManager: StateManager<AnyState> = {
        getState: vi.fn(() => initialState),
        subscribe: vi.fn(),
        processAction: vi.fn(),
      };

      const wc = {
        id: 501,
        isDestroyed: vi.fn(() => false),
        send: vi.fn(),
      } as unknown as WebContents;

      const { mock: rm, subManagers } = createStoringResourceManager();

      // Deltas enabled (default)
      const handler = new SubscriptionHandler(
        stateManager,
        rm,
        mockWindowTracker as unknown as WebContentsTracker,
      );

      handler.selectiveSubscribe(wc, ['counter']);

      // Clear sends from initial subscription
      (safelySendToWindow as Mock).mockClear();

      // Simulate a state change via the real SubscriptionManager's notify()
      const subMgr = subManagers.get(501) as SubscriptionManager<AnyState>;

      const updatedState = { counter: 5, user: { name: 'Alice' }, unrelated: 'bar' };
      (subMgr as InstanceType<typeof SubscriptionManager>).notify(initialState, updatedState);

      type DeltaPayload = {
        delta: { type: string; changed?: Record<string, unknown>; removed?: string[] };
        seq: number;
      };
      const sendCalls = (safelySendToWindow as Mock).mock.calls as unknown[][];
      expect(sendCalls.length).toBe(1);

      const payload = sendCalls[0][2] as DeltaPayload;
      expect(payload.delta.type).toBe('delta');
      expect(payload.delta.changed).toHaveProperty('counter', 5);
      // Should NOT include unrelated keys even though they changed
      expect(payload.delta.changed).not.toHaveProperty('unrelated');
      expect(payload.delta.changed).not.toHaveProperty('user');
    });

    it('should include removed keys in delta when subscribed key is deleted', () => {
      const initialState = { counter: 1, optional: 'exists' };
      const stateManager: StateManager<AnyState> = {
        getState: vi.fn(() => initialState),
        subscribe: vi.fn(),
        processAction: vi.fn(),
      };

      const wc = {
        id: 502,
        isDestroyed: vi.fn(() => false),
        send: vi.fn(),
      } as unknown as WebContents;

      const { mock: rm, subManagers } = createStoringResourceManager();

      const handler = new SubscriptionHandler(
        stateManager,
        rm,
        mockWindowTracker as unknown as WebContentsTracker,
      );

      handler.selectiveSubscribe(wc, ['counter', 'optional']);
      (safelySendToWindow as Mock).mockClear();

      const subMgr = subManagers.get(502) as SubscriptionManager<AnyState>;

      // State update where 'optional' is removed
      const updatedState = { counter: 2 };
      subMgr.notify(initialState, updatedState);

      type DeltaPayload = {
        delta: { type: string; changed?: Record<string, unknown>; removed?: string[] };
      };
      const sendCalls = (safelySendToWindow as Mock).mock.calls as unknown[][];
      expect(sendCalls.length).toBe(1);

      const payload = sendCalls[0][2] as DeltaPayload;
      expect(payload.delta.type).toBe('delta');
      expect(payload.delta.changed).toHaveProperty('counter', 2);
      expect(payload.delta.removed).toContain('optional');
    });

    it('should send removed delta when all subscribed keys are deleted (deltas enabled)', () => {
      const initialState = { session: { token: 'abc' }, counter: 1 };
      const stateManager: StateManager<AnyState> = {
        getState: vi.fn(() => initialState),
        subscribe: vi.fn(),
        processAction: vi.fn(),
      };

      const wc = {
        id: 520,
        isDestroyed: vi.fn(() => false),
        send: vi.fn(),
      } as unknown as WebContents;

      const { mock: rm, subManagers } = createStoringResourceManager();

      // Deltas enabled (default)
      const handler = new SubscriptionHandler(
        stateManager,
        rm,
        mockWindowTracker as unknown as WebContentsTracker,
      );

      handler.selectiveSubscribe(wc, ['session.token']);
      (safelySendToWindow as Mock).mockClear();

      const subMgr = subManagers.get(520) as SubscriptionManager<AnyState>;

      // Delete session.token — all subscribed keys removed
      const updatedState = { session: {}, counter: 1 };
      subMgr.notify(initialState, updatedState);

      type DeltaPayload = {
        delta: { type: string; changed?: Record<string, unknown>; removed?: string[] };
      };
      const sendCalls = (safelySendToWindow as Mock).mock.calls as unknown[][];
      expect(sendCalls.length).toBe(1);

      const payload = sendCalls[0][2] as DeltaPayload;
      expect(payload.delta.type).toBe('delta');
      expect(payload.delta.removed).toContain('session.token');
      // No changed keys — the only subscribed key was removed
      expect(payload.delta.changed).toBeUndefined();
    });

    it('should send removed delta when subscribed key is deleted (deltas disabled)', () => {
      const initialState = { session: { token: 'abc' }, counter: 1 };
      const stateManager: StateManager<AnyState> = {
        getState: vi.fn(() => initialState),
        subscribe: vi.fn(),
        processAction: vi.fn(),
      };

      const wc = {
        id: 521,
        isDestroyed: vi.fn(() => false),
        send: vi.fn(),
      } as unknown as WebContents;

      const { mock: rm, subManagers } = createStoringResourceManager();

      // Deltas disabled
      const handler = new SubscriptionHandler(
        stateManager,
        rm,
        mockWindowTracker as unknown as WebContentsTracker,
        undefined,
        { enabled: false },
      );

      handler.selectiveSubscribe(wc, ['session.token']);
      (safelySendToWindow as Mock).mockClear();

      const subMgr = subManagers.get(521) as SubscriptionManager<AnyState>;

      // Delete session.token
      const updatedState = { session: {}, counter: 1 };
      subMgr.notify(initialState, updatedState);

      type DeltaPayload = {
        delta: { type: string; changed?: Record<string, unknown>; removed?: string[] };
      };
      const sendCalls = (safelySendToWindow as Mock).mock.calls as unknown[][];
      expect(sendCalls.length).toBe(1);

      const payload = sendCalls[0][2] as DeltaPayload;
      expect(payload.delta.type).toBe('delta');
      expect(payload.delta.removed).toContain('session.token');
    });

    it('should not produce spurious removed entry for non-serializable values (deltas disabled)', async () => {
      const { sanitizeState } = await import('../../../src/utils/serialization.js');
      // Make sanitizeState strip functions (like the real implementation)
      (sanitizeState as Mock).mockImplementation((state: Record<string, unknown>) => {
        const result: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(state)) {
          if (typeof v !== 'function') result[k] = v;
        }
        return result;
      });

      const initialState = { counter: 1, onUpdate: () => {} };
      const stateManager: StateManager<AnyState> = {
        getState: vi.fn(() => initialState),
        subscribe: vi.fn(),
        processAction: vi.fn(),
      };

      const wc = {
        id: 522,
        isDestroyed: vi.fn(() => false),
        send: vi.fn(),
      } as unknown as WebContents;

      const { mock: rm, subManagers } = createStoringResourceManager();

      // Deltas disabled
      const handler = new SubscriptionHandler(
        stateManager,
        rm,
        mockWindowTracker as unknown as WebContentsTracker,
        undefined,
        { enabled: false },
      );

      handler.selectiveSubscribe(wc, ['counter', 'onUpdate']);
      (safelySendToWindow as Mock).mockClear();

      const subMgr = subManagers.get(522) as SubscriptionManager<AnyState>;

      // State change: counter changes, onUpdate is still a function.
      // Without the fix, subscriptionPrevState (sanitized, no onUpdate key) vs
      // raw state (has onUpdate as function) would mismatch — but since the
      // removal check compares sanitized-to-sanitized, onUpdate is absent in
      // both prev and next, so no spurious "removed" entry.
      const updatedState = { counter: 2, onUpdate: () => {} };
      subMgr.notify(initialState, updatedState);

      type DeltaPayload = {
        delta: { type: string; changed?: Record<string, unknown>; removed?: string[] };
      };
      const sendCalls = (safelySendToWindow as Mock).mock.calls as unknown[][];
      expect(sendCalls.length).toBe(1);

      const payload = sendCalls[0][2] as DeltaPayload;
      expect(payload.delta.changed).toHaveProperty('counter', 2);
      // onUpdate should NOT appear as removed — it was never serializable
      expect(payload.delta.removed).toBeUndefined();

      // Restore identity mock
      (sanitizeState as Mock).mockImplementation((s: unknown) => s);
    });

    it('should increment sequence numbers across multiple sends to the same window', () => {
      const initialState = { counter: 0 };
      const stateManager: StateManager<AnyState> = {
        getState: vi.fn(() => initialState),
        subscribe: vi.fn(),
        processAction: vi.fn(),
      };

      const wc = {
        id: 503,
        isDestroyed: vi.fn(() => false),
        send: vi.fn(),
      } as unknown as WebContents;

      const { mock: rm, subManagers } = createStoringResourceManager();

      const handler = new SubscriptionHandler(
        stateManager,
        rm,
        mockWindowTracker as unknown as WebContentsTracker,
      );

      (safelySendToWindow as Mock).mockClear();
      handler.selectiveSubscribe(wc, ['counter']);

      const subMgr = subManagers.get(503) as SubscriptionManager<AnyState>;

      // Send two more updates
      subMgr.notify(initialState, { counter: 1 });
      subMgr.notify({ counter: 1 }, { counter: 2 });

      type SeqPayload = { seq: number };
      const sendCalls = (safelySendToWindow as Mock).mock.calls as unknown[][];

      // Initial send + 2 updates = 3 sends total
      expect(sendCalls.length).toBe(3);

      const seqs = sendCalls.map((call) => (call[2] as SeqPayload).seq);
      // Sequence numbers should be strictly increasing: 1, 2, 3
      expect(seqs).toEqual([1, 2, 3]);
    });

    it('should handle deep key path subscriptions', () => {
      const initialState = {
        user: { profile: { theme: 'light', name: 'Alice' }, age: 30 },
        counter: 0,
      };
      const stateManager: StateManager<AnyState> = {
        getState: vi.fn(() => initialState),
        subscribe: vi.fn(),
        processAction: vi.fn(),
      };

      const wc = {
        id: 504,
        isDestroyed: vi.fn(() => false),
        send: vi.fn(),
      } as unknown as WebContents;

      const { mock: rm, subManagers } = createStoringResourceManager();

      const handler = new SubscriptionHandler(
        stateManager,
        rm,
        mockWindowTracker as unknown as WebContentsTracker,
      );

      (safelySendToWindow as Mock).mockClear();
      handler.selectiveSubscribe(wc, ['user.profile.theme']);

      // Check the initial delta contains the deep key
      type DeltaPayload = { delta: { type: string; changed?: Record<string, unknown> } };
      let sendCalls = (safelySendToWindow as Mock).mock.calls as unknown[][];
      expect(sendCalls.length).toBe(1);
      const initialPayload = sendCalls[0][2] as DeltaPayload;
      expect(initialPayload.delta.changed).toHaveProperty('user.profile.theme', 'light');
      // Should NOT leak sibling or parent keys
      expect(initialPayload.delta.changed).not.toHaveProperty('user.profile.name');
      expect(initialPayload.delta.changed).not.toHaveProperty('user.age');
      expect(initialPayload.delta.changed).not.toHaveProperty('counter');

      // Now simulate a state update that changes the deep key
      (safelySendToWindow as Mock).mockClear();
      const subMgr = subManagers.get(504) as SubscriptionManager<AnyState>;

      const updatedState = {
        user: { profile: { theme: 'dark', name: 'Alice' }, age: 30 },
        counter: 0,
      };
      subMgr.notify(initialState, updatedState);

      sendCalls = (safelySendToWindow as Mock).mock.calls as unknown[][];
      expect(sendCalls.length).toBe(1);
      const updatePayload = sendCalls[0][2] as DeltaPayload;
      expect(updatePayload.delta.changed).toHaveProperty('user.profile.theme', 'dark');
      expect(updatePayload.delta.changed).not.toHaveProperty('user.profile.name');
    });

    it('should skip delta when subscribed keys have not changed', () => {
      const initialState = { counter: 1, other: 'a' };
      const stateManager: StateManager<AnyState> = {
        getState: vi.fn(() => initialState),
        subscribe: vi.fn(),
        processAction: vi.fn(),
      };

      const wc = {
        id: 505,
        isDestroyed: vi.fn(() => false),
        send: vi.fn(),
      } as unknown as WebContents;

      const { mock: rm, subManagers } = createStoringResourceManager();

      const handler = new SubscriptionHandler(
        stateManager,
        rm,
        mockWindowTracker as unknown as WebContentsTracker,
      );

      handler.selectiveSubscribe(wc, ['counter']);
      (safelySendToWindow as Mock).mockClear();

      const subMgr = subManagers.get(505) as SubscriptionManager<AnyState>;

      // Change only 'other', which is not subscribed — SubscriptionManager will
      // not call the callback at all since hasRelevantChange returns false for 'counter'
      const updatedState = { counter: 1, other: 'b' };
      subMgr.notify(initialState, updatedState);

      // No IPC send should have occurred
      expect(safelySendToWindow).not.toHaveBeenCalled();
    });

    it('should reset sequence numbers when closure-based unsubscribe removes all subscriptions', () => {
      const initialState = { counter: 0 };
      const stateManager: StateManager<AnyState> = {
        getState: vi.fn(() => initialState),
        subscribe: vi.fn(),
        processAction: vi.fn(),
      };

      const wc = {
        id: 560,
        isDestroyed: vi.fn(() => false),
        send: vi.fn(),
      } as unknown as WebContents;

      const { mock: rm } = createStoringResourceManager();

      const handler = new SubscriptionHandler(
        stateManager,
        rm,
        mockWindowTracker as unknown as WebContentsTracker,
      );

      // Subscribe → initial delta sent with seq=1
      const sub = handler.selectiveSubscribe(wc, ['counter']);

      type SeqPayload = { seq: number };
      let sendCalls = (safelySendToWindow as Mock).mock.calls as unknown[][];
      expect((sendCalls[sendCalls.length - 1][2] as SeqPayload).seq).toBe(1);

      // Unsubscribe via closure — should reset windowSeqs
      sub.unsubscribe();

      // Resubscribe — initial delta should start at seq=1 again, not seq=2
      (safelySendToWindow as Mock).mockClear();
      handler.selectiveSubscribe(wc, ['counter']);

      sendCalls = (safelySendToWindow as Mock).mock.calls as unknown[][];
      expect(sendCalls.length).toBe(1);
      expect((sendCalls[0][2] as SeqPayload).seq).toBe(1);
    });

    it('should maintain independent sequence numbers per window', () => {
      const initialState = { counter: 0 };
      const stateManager: StateManager<AnyState> = {
        getState: vi.fn(() => initialState),
        subscribe: vi.fn(),
        processAction: vi.fn(),
      };

      const wc1 = {
        id: 601,
        isDestroyed: vi.fn(() => false),
        send: vi.fn(),
      } as unknown as WebContents;
      const wc2 = {
        id: 602,
        isDestroyed: vi.fn(() => false),
        send: vi.fn(),
      } as unknown as WebContents;

      const { mock: rm, subManagers } = createStoringResourceManager();

      const handler = new SubscriptionHandler(
        stateManager,
        rm,
        mockWindowTracker as unknown as WebContentsTracker,
      );

      (safelySendToWindow as Mock).mockClear();
      handler.selectiveSubscribe(wc1, ['counter']);
      handler.selectiveSubscribe(wc2, ['counter']);

      // Both windows get initial state — seq 1 each
      type SeqPayload = { seq: number };
      const sendCalls = (safelySendToWindow as Mock).mock.calls as unknown[][];
      const wc1Seqs = sendCalls
        .filter((call) => call[0] === wc1)
        .map((call) => (call[2] as SeqPayload).seq);
      const wc2Seqs = sendCalls
        .filter((call) => call[0] === wc2)
        .map((call) => (call[2] as SeqPayload).seq);

      // Both should start at seq 1
      expect(wc1Seqs).toEqual([1]);
      expect(wc2Seqs).toEqual([1]);

      // Now send an update only to wc1's subscription manager
      (safelySendToWindow as Mock).mockClear();
      // Both windows share the same SubscriptionManager since they're subscribed
      // via separate selectiveSubscribe calls, but let's notify via wc1's manager
      const subMgr1 = subManagers.get(601) as SubscriptionManager<AnyState>;
      subMgr1.notify(initialState, { counter: 1 });

      const newCalls = (safelySendToWindow as Mock).mock.calls as unknown[][];
      const wc1NewSeqs = newCalls
        .filter((call) => call[0] === wc1)
        .map((call) => (call[2] as SeqPayload).seq);

      // wc1 should be at seq 2 now
      expect(wc1NewSeqs).toEqual([2]);
    });

    it('should not untrack window when unsubscribing one subscription while another remains', () => {
      const fullState = { counter: 10, user: { name: 'Alice' }, theme: 'dark' };
      const stateManager: StateManager<AnyState> = {
        getState: vi.fn(() => fullState),
        subscribe: vi.fn(),
        processAction: vi.fn(),
      };

      const wc = {
        id: 530,
        isDestroyed: vi.fn(() => false),
        send: vi.fn(),
      } as unknown as WebContents;

      const { mock: rm, subManagers } = createStoringResourceManager();

      const tracker = {
        getActiveWebContents: vi.fn(() => []),
        track: vi.fn(() => true),
        untrack: vi.fn(),
        cleanup: vi.fn(),
      } as unknown as WebContentsTracker;

      const handler = new SubscriptionHandler(stateManager, rm, tracker);

      // Two independent subscriptions on the same window
      const sub1 = handler.selectiveSubscribe(wc, ['counter']);
      handler.selectiveSubscribe(wc, ['user']);

      // Unsubscribe the first subscription
      sub1.unsubscribe();

      // The window should NOT be untracked — the 'user' subscription still exists
      expect(tracker.untrack as Mock).not.toHaveBeenCalled();

      // Verify the remaining subscription still works
      (safelySendToWindow as Mock).mockClear();
      const subMgr = subManagers.get(530) as SubscriptionManager<AnyState>;
      const updatedState = { counter: 10, user: { name: 'Bob' }, theme: 'dark' };
      subMgr.notify(fullState, updatedState);

      type DeltaPayload = {
        delta: { type: string; changed?: Record<string, unknown> };
      };
      const sendCalls = (safelySendToWindow as Mock).mock.calls as unknown[][];
      const userUpdate = sendCalls.find((call) => {
        const d = (call[2] as DeltaPayload).delta?.changed;
        return d && 'user' in d;
      });
      expect(userUpdate).toBeDefined();
    });

    it('should skip initial-state send when subscription is superseded by existing "*"', () => {
      const fullState = { counter: 10, user: { name: 'Alice' }, theme: 'dark' };
      const stateManager: StateManager<AnyState> = {
        getState: vi.fn(() => fullState),
        subscribe: vi.fn(),
        processAction: vi.fn(),
      };

      const wc = {
        id: 550,
        isDestroyed: vi.fn(() => false),
        send: vi.fn(),
      } as unknown as WebContents;

      const { mock: rm } = createStoringResourceManager();

      const handler = new SubscriptionHandler(
        stateManager,
        rm,
        mockWindowTracker as unknown as WebContentsTracker,
      );

      // First subscribe to all state
      handler.selectiveSubscribe(wc, undefined);
      (safelySendToWindow as Mock).mockClear();

      // Then subscribe to specific keys — superseded by '*'.
      // No initial-state send: the existing '*' subscription already delivers
      // state, and sending would consume a seq number on a dead path.
      handler.selectiveSubscribe(wc, ['user']);

      expect(safelySendToWindow).not.toHaveBeenCalled();
    });

    it('should not register a subscription entry for empty-key subscriptions', () => {
      const fullState = { counter: 10, user: { name: 'Alice' } };
      const stateManager: StateManager<AnyState> = {
        getState: vi.fn(() => fullState),
        subscribe: vi.fn(),
        processAction: vi.fn(),
      };

      const wc = {
        id: 540,
        isDestroyed: vi.fn(() => false),
        send: vi.fn(),
      } as unknown as WebContents;

      const { mock: rm, subManagers } = createStoringResourceManager();

      const handler = new SubscriptionHandler(
        stateManager,
        rm,
        mockWindowTracker as unknown as WebContentsTracker,
      );

      // First subscribe to 'counter'
      handler.selectiveSubscribe(wc, ['counter']);

      // Then subscribe with empty keys — should be a no-op, must NOT delete 'counter'
      handler.selectiveSubscribe(wc, []);

      const subMgr = subManagers.get(540) as SubscriptionManager<AnyState>;
      const keys = subMgr.getCurrentSubscriptionKeys(540);
      expect(keys).toContain('counter');

      // The empty-key subscription should not send any IPC messages
      (safelySendToWindow as Mock).mockClear();
      const updatedState = { counter: 42, user: { name: 'Alice' } };
      subMgr.notify(fullState, updatedState);

      // Only the 'counter' subscription should fire
      type DeltaPayload = { delta: { changed?: Record<string, unknown> } };
      const sendCalls = (safelySendToWindow as Mock).mock.calls as unknown[][];
      expect(sendCalls.length).toBe(1);
      expect((sendCalls[0][2] as DeltaPayload).delta.changed).toHaveProperty('counter', 42);
    });

    it('should send selective updates as delta type when deltas are disabled to preserve sibling state', () => {
      const initialState = { counter: 1, user: { name: 'Alice' }, theme: 'dark' };
      const stateManager: StateManager<AnyState> = {
        getState: vi.fn(() => initialState),
        subscribe: vi.fn(),
        processAction: vi.fn(),
      };

      const wc = {
        id: 700,
        isDestroyed: vi.fn(() => false),
        send: vi.fn(),
      } as unknown as WebContents;

      const { mock: rm, subManagers } = createStoringResourceManager();

      // Deltas disabled
      const handler = new SubscriptionHandler(
        stateManager,
        rm,
        mockWindowTracker as unknown as WebContentsTracker,
        undefined,
        { enabled: false },
      );

      handler.selectiveSubscribe(wc, ['counter']);
      (safelySendToWindow as Mock).mockClear();

      // Trigger a state update via the real SubscriptionManager's notify()
      const subMgr = subManagers.get(700) as SubscriptionManager<AnyState>;
      const updatedState = { counter: 5, user: { name: 'Bob' }, theme: 'light' };
      subMgr.notify(initialState, updatedState);

      type DeltaPayload = {
        delta: { type: string; changed?: Record<string, unknown>; fullState?: unknown };
      };
      const sendCalls = (safelySendToWindow as Mock).mock.calls as unknown[][];
      expect(sendCalls.length).toBe(1);

      const payload = sendCalls[0][2] as DeltaPayload;
      // Must use type: 'delta' (not 'full') so the renderer merges into
      // cachedState instead of replacing it — preserving sibling subscriptions
      expect(payload.delta.type).toBe('delta');
      expect(payload.delta.changed).toHaveProperty('counter', 5);
      // Must not leak unsubscribed keys
      expect(payload.delta.changed).not.toHaveProperty('user');
      expect(payload.delta.changed).not.toHaveProperty('theme');
    });
  });

  describe('sanitizeDelta per-value sanitization', () => {
    it('should strip function values from delta changed to prevent DataCloneError', async () => {
      const initialState = { counter: 1, callback: () => 'initial' };
      const updatedState = { counter: 2, callback: () => 'updated' };

      const stateManager: StateManager<AnyState> = {
        getState: vi.fn(() => initialState),
        subscribe: vi.fn(),
        processAction: vi.fn(),
      };

      const singleWc = {
        id: 400,
        isDestroyed: vi.fn(() => false),
        send: vi.fn(),
      } as unknown as WebContents;

      let stateCallback: ((state: AnyState) => void) | undefined;
      const mockSubManager = {
        subscribe: vi.fn((_keys: unknown, cb: (state: AnyState) => void) => {
          stateCallback = cb;
          return vi.fn();
        }),
        unsubscribe: vi.fn(),
        getCurrentSubscriptionKeys: vi.fn(() => []),
      };

      mockResourceManager.getSubscriptionManager.mockReturnValue(mockSubManager);

      const handler = new SubscriptionHandler(
        stateManager,
        mockResourceManager as unknown as ResourceManager<AnyState>,
        mockWindowTracker as unknown as WebContentsTracker,
        undefined,
        { enabled: true },
      );

      handler.selectiveSubscribe(singleWc);

      if (!stateCallback) throw new Error('stateCallback was not captured');
      (safelySendToWindow as Mock).mockClear();
      stateCallback(updatedState);

      await new Promise((resolve) => setTimeout(resolve, 10));

      type DeltaPayload = { delta: { type: string; changed?: Record<string, unknown> } };
      const sendCalls = (safelySendToWindow as Mock).mock.calls as unknown[][];
      const deltaSend = sendCalls.find((call) => (call[2] as DeltaPayload).delta.type === 'delta');
      expect(deltaSend).toBeDefined();
      const changed = (deltaSend?.[2] as DeltaPayload | undefined)?.delta.changed;
      // Primitive values should pass through
      expect(changed?.counter).toBe(2);
      // Function values should be stripped (not present in the delta)
      expect(changed).not.toHaveProperty('callback');
    });

    it('should strip Symbol and BigInt values from delta changed to prevent DataCloneError', async () => {
      const sym = Symbol('id');
      const initialState = { counter: 1, tag: sym, big: BigInt(42) };
      const updatedState = { counter: 2, tag: Symbol('id2'), big: BigInt(99) };

      const stateManager: StateManager<AnyState> = {
        getState: vi.fn(() => initialState),
        subscribe: vi.fn(),
        processAction: vi.fn(),
      };

      const singleWc = {
        id: 402,
        isDestroyed: vi.fn(() => false),
        send: vi.fn(),
      } as unknown as WebContents;

      let stateCallback: ((state: AnyState) => void) | undefined;
      const mockSubManager = {
        subscribe: vi.fn((_keys: unknown, cb: (state: AnyState) => void) => {
          stateCallback = cb;
          return vi.fn();
        }),
        unsubscribe: vi.fn(),
        getCurrentSubscriptionKeys: vi.fn(() => []),
      };

      mockResourceManager.getSubscriptionManager.mockReturnValue(mockSubManager);

      const handler = new SubscriptionHandler(
        stateManager,
        mockResourceManager as unknown as ResourceManager<AnyState>,
        mockWindowTracker as unknown as WebContentsTracker,
        undefined,
        { enabled: true },
      );

      handler.selectiveSubscribe(singleWc);

      if (!stateCallback) throw new Error('stateCallback was not captured');
      (safelySendToWindow as Mock).mockClear();
      stateCallback(updatedState);

      await new Promise((resolve) => setTimeout(resolve, 10));

      type DeltaPayload = { delta: { type: string; changed?: Record<string, unknown> } };
      const sendCalls = (safelySendToWindow as Mock).mock.calls as unknown[][];
      const deltaSend = sendCalls.find((call) => (call[2] as DeltaPayload).delta.type === 'delta');
      expect(deltaSend).toBeDefined();
      const changed = (deltaSend?.[2] as DeltaPayload | undefined)?.delta.changed;
      // Primitive values should pass through
      expect(changed?.counter).toBe(2);
      // Symbol and BigInt values should be stripped
      expect(changed).not.toHaveProperty('tag');
      expect(changed).not.toHaveProperty('big');
    });

    it('should sanitize object values individually in delta changed', async () => {
      const { sanitizeState } = await import('../../../src/utils/serialization.js');

      const initialState = { counter: 1, user: { name: 'Alice' } };
      const updatedState = { counter: 2, user: { name: 'Bob' } };

      const stateManager: StateManager<AnyState> = {
        getState: vi.fn(() => initialState),
        subscribe: vi.fn(),
        processAction: vi.fn(),
      };

      const singleWc = {
        id: 300,
        isDestroyed: vi.fn(() => false),
        send: vi.fn(),
      } as unknown as WebContents;

      let stateCallback: ((state: AnyState) => void) | undefined;
      const mockSubManager = {
        subscribe: vi.fn((_keys: unknown, cb: (state: AnyState) => void) => {
          stateCallback = cb;
          return { status: 'registered' as const, unsubscribe: vi.fn() };
        }),
        unsubscribe: vi.fn(),
        getCurrentSubscriptionKeys: vi.fn(() => []),
      };

      // Return the mock directly so selectiveSubscribe uses it
      mockResourceManager.getSubscriptionManager.mockReturnValue(mockSubManager);

      // Create handler with deltas enabled
      const handler = new SubscriptionHandler(
        stateManager,
        mockResourceManager as unknown as ResourceManager<AnyState>,
        mockWindowTracker as unknown as WebContentsTracker,
        undefined,
        { enabled: true },
      );

      handler.selectiveSubscribe(singleWc);

      // Trigger the subscription callback with a state update to get past the initial prevState seeding
      if (!stateCallback) throw new Error('stateCallback was not captured');
      (sanitizeState as Mock).mockClear();
      (safelySendToWindow as Mock).mockClear();
      stateCallback(updatedState);

      await new Promise((resolve) => setTimeout(resolve, 10));

      // sanitizeState should be called per-value for objects, not with the entire changed record cast as State
      // With the identity mock, the delta should contain the individual changed values
      type DeltaPayload = { delta: { type: string; changed?: Record<string, unknown> } };
      const sendCalls = (safelySendToWindow as Mock).mock.calls as unknown[][];
      expect(sendCalls.length).toBeGreaterThan(0);
      const deltaSend = sendCalls.find((call) => (call[2] as DeltaPayload).delta.type === 'delta');
      expect(deltaSend).toBeDefined();
      const changed = (deltaSend?.[2] as DeltaPayload | undefined)?.delta.changed;
      // Primitive values should pass through directly (not sanitized)
      expect(changed?.counter).toBe(2);
      // Object values should be sanitized (identity mock returns as-is)
      expect(changed?.user).toEqual({ name: 'Bob' });
    });

    it('should not send delta when all values are stripped by sanitization', async () => {
      const initialState = { cb1: () => 'a', cb2: () => 'b' };
      const updatedState = { cb1: () => 'c', cb2: () => 'd' };

      const stateManager: StateManager<AnyState> = {
        getState: vi.fn(() => initialState),
        subscribe: vi.fn(),
        processAction: vi.fn(),
      };

      const singleWc = {
        id: 401,
        isDestroyed: vi.fn(() => false),
        send: vi.fn(),
      } as unknown as WebContents;

      let stateCallback: ((state: AnyState) => void) | undefined;
      const mockSubManager = {
        subscribe: vi.fn((_keys: unknown, cb: (state: AnyState) => void) => {
          stateCallback = cb;
          return vi.fn();
        }),
        unsubscribe: vi.fn(),
        getCurrentSubscriptionKeys: vi.fn(() => []),
      };

      mockResourceManager.getSubscriptionManager.mockReturnValue(mockSubManager);

      const handler = new SubscriptionHandler(
        stateManager,
        mockResourceManager as unknown as ResourceManager<AnyState>,
        mockWindowTracker as unknown as WebContentsTracker,
        undefined,
        { enabled: true },
      );

      handler.selectiveSubscribe(singleWc);

      if (!stateCallback) throw new Error('stateCallback was not captured');
      (safelySendToWindow as Mock).mockClear();
      stateCallback(updatedState);

      await new Promise((resolve) => setTimeout(resolve, 10));

      // An empty sanitized delta must not be sent — it would cause the renderer
      // to fall through to getState(), leaking the full store for selective subs
      expect(safelySendToWindow).not.toHaveBeenCalled();
    });
  });
});
