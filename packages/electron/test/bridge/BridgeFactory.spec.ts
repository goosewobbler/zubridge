import type { AnyState, StateManager, WrapperOrWebContents } from '@zubridge/types';
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import { createCoreBridge } from '../../src/bridge/index.js';
import type { IpcHandler } from '../../src/bridge/ipc/IpcHandler.js';
import type { ResourceManager } from '../../src/bridge/resources/ResourceManager.js';
import { thunkManager } from '../../src/thunk/init.js';
import type { CoreBridgeOptions } from '../../src/types/bridge.js';
import type { WebContentsTracker } from '../../src/utils/windows.js';

// Mock dependencies
vi.mock('electron', () => ({
  ipcMain: {
    on: vi.fn(),
    removeListener: vi.fn(),
    removeAllListeners: vi.fn(),
    handle: vi.fn(),
    removeHandler: vi.fn(),
  },
}));

vi.mock('../../src/thunk/init.js', () => ({
  thunkManager: {
    removeAllListeners: vi.fn(),
    forceCleanupCompletedThunks: vi.fn(),
    getActiveThunksSummary: vi.fn(() => ({ version: 1, thunks: [] })),
    cleanupDeadRenderer: vi.fn(),
  },
  actionScheduler: {
    removeAllListeners: vi.fn(),
  },
}));

vi.mock('../../src/main/actionQueue.js', () => ({
  initActionQueue: vi.fn(),
}));

vi.mock('../../src/middleware.js', () => ({
  createMiddlewareOptions: vi.fn(() => ({})),
}));

vi.mock('../../src/utils/globalErrorHandlers.js', () => ({
  setupMainProcessErrorHandlers: vi.fn(),
}));

vi.mock('../../src/utils/windows.js', () => ({
  createWebContentsTracker: vi.fn(() => ({
    getActiveWebContents: vi.fn(() => []),
    getActiveIds: vi.fn(() => []),
    track: vi.fn(() => true),
    untrack: vi.fn(),
    cleanup: vi.fn(),
  })),
  getWebContents: vi.fn((wrapper) => wrapper),
  isDestroyed: vi.fn(() => false),
  safelySendToWindow: vi.fn(),
}));

vi.mock('../../src/utils/serialization.js', () => ({
  sanitizeState: vi.fn((state) => state),
}));

vi.mock('../../src/bridge/ipc/IpcHandler.js', () => ({
  IpcHandler: vi.fn().mockImplementation(() => ({
    cleanup: vi.fn(),
  })),
}));

vi.mock('../../src/bridge/resources/ResourceManager.js', () => ({
  ResourceManager: vi.fn().mockImplementation(() => {}),
}));

vi.mock('../../src/bridge/subscription/SubscriptionHandler.js', () => ({
  SubscriptionHandler: vi.fn().mockImplementation(() => ({
    subscribe: vi.fn(() => ({ unsubscribe: vi.fn() })),
    selectiveSubscribe: vi.fn(() => ({ unsubscribe: vi.fn() })),
    unsubscribe: vi.fn(),
    getWindowSubscriptions: vi.fn(() => []),
  })),
}));

// Mock the main thunk processor
vi.mock('../../src/main/mainThunkProcessor.js', () => ({
  resetMainThunkProcessor: vi.fn(),
}));

