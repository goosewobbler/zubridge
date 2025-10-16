import type { AnyState, StateManager } from '@zubridge/types';
import type { WebContents } from 'electron';
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import type { ResourceManager } from '../../../src/bridge/resources/ResourceManager.js';
import { SubscriptionHandler } from '../../../src/bridge/subscription/SubscriptionHandler.js';
import { getWebContents, type WebContentsTracker } from '../../../src/utils/windows.js';

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
});
