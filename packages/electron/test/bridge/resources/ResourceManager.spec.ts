import type { AnyState } from '@zubridge/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ResourceManager } from '../../../src/bridge/resources/ResourceManager.js';
import { SubscriptionManager } from '../../../src/lib/SubscriptionManager.js';

// Mock dependencies
vi.mock('../../../src/lib/SubscriptionManager.js', () => ({
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

    it('should initialize with proper metrics', () => {
      const metrics = resourceManager.getMetrics();
      expect(metrics.subscriptionManagers).toBe(0);
      expect(metrics.destroyListeners).toBe(0);
      expect(metrics.middlewareCallbacks).toBe(0);
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

  describe('clearAll', () => {
    it('should clear all subscription managers', () => {
      const windowId1 = 123;
      const windowId2 = 456;
      const mockSubscriptionManager1 = new SubscriptionManager();
      const mockSubscriptionManager2 = new SubscriptionManager();

      // Add subscription managers for multiple windows
      resourceManager.addSubscriptionManager(windowId1, mockSubscriptionManager1);
      resourceManager.addSubscriptionManager(windowId2, mockSubscriptionManager2);

      expect(resourceManager.getMetrics().subscriptionManagers).toBe(2);

      resourceManager.clearAll();

      expect(resourceManager.getMetrics().subscriptionManagers).toBe(0);
    });

    it('should clear middleware callbacks', () => {
      const middlewareCallbacks = { trackActionDispatch: vi.fn() };
      resourceManager.setMiddlewareCallbacks(middlewareCallbacks);

      resourceManager.clearAll();

      expect(resourceManager.getMiddlewareCallbacks()).toEqual({});
    });
  });
});