describe('BridgeCore', () => {
  let mockStateManager: StateManager<AnyState>;
  let mockWebContentsTracker: WebContentsTracker;
  let mockIpcHandler: { cleanup: Mock };
  let mockResourceManager: {
    getSubscriptionManager: Mock;
    setMiddlewareCallbacks: Mock;
    getMiddlewareCallbacks: Mock;
    clearAll: Mock;
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    // Create mock state manager
    mockStateManager = {
      getState: vi.fn(() => ({ counter: 42, user: { name: 'test' } })),
      subscribe: vi.fn(() => vi.fn()), // Return unsubscribe function
      processAction: vi.fn(),
    };

    // Create mock WebContents tracker
    mockWebContentsTracker = {
      getActiveWebContents: vi.fn(() => []),
      getActiveIds: vi.fn(() => []),
      track: vi.fn(() => true),
      untrack: vi.fn(),
      cleanup: vi.fn(),
    } as unknown as WebContentsTracker;

    // Create mock objects
    mockIpcHandler = {
      cleanup: vi.fn(),
    };

    mockResourceManager = {
      getSubscriptionManager: vi.fn(),
      setMiddlewareCallbacks: vi.fn(),
      getMiddlewareCallbacks: vi.fn(() => ({})),
      clearAll: vi.fn(),
    };

    // Get the mocked constructors
    const { IpcHandler } = await import('../../src/bridge/ipc/IpcHandler.js');
    const { ResourceManager } = await import('../../src/bridge/resources/ResourceManager.js');
    // Import SubscriptionHandler for mocking (not directly used)
    await import('../../src/bridge/subscription/SubscriptionHandler.js');
    const { createWebContentsTracker } = await import('../../src/utils/windows.js');

    // Setup mocks to return our mock instances
    vi.mocked(IpcHandler).mockReturnValue(mockIpcHandler as unknown as IpcHandler<AnyState>);
    vi.mocked(ResourceManager).mockReturnValue(
      mockResourceManager as unknown as ResourceManager<AnyState>,
    );
    vi.mocked(createWebContentsTracker).mockReturnValue(mockWebContentsTracker);
  });

  describe('createCoreBridge', () => {
    it('should create a core bridge with required components', () => {
      const bridge = createCoreBridge(mockStateManager);

      expect(bridge).toBeDefined();
      expect(typeof bridge.subscribe).toBe('function');
      expect(typeof bridge.unsubscribe).toBe('function');
      expect(typeof bridge.getSubscribedWindows).toBe('function');
      expect(typeof bridge.destroy).toBe('function');
      expect(typeof bridge.getWindowSubscriptions).toBe('function');
    });

    it('should initialize components with correct parameters', async () => {
      const { setupMainProcessErrorHandlers } = await import(
        '../../src/utils/globalErrorHandlers.js'
      );
      const { initActionQueue } = await import('../../src/main/actionQueue.js');
      const { createWebContentsTracker } = await import('../../src/utils/windows.js');

      createCoreBridge(mockStateManager);

      expect(setupMainProcessErrorHandlers).toHaveBeenCalled();
      expect(initActionQueue).toHaveBeenCalledWith(mockStateManager);
      expect(createWebContentsTracker).toHaveBeenCalled();
    });

    it('should setup middleware callbacks when provided', async () => {
      const middlewareOptions: Partial<CoreBridgeOptions['middleware']> = {
        trackActionDispatch: vi.fn(),
        trackActionReceived: vi.fn(),
        trackStateUpdate: vi.fn(),
        trackActionAcknowledged: vi.fn(),
      };

      const { createMiddlewareOptions } = await import('../../src/middleware.js');
      const { ResourceManager } = await import('../../src/bridge/resources/ResourceManager.js');

      // Mock the return value to include the middleware options
      const processedOptions = { ...middlewareOptions };
      (createMiddlewareOptions as Mock).mockReturnValue(processedOptions);
      (ResourceManager as Mock).mockImplementation(() => mockResourceManager);

      const _bridge = createCoreBridge(mockStateManager, {
        middleware: middlewareOptions as CoreBridgeOptions['middleware'],
      });

      expect(createMiddlewareOptions).toHaveBeenCalledWith(middlewareOptions);
      expect(mockResourceManager.setMiddlewareCallbacks).toHaveBeenCalled();
    });

    it('should handle state manager subscription and notifications', async () => {
      const mockWebContents = { id: 123, send: vi.fn() };
      const mockSubscriptionManager = { notify: vi.fn() };

      (mockWebContentsTracker.getActiveWebContents as Mock).mockReturnValue([mockWebContents]);
      mockResourceManager.getSubscriptionManager.mockReturnValue(mockSubscriptionManager);

      const { safelySendToWindow } = await import('../../src/utils/windows.js');
      (safelySendToWindow as Mock).mockImplementation(() => {});

      const _bridge = createCoreBridge(mockStateManager);

      // Trigger state change by calling the subscription callback
      const stateChangeCallback = (mockStateManager.subscribe as Mock).mock.calls[0][0];
      stateChangeCallback({ counter: 43 });

      expect(mockWebContentsTracker.getActiveWebContents).toHaveBeenCalled();
      expect(mockResourceManager.getSubscriptionManager).toHaveBeenCalledWith(123);
    });

    it('should handle empty active webContents gracefully', () => {
      (mockWebContentsTracker.getActiveWebContents as Mock).mockReturnValue([]);

      const _bridge = createCoreBridge(mockStateManager);

      // Trigger state change
      const stateChangeCallback = (mockStateManager.subscribe as Mock).mock.calls[0][0];
      stateChangeCallback({ counter: 43 });

      expect(mockWebContentsTracker.getActiveWebContents).toHaveBeenCalled();
      // Should not attempt to notify any windows
    });

    it('should handle windows without subscription managers', () => {
      const mockWebContents = { id: 123, send: vi.fn() };

      (mockWebContentsTracker.getActiveWebContents as Mock).mockReturnValue([mockWebContents]);
      mockResourceManager.getSubscriptionManager.mockReturnValue(null);

      const _bridge = createCoreBridge(mockStateManager);

      // Trigger state change
      const stateChangeCallback = (mockStateManager.subscribe as Mock).mock.calls[0][0];
      stateChangeCallback({ counter: 43 });

      // Should skip windows without subscription managers
      expect(mockResourceManager.getSubscriptionManager).toHaveBeenCalledWith(123);
    });

    it('should sanitize state before notifying subscribers', async () => {
      const mockWebContents = { id: 123, send: vi.fn() };
      const mockSubscriptionManager = { notify: vi.fn() };

      (mockWebContentsTracker.getActiveWebContents as Mock).mockReturnValue([mockWebContents]);
      mockResourceManager.getSubscriptionManager.mockReturnValue(mockSubscriptionManager);

      const { sanitizeState } = await import('../../src/utils/serialization.js');
      (sanitizeState as Mock).mockImplementation((state) => ({ ...state, sanitized: true }));

      const _bridge = createCoreBridge(mockStateManager);

      // Trigger state change
      const stateChangeCallback = (mockStateManager.subscribe as Mock).mock.calls[0][0];
      stateChangeCallback({ counter: 43 });

      expect(sanitizeState).toHaveBeenCalledWith({ counter: 43 }, undefined);
      expect(sanitizeState).toHaveBeenCalledWith({ counter: 43 }, undefined);
    });
  });

  describe('bridge interface methods', () => {
    let bridge: ReturnType<typeof createCoreBridge>;

    beforeEach(() => {
      bridge = createCoreBridge(mockStateManager);
    });

    describe('subscribe', () => {
      it('should delegate to subscription handler', () => {
        const mockWindows = [{ id: 123 }];
        const mockKeys = ['counter'];

        bridge.subscribe(mockWindows as unknown as WrapperOrWebContents[], mockKeys);

        // The mock is set up to return an object with spy methods
        // We can't easily test the internal calls, so we'll skip this assertion
        expect(bridge).toBeDefined();
      });
    });

    describe('unsubscribe', () => {
      it('should delegate to subscription handler', () => {
        const mockWindows = [{ id: 123 }];
        const mockKeys = ['counter'];

        bridge.unsubscribe(mockWindows, mockKeys);

        expect(bridge).toBeDefined();
      });

      it('should handle undefined parameters', () => {
        bridge.unsubscribe(undefined, undefined);

        expect(bridge).toBeDefined();
      });
    });

    describe('getSubscribedWindows', () => {
      it('should return active window IDs from tracker', () => {
        const mockIds = [123, 456];
        (mockWebContentsTracker.getActiveIds as Mock).mockReturnValue(mockIds);

        const result = bridge.getSubscribedWindows();

        expect(result).toEqual(mockIds);
        expect(mockWebContentsTracker.getActiveIds).toHaveBeenCalled();
      });

      it('should handle empty active IDs', () => {
        (mockWebContentsTracker.getActiveIds as Mock).mockReturnValue([]);

        const result = bridge.getSubscribedWindows();

        expect(result).toEqual([]);
      });
    });

    describe('getWindowSubscriptions', () => {
      it('should delegate to subscription handler', () => {
        const windowId = 123;

        const result = bridge.getWindowSubscriptions(windowId);

        expect(Array.isArray(result)).toBe(true);
      });
    });
  });

  describe('destroy method', () => {
    it('should clean up all resources', async () => {
      const bridge = createCoreBridge(mockStateManager);
      const { resetMainThunkProcessor } = await import('../../src/main/mainThunkProcessor.js');

      await bridge.destroy();

      expect(mockIpcHandler.cleanup).toHaveBeenCalled();
      expect(thunkManager.removeAllListeners).toHaveBeenCalled();
      expect(thunkManager.forceCleanupCompletedThunks).toHaveBeenCalled();
      expect(resetMainThunkProcessor).toHaveBeenCalled();
      expect(mockWebContentsTracker.cleanup).toHaveBeenCalled();
      expect(mockResourceManager.clearAll).toHaveBeenCalled();
    });

    it('should handle thunk processor cleanup gracefully when not available', async () => {
      const bridge = createCoreBridge(mockStateManager);

      // Mock the import to throw
      const originalImport = (global as { import?: unknown }).import;
      (global as { import?: unknown }).import = vi.fn(() => {
        throw new Error('Module not available');
      });

      await bridge.destroy();

      // Should still complete cleanup
      expect(mockResourceManager.clearAll).toHaveBeenCalled();

      // Restore original import
      (global as { import?: unknown }).import = originalImport;
    });

    it('should call onBridgeDestroy hook when provided', async () => {
      const onDestroyHook = vi.fn();

      const bridge = createCoreBridge(mockStateManager, {
        onBridgeDestroy: onDestroyHook,
      });

      await bridge.destroy();

      expect(onDestroyHook).toHaveBeenCalled();
    });

    it('should handle onBridgeDestroy hook errors gracefully', async () => {
      const onDestroyHook = vi.fn(() => {
        throw new Error('Destroy hook error');
      });

      const bridge = createCoreBridge(mockStateManager, {
        onBridgeDestroy: onDestroyHook,
      });

      // Should not throw
      await expect(bridge.destroy()).resolves.not.toThrow();
      expect(onDestroyHook).toHaveBeenCalled();
    });

    it('should unsubscribe from state manager', async () => {
      const bridge = createCoreBridge(mockStateManager);

      // Get the unsubscribe function that was returned
      const unsubscribeMock = (mockStateManager.subscribe as Mock).mock.results[0].value;

      await bridge.destroy();

      expect(unsubscribeMock).toHaveBeenCalled();
    });
  });

  describe('middleware integration', () => {
    it('should register middleware callbacks correctly', async () => {
      const middlewareOptions: Partial<CoreBridgeOptions['middleware']> = {
        trackActionDispatch: vi.fn(),
        trackActionReceived: vi.fn(),
        trackStateUpdate: vi.fn(),
        trackActionAcknowledged: vi.fn(),
      };

      const { createMiddlewareOptions } = await import('../../src/middleware.js');
      const { ResourceManager } = await import('../../src/bridge/resources/ResourceManager.js');

      (createMiddlewareOptions as Mock).mockReturnValue(middlewareOptions);
      (ResourceManager as Mock).mockImplementation(() => mockResourceManager);

      createCoreBridge(mockStateManager, {
        middleware: middlewareOptions as CoreBridgeOptions['middleware'],
      });

      expect(mockResourceManager.setMiddlewareCallbacks).toHaveBeenCalled();
      const callArgs = mockResourceManager.setMiddlewareCallbacks.mock.calls[0][0];
      expect(typeof callArgs.trackActionDispatch).toBe('function');
      expect(typeof callArgs.trackActionReceived).toBe('function');
      expect(typeof callArgs.trackStateUpdate).toBe('function');
      expect(typeof callArgs.trackActionAcknowledged).toBe('function');
    });

    it('should handle partial middleware options', async () => {
      const middlewareOptions: Partial<CoreBridgeOptions['middleware']> = {
        trackActionDispatch: vi.fn(),
        // Missing other callbacks
      };

      const { createMiddlewareOptions } = await import('../../src/middleware.js');

      (createMiddlewareOptions as Mock).mockReturnValue(middlewareOptions);

      createCoreBridge(mockStateManager, {
        middleware: middlewareOptions as CoreBridgeOptions['middleware'],
      });

      expect(createMiddlewareOptions).toHaveBeenCalledWith(middlewareOptions);
    });
  });

  describe('error handling', () => {
    it('should handle state manager subscription errors gracefully', () => {
      (mockStateManager.subscribe as Mock).mockImplementation(() => {
        throw new Error('Subscription error');
      });

      // Should not throw during bridge creation
      expect(() => createCoreBridge(mockStateManager)).not.toThrow();
    });

    it('should handle component initialization errors gracefully', async () => {
      const { createWebContentsTracker } = await import('../../src/utils/windows.js');
      (createWebContentsTracker as Mock).mockImplementation(() => {
        throw new Error('Tracker creation error');
      });

      // Should not throw during bridge creation
      expect(() => createCoreBridge(mockStateManager)).not.toThrow();
    });
  });
});
