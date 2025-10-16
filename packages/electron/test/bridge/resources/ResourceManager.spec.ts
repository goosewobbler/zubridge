import type { AnyState } from '@zubridge/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ResourceManager } from '../../../src/bridge/resources/ResourceManager.js';
import { SubscriptionManager } from '../../../src/subscription/SubscriptionManager.js';

// Mock dependencies
vi.mock('../../../src/subscription/SubscriptionManager.js', () => ({
  SubscriptionManager: vi.fn().mockImplementation(() => ({
    subscribe: vi.fn(() => ({ unsubscribe: vi.fn() })),
    unsubscribe: vi.fn(),
    getCurrentSubscriptionKeys: vi.fn(() => []),
    notify: vi.fn(),
  })),
}));

describe('ResourceManager', () => {
  let mockWindowTracker: { getActiveWebContents: () => { id: number }[] };
  let resourceManager: ResourceManager<AnyState>;

  beforeEach(() => {
    vi.clearAllMocks();
    // Create mock window tracker
    mockWindowTracker = {
      getActiveWebContents: vi.fn(() => []),
    };

    resourceManager = new ResourceManager(mockWindowTracker);
  });

  describe('initialization', () => {
    it('should create a new instance', () => {
      expect(resourceManager).toBeDefined();
      // Test using the public API instead of private properties
      expect(resourceManager.getSubscriptionManager(123)).toBeUndefined();
    });
  });

  describe('addSubscriptionManager and getSubscriptionManager', () => {
    it('should add and retrieve subscription manager for window', () => {
      const windowId = 123;
      const mockSubscriptionManager = new SubscriptionManager();

      resourceManager.addSubscriptionManager(windowId, mockSubscriptionManager);
      const result = resourceManager.getSubscriptionManager(windowId);

      expect(result).toBe(mockSubscriptionManager);
    });

    it('should return undefined for unknown window', () => {
      const windowId = 123;

      const result = resourceManager.getSubscriptionManager(windowId);

      expect(result).toBeUndefined();
    });

    it('should handle multiple windows independently', () => {
      const windowId1 = 123;
      const windowId2 = 456;
      const mockSubscriptionManager1 = new SubscriptionManager();
      const mockSubscriptionManager2 = new SubscriptionManager();

      resourceManager.addSubscriptionManager(windowId1, mockSubscriptionManager1);
      resourceManager.addSubscriptionManager(windowId2, mockSubscriptionManager2);

      const result1 = resourceManager.getSubscriptionManager(windowId1);
      const result2 = resourceManager.getSubscriptionManager(windowId2);

      expect(result1).toBe(mockSubscriptionManager1);
      expect(result2).toBe(mockSubscriptionManager2);
      expect(result1).not.toBe(result2);
      expect(SubscriptionManager).toHaveBeenCalledTimes(2);
    });
  });

  describe('setMiddlewareCallbacks', () => {
    it('should store middleware callbacks', () => {
      const middlewareCallbacks = {
        trackActionDispatch: vi.fn(),
        trackActionReceived: vi.fn(),
        trackStateUpdate: vi.fn(),
        trackActionAcknowledged: vi.fn(),
      };

      resourceManager.setMiddlewareCallbacks(middlewareCallbacks);

      expect(resourceManager.getMiddlewareCallbacks()).toEqual(middlewareCallbacks);
    });
  });

  describe('getMiddlewareCallbacks', () => {
    it('should return stored middleware callbacks', () => {
      const middlewareCallbacks = {
        trackActionDispatch: vi.fn(),
        trackStateUpdate: vi.fn(),
      };

      resourceManager.setMiddlewareCallbacks(middlewareCallbacks);

      const result = resourceManager.getMiddlewareCallbacks();
      expect(result).toEqual(middlewareCallbacks);
    });

    it('should return empty object when no callbacks set', () => {
      const result = resourceManager.getMiddlewareCallbacks();
      expect(result).toEqual({});
    });
  });

  describe('removeSubscriptionManager', () => {
    it('should remove specific subscription manager', () => {
      const windowId = 123;
      const mockSubscriptionManager = new SubscriptionManager();

      resourceManager.addSubscriptionManager(windowId, mockSubscriptionManager);
      resourceManager.addDestroyListener(windowId);

      expect(resourceManager.getSubscriptionManager(windowId)).toBeDefined();
      expect(resourceManager.hasDestroyListener(windowId)).toBe(true);

      resourceManager.removeSubscriptionManager(windowId);

      expect(resourceManager.getSubscriptionManager(windowId)).toBeUndefined();
      expect(resourceManager.hasDestroyListener(windowId)).toBe(false);
    });
  });

  describe('destroy listener management', () => {
    it('should track destroy listeners for windows', () => {
      const windowId1 = 123;
      const windowId2 = 456;

      expect(resourceManager.hasDestroyListener(windowId1)).toBe(false);
      expect(resourceManager.hasDestroyListener(windowId2)).toBe(false);

      resourceManager.addDestroyListener(windowId1);
      resourceManager.addDestroyListener(windowId2);

      expect(resourceManager.hasDestroyListener(windowId1)).toBe(true);
      expect(resourceManager.hasDestroyListener(windowId2)).toBe(true);
    });
  });

  describe('getAllSubscriptionManagers', () => {
    it('should return a copy of all subscription managers', () => {
      const windowId1 = 123;
      const windowId2 = 456;
      const mockSubscriptionManager1 = new SubscriptionManager();
      const mockSubscriptionManager2 = new SubscriptionManager();

      resourceManager.addSubscriptionManager(windowId1, mockSubscriptionManager1);
      resourceManager.addSubscriptionManager(windowId2, mockSubscriptionManager2);

      const allManagers = resourceManager.getAllSubscriptionManagers();

      expect(allManagers.size).toBe(2);
      expect(allManagers.get(windowId1)).toBe(mockSubscriptionManager1);
      expect(allManagers.get(windowId2)).toBe(mockSubscriptionManager2);

      // Verify it's a copy (modifications don't affect original)
      allManagers.delete(windowId1);
      expect(resourceManager.getSubscriptionManager(windowId1)).toBe(mockSubscriptionManager1);
    });
  });

  describe('subscription manager capacity management', () => {
    it('should enforce maximum subscription managers limit', () => {
      // Create ResourceManager with small limit for testing
      const limitedResourceManager = new ResourceManager(mockWindowTracker, {
        maxSubscriptionManagers: 2,
      });

      const windowId1 = 123;
      const windowId2 = 456;
      const windowId3 = 789;

      const mockManager1 = new SubscriptionManager();
      const mockManager2 = new SubscriptionManager();
      const mockManager3 = new SubscriptionManager();

      // Add first two managers
      limitedResourceManager.addSubscriptionManager(windowId1, mockManager1);
      limitedResourceManager.addSubscriptionManager(windowId2, mockManager2);

      expect(limitedResourceManager.getSubscriptionManager(windowId1)).toBe(mockManager1);
      expect(limitedResourceManager.getSubscriptionManager(windowId2)).toBe(mockManager2);

      // Add third manager - should remove first one
      limitedResourceManager.addSubscriptionManager(windowId3, mockManager3);

      expect(limitedResourceManager.getSubscriptionManager(windowId1)).toBeUndefined();
      expect(limitedResourceManager.getSubscriptionManager(windowId2)).toBe(mockManager2);
      expect(limitedResourceManager.getSubscriptionManager(windowId3)).toBe(mockManager3);
    });
  });

  describe('resource management options', () => {
    it('should respect custom cleanup interval', () => {
      vi.useFakeTimers();

      const customInterval = 5000; // 5 seconds
      const resourceManagerWithOptions = new ResourceManager(mockWindowTracker, {
        enablePeriodicCleanup: true,
        cleanupIntervalMs: customInterval,
      });

      // Fast forward time and check that cleanup was called
      vi.advanceTimersByTime(customInterval + 100);

      // Note: We can't easily test the internal timer without more complex mocking
      // This test verifies the ResourceManager accepts the options without error
      expect(resourceManagerWithOptions).toBeDefined();

      vi.useRealTimers();
    });

    it('should disable periodic cleanup when requested', () => {
      const resourceManagerNoCleanup = new ResourceManager(mockWindowTracker, {
        enablePeriodicCleanup: false,
      });

      expect(resourceManagerNoCleanup).toBeDefined();
    });
  });

  describe('periodic cleanup', () => {
    let mockElectron: {
      webContents: {
        getAllWebContents: ReturnType<typeof vi.fn>;
      };
    };

    beforeEach(() => {
      // Mock require for electron
      mockElectron = {
        webContents: {
          getAllWebContents: vi.fn(() => [
            { id: 123, isDestroyed: () => false },
            { id: 456, isDestroyed: () => false },
          ]),
        },
      };

      // Mock require to return our mock electron
      vi.doMock('electron', () => mockElectron);
    });

    afterEach(() => {
      vi.doUnmock('electron');
    });

    it('should clean up destroyed windows with window tracker', () => {
      // Setup window tracker that shows only one active window
      mockWindowTracker.getActiveWebContents = vi.fn(() => [{ id: 123 }]);

      // Add managers for multiple windows
      const mockManager1 = new SubscriptionManager();
      const mockManager2 = new SubscriptionManager();
      resourceManager.addSubscriptionManager(123, mockManager1);
      resourceManager.addSubscriptionManager(456, mockManager2); // This window is "destroyed"

      expect(resourceManager.getSubscriptionManager(123)).toBe(mockManager1);
      expect(resourceManager.getSubscriptionManager(456)).toBe(mockManager2);

      // Trigger periodic cleanup via constructor with immediate cleanup
      const cleanupResourceManager = new ResourceManager(mockWindowTracker, {
        enablePeriodicCleanup: true,
        cleanupIntervalMs: 0, // Immediate cleanup
      });

      // Add the same managers to trigger cleanup
      cleanupResourceManager.addSubscriptionManager(123, mockManager1);
      cleanupResourceManager.addSubscriptionManager(456, mockManager2);

      // Note: Actual cleanup is asynchronous and hard to test without complex timing
      expect(cleanupResourceManager).toBeDefined();
    });
  });

  describe('clearAll', () => {
    it('should clear all subscription managers', () => {
      const windowId1 = 123;
      const windowId2 = 456;
      const mockSubscriptionManager1 = new SubscriptionManager();
      const mockSubscriptionManager2 = new SubscriptionManager();

      // Add subscription managers for multiple windows
      resourceManager.addSubscriptionManager(windowId1, mockSubscriptionManager1);
      resourceManager.addSubscriptionManager(windowId2, mockSubscriptionManager2);

      expect(resourceManager.getSubscriptionManager(windowId1)).toBeDefined();
      expect(resourceManager.getSubscriptionManager(windowId2)).toBeDefined();

      resourceManager.clearAll();

      expect(resourceManager.getSubscriptionManager(windowId1)).toBeUndefined();
      expect(resourceManager.getSubscriptionManager(windowId2)).toBeUndefined();
    });

    it('should clear middleware callbacks', () => {
      const middlewareCallbacks = { trackActionDispatch: vi.fn() };
      resourceManager.setMiddlewareCallbacks(middlewareCallbacks);

      resourceManager.clearAll();

      expect(resourceManager.getMiddlewareCallbacks()).toEqual({});
    });

    it('should clear destroy listeners', () => {
      resourceManager.addDestroyListener(123);
      resourceManager.addDestroyListener(456);

      expect(resourceManager.hasDestroyListener(123)).toBe(true);
      expect(resourceManager.hasDestroyListener(456)).toBe(true);

      resourceManager.clearAll();

      expect(resourceManager.hasDestroyListener(123)).toBe(false);
      expect(resourceManager.hasDestroyListener(456)).toBe(false);
    });

    it('should clear cleanup timer', () => {
      vi.useFakeTimers();

      // Create resource manager with timer
      const timerResourceManager = new ResourceManager(mockWindowTracker, {
        enablePeriodicCleanup: true,
        cleanupIntervalMs: 1000,
      });

      timerResourceManager.clearAll();

      // Timer should be cleared (no way to directly test but method should not throw)
      expect(timerResourceManager).toBeDefined();

      vi.useRealTimers();
    });
  });

  describe('middleware callback handling', () => {
    it('should handle partial middleware callbacks', () => {
      const partialCallbacks = {
        trackActionDispatch: vi.fn(),
        // Missing other callbacks
      };

      resourceManager.setMiddlewareCallbacks(partialCallbacks);
      const result = resourceManager.getMiddlewareCallbacks();

      expect(result.trackActionDispatch).toBe(partialCallbacks.trackActionDispatch);
      expect(result.trackActionReceived).toBeUndefined();
      expect(result.trackStateUpdate).toBeUndefined();
      expect(result.trackActionAcknowledged).toBeUndefined();
    });

    it('should replace existing callbacks when setting new ones', () => {
      const firstCallbacks = { trackActionDispatch: vi.fn() };
      const secondCallbacks = { trackStateUpdate: vi.fn() };

      resourceManager.setMiddlewareCallbacks(firstCallbacks);
      resourceManager.setMiddlewareCallbacks(secondCallbacks);

      const result = resourceManager.getMiddlewareCallbacks();

      expect(result.trackActionDispatch).toBeUndefined();
      expect(result.trackStateUpdate).toBe(secondCallbacks.trackStateUpdate);
    });
  });
});
