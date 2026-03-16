import type { AnyState, StateManager } from '@zubridge/types';
import type { WebContents } from 'electron';
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import type { ResourceManager } from '../../../src/bridge/resources/ResourceManager.js';
import { SubscriptionHandler } from '../../../src/bridge/subscription/SubscriptionHandler.js';
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
        subscribe: vi.fn(() => ({ unsubscribe: vi.fn() })),
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
        subscribe: vi.fn(() => ({ unsubscribe: vi.fn() })),
        unsubscribe: vi.fn(),
        getCurrentSubscriptionKeys: vi.fn(() => []),
      };
      (mockResourceManager.getSubscriptionManager as Mock).mockReturnValue(mockSubManager);

      const result = subscriptionHandler.subscribe(mockWebContents, keys);

      expect(typeof result.unsubscribe).toBe('function');
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
          return { unsubscribe: vi.fn() };
        }),
        unsubscribe: vi.fn(),
        getCurrentSubscriptionKeys: vi.fn(() => ['*']),
      };

      mockResourceManager.getSubscriptionManager.mockReturnValue(null);
      mockResourceManager.addSubscriptionManager.mockImplementation(() => {
        mockResourceManager.getSubscriptionManager.mockReturnValue(mockSubManager);
      });
      (mockWindowTracker.track as Mock).mockReturnValue(true);

      // Create SubscriptionHandler with maxDepth: 3
      const handlerWithMaxDepth = new SubscriptionHandler(
        mockStateManager,
        mockResourceManager,
        mockWindowTracker,
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
        subscribe: vi.fn(() => ({ unsubscribe: vi.fn() })),
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
    it('should only send filtered state for selective subscriptions when deltas are disabled', async () => {
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
          return vi.fn(); // unsubscribe function
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

      // The full state update should only contain the 'counter' key, not the entire store
      type SendPayload = { delta: { type: string; fullState?: Record<string, unknown> } };
      const sendCalls = (safelySendToWindow as Mock).mock.calls as unknown[][];
      const fullStateSend = sendCalls.find(
        (call) => (call[2] as SendPayload).delta.type === 'full',
      );
      expect(fullStateSend).toBeDefined();
      const sentFullState = (fullStateSend?.[2] as SendPayload | undefined)?.delta.fullState;
      expect(sentFullState).toHaveProperty('counter');
      expect(sentFullState).not.toHaveProperty('user');
      expect(sentFullState).not.toHaveProperty('secret');
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
        subscribe: vi.fn(() => ({ unsubscribe: vi.fn() })),
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
  });

  describe('sanitizeDelta per-value sanitization', () => {
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
          return vi.fn(); // unsubscribe function
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
  });
});
