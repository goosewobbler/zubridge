import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ipcMain } from 'electron';
import type { WebContents } from 'electron';
import type { AnyState, StateManager, WebContentsWrapper, Action } from '@zubridge/types';
import type { StoreApi } from 'zustand/vanilla';
import type { Store } from 'redux';
import { createCoreBridge, createBridgeFromStore } from '../src/bridge.js';
import { IpcChannel } from '../src/constants.js';
import * as registryModule from '../src/utils/stateManagerRegistry.js';
import * as windowsUtils from '../src/utils/windows.js';
import { ZustandOptions } from '../src/adapters/zustand.js';

// Mock Electron's ipcMain
vi.mock('electron', () => {
  return {
    ipcMain: {
      on: vi.fn(),
      removeListener: vi.fn(),
      handle: vi.fn(),
      removeHandler: vi.fn(),
    },
  };
});

// Mock the stateManagerRegistry module
vi.mock('../src/utils/stateManagerRegistry', () => {
  return {
    getStateManager: vi.fn(),
  };
});

// Mock the windows utilities
vi.mock('../src/utils/windows', () => {
  return {
    getWebContents: vi.fn(),
    isDestroyed: vi.fn(),
    safelySendToWindow: vi.fn(),
    createWebContentsTracker: vi.fn(),
    prepareWebContents: vi.fn(),
  };
});

// Mock console.error for error tests
vi.spyOn(console, 'error').mockImplementation(() => {});

// Helper function to create a mock WebContents
function createMockWebContents(id = 1): WebContents {
  return {
    id,
    isDestroyed: vi.fn(() => false),
    isLoading: vi.fn(() => false),
    send: vi.fn(),
    once: vi.fn(),
  } as unknown as WebContents;
}

// Helper function to create a mock WebContentsWrapper
function createMockWrapper(id = 1): WebContentsWrapper {
  return {
    webContents: createMockWebContents(id),
    isDestroyed: vi.fn(() => false),
  } as unknown as WebContentsWrapper;
}

// Helper function to create a mock StateManager
function createMockStateManager(): StateManager<AnyState> {
  return {
    getState: vi.fn(() => ({ counter: 0 })),
    subscribe: vi.fn((callback) => {
      // Immediately call the callback with a state update to test subscription
      callback({ counter: 5 });
      return vi.fn(); // Return unsubscribe function
    }),
    processAction: vi.fn(),
  } as unknown as StateManager<AnyState>;
}

// Helper function to create a mock tracker
function createMockTracker() {
  return {
    track: vi.fn((webContents) => true),
    untrack: vi.fn(),
    untrackById: vi.fn(),
    isTracked: vi.fn((webContents) => true),
    hasId: vi.fn((id) => true),
    getActiveIds: vi.fn(() => [1, 2]),
    getActiveWebContents: vi.fn(() => [createMockWebContents(1), createMockWebContents(2)]),
    cleanup: vi.fn(),
  };
}

// Helper function to create a mock Zustand store
function createMockZustandStore(): StoreApi<AnyState> {
  return {
    getState: vi.fn(() => ({ counter: 0 })),
    setState: vi.fn(),
    subscribe: vi.fn(() => () => {}),
  } as unknown as StoreApi<AnyState>;
}

// Helper function to create a mock Redux store
function createMockReduxStore(): Store<AnyState> {
  return {
    getState: vi.fn(() => ({ counter: 0 })),
    dispatch: vi.fn(),
    subscribe: vi.fn(() => () => {}),
    replaceReducer: vi.fn(),
    [Symbol.observable]: vi.fn(),
  } as unknown as Store<AnyState>;
}

describe('bridge.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Setup default mocks for windows utils
    const mockTracker = createMockTracker();
    vi.mocked(windowsUtils.createWebContentsTracker).mockReturnValue(mockTracker);
    vi.mocked(windowsUtils.prepareWebContents).mockImplementation((wrappers) => {
      if (!wrappers) return [];
      return wrappers.map((_, i) => createMockWebContents(i + 1));
    });
    vi.mocked(windowsUtils.getWebContents).mockImplementation((wrapper) => {
      if ((wrapper as any)?.id) {
        return wrapper as WebContents;
      }
      return (wrapper as WebContentsWrapper).webContents;
    });
    vi.mocked(windowsUtils.isDestroyed).mockReturnValue(false);
    vi.mocked(windowsUtils.safelySendToWindow).mockReturnValue(true);
  });

  describe('createCoreBridge', () => {
    it('should create a bridge with the provided state manager', () => {
      const stateManager = createMockStateManager();
      const bridge = createCoreBridge(stateManager);

      expect(bridge).toHaveProperty('subscribe');
      expect(bridge).toHaveProperty('unsubscribe');
      expect(bridge).toHaveProperty('getSubscribedWindows');
      expect(bridge).toHaveProperty('destroy');
    });

    it('should initialize IPC handlers for state and actions', () => {
      const stateManager = createMockStateManager();
      createCoreBridge(stateManager);

      expect(ipcMain.handle).toHaveBeenCalledWith(IpcChannel.GET_STATE, expect.any(Function));
      expect(ipcMain.on).toHaveBeenCalledWith(IpcChannel.DISPATCH, expect.any(Function));
    });

    it('should process actions received through IPC', () => {
      const stateManager = createMockStateManager();
      createCoreBridge(stateManager);

      // Get the dispatch handler registered with ipcMain.on
      const onCalls = vi.mocked(ipcMain.on).mock.calls;
      const dispatchHandler = onCalls.find((call) => call[0] === IpcChannel.DISPATCH)?.[1];
      expect(dispatchHandler).toBeDefined();

      if (dispatchHandler) {
        const action: Action = { type: 'INCREMENT' };
        // Create a mock event with sender property
        const mockEvent = {
          sender: {
            id: 123,
            send: vi.fn(),
          },
        };

        // Call the handler with the mock event and action
        dispatchHandler(mockEvent as any, action);

        // Verify that processAction was called with the action
        expect(stateManager.processAction).toHaveBeenCalledWith(action);
      }
    });

    it('should handle getState requests through IPC', () => {
      const stateManager = createMockStateManager();
      createCoreBridge(stateManager);

      // Get the getState handler registered with ipcMain.handle
      const handleCalls = vi.mocked(ipcMain.handle).mock.calls;
      const getStateHandler = handleCalls.find((call) => call[0] === IpcChannel.GET_STATE)?.[1];
      expect(getStateHandler).toBeDefined();

      if (getStateHandler) {
        const result = getStateHandler({} as any);
        expect(stateManager.getState).toHaveBeenCalled();
        expect(result).toEqual({ counter: 0 });
      }
    });

    it('should subscribe to state changes and broadcast updates', () => {
      const stateManager = createMockStateManager();
      createCoreBridge(stateManager);

      expect(stateManager.subscribe).toHaveBeenCalled();
      expect(windowsUtils.safelySendToWindow).toHaveBeenCalled();
    });

    it('should add new windows to tracking and send initial state', () => {
      const stateManager = createMockStateManager();
      const bridge = createCoreBridge(stateManager);
      const wrapper = createMockWrapper();

      vi.clearAllMocks(); // Clear previous calls

      bridge.subscribe([wrapper]);

      expect(windowsUtils.getWebContents).toHaveBeenCalled();
      expect(windowsUtils.safelySendToWindow).toHaveBeenCalledWith(expect.anything(), IpcChannel.SUBSCRIBE, {
        counter: 0,
      });
    });

    it('should unsubscribe specific windows', () => {
      const stateManager = createMockStateManager();
      const mockTracker = createMockTracker();
      vi.mocked(windowsUtils.createWebContentsTracker).mockReturnValue(mockTracker);

      const bridge = createCoreBridge(stateManager);
      const wrapper = createMockWrapper();

      // Reset mock calls from initialization
      vi.clearAllMocks();

      // Mock the getWebContents to return a valid WebContents
      const webContents = createMockWebContents();
      vi.mocked(windowsUtils.getWebContents).mockReturnValue(webContents);

      bridge.unsubscribe([wrapper]);

      expect(windowsUtils.getWebContents).toHaveBeenCalledWith(wrapper);
      expect(mockTracker.untrack).toHaveBeenCalledWith(webContents);
    });

    it('should unsubscribe all windows when called without arguments', () => {
      const stateManager = createMockStateManager();
      const mockTracker = createMockTracker();
      vi.mocked(windowsUtils.createWebContentsTracker).mockReturnValue(mockTracker);

      const bridge = createCoreBridge(stateManager);

      // Reset mock calls from initialization
      vi.clearAllMocks();

      bridge.unsubscribe();

      expect(mockTracker.cleanup).toHaveBeenCalled();
    });

    it('should clean up resources when destroy is called', async () => {
      const stateManager = createMockStateManager();
      const unsubscribeMock = vi.fn();
      vi.mocked(stateManager.subscribe).mockReturnValue(unsubscribeMock);

      const bridge = createCoreBridge(stateManager);
      await bridge.destroy();

      // Verify the state manager unsubscribe was called
      expect(unsubscribeMock).toHaveBeenCalled();

      // Verify that tracker cleanup was called
      const mockTracker = vi.mocked(windowsUtils.createWebContentsTracker).mock.results[0].value;
      expect(mockTracker.cleanup).toHaveBeenCalled();
    });

    // Tests for error handling in dispatch handler (lines 43-44)
    it('should handle errors during action processing', () => {
      const stateManager = createMockStateManager();
      vi.mocked(stateManager.processAction).mockImplementation(() => {
        throw new Error('Test error in processAction');
      });

      createCoreBridge(stateManager);

      // Get the dispatch handler registered with ipcMain.on
      const onCalls = vi.mocked(ipcMain.on).mock.calls;
      const dispatchHandler = onCalls.find((call) => call[0] === IpcChannel.DISPATCH)?.[1];

      if (dispatchHandler) {
        const action: Action = { type: 'TEST_ACTION' };
        dispatchHandler({} as any, action);

        expect(console.error).toHaveBeenCalledWith('Error handling dispatch:', expect.any(Error));
      }
    });

    // Tests for error handling in getState handler (lines 52-54)
    it('should handle errors during state retrieval', () => {
      const stateManager = createMockStateManager();
      vi.mocked(stateManager.getState).mockImplementation(() => {
        throw new Error('Test error in getState');
      });

      createCoreBridge(stateManager);

      // Get the getState handler registered with ipcMain.handle
      const handleCalls = vi.mocked(ipcMain.handle).mock.calls;
      const getStateHandler = handleCalls.find((call) => call[0] === IpcChannel.GET_STATE)?.[1];

      if (getStateHandler) {
        const result = getStateHandler({} as any);

        expect(console.error).toHaveBeenCalledWith('Error handling getState:', expect.any(Error));
        expect(result).toEqual({});
      }
    });

    // Tests for error handling in state subscription (lines 62-63)
    it('should handle errors in state subscription handler', () => {
      const stateManager = createMockStateManager();
      const mockTracker = createMockTracker();

      // Create an error in the activeWebContents getter
      mockTracker.getActiveWebContents.mockImplementation(() => {
        throw new Error('Test error in getActiveWebContents');
      });

      vi.mocked(windowsUtils.createWebContentsTracker).mockReturnValue(mockTracker);

      createCoreBridge(stateManager);

      // Manually trigger the subscription callback with a dummy state update
      const subscribeCallback = vi.mocked(stateManager.subscribe).mock.calls[0][0];
      subscribeCallback({ test: 'value' });

      expect(console.error).toHaveBeenCalledWith('Error in state subscription handler:', expect.any(Error));
    });

    // Tests for no active windows (line 77)
    it('should not send updates when there are no active windows', () => {
      const stateManager = createMockStateManager();
      const mockTracker = createMockTracker();

      // Return empty array for active IDs
      mockTracker.getActiveIds.mockReturnValue([]);

      vi.mocked(windowsUtils.createWebContentsTracker).mockReturnValue(mockTracker);

      createCoreBridge(stateManager);

      // Reset the safelySendToWindow mock to track calls after setup
      vi.mocked(windowsUtils.safelySendToWindow).mockClear();

      // Manually trigger the subscription callback
      const subscribeCallback = vi.mocked(stateManager.subscribe).mock.calls[0][0];
      subscribeCallback({ test: 'value' });

      // Verify that safelySendToWindow was not called
      expect(windowsUtils.safelySendToWindow).not.toHaveBeenCalled();
    });

    // Tests for invalid input to subscribe (lines 86-87)
    it('should handle null or non-array input to subscribe', () => {
      const stateManager = createMockStateManager();
      const bridge = createCoreBridge(stateManager);

      // Test with null
      const result1 = bridge.subscribe(null as any);
      expect(result1).toHaveProperty('unsubscribe');
      expect(typeof result1.unsubscribe).toBe('function');

      // Test with non-array
      const result2 = bridge.subscribe({} as any);
      expect(result2).toHaveProperty('unsubscribe');
      expect(typeof result2.unsubscribe).toBe('function');

      // Both should be no-op functions
      result1.unsubscribe();
      result2.unsubscribe();
    });

    // Tests for skipping invalid WebContents (lines 93-94)
    it('should skip destroyed WebContents when subscribing', () => {
      const stateManager = createMockStateManager();
      const mockTracker = createMockTracker();
      vi.mocked(windowsUtils.createWebContentsTracker).mockReturnValue(mockTracker);

      const bridge = createCoreBridge(stateManager);
      const wrapper = createMockWrapper();

      // Make getWebContents return a valid WebContents but mark it as destroyed
      const webContents = createMockWebContents();
      vi.mocked(windowsUtils.getWebContents).mockReturnValue(webContents);
      vi.mocked(windowsUtils.isDestroyed).mockReturnValue(true);

      // Reset tracking
      vi.clearAllMocks();

      bridge.subscribe([wrapper]);

      // The tracker.track should not be called because WebContents is destroyed
      expect(windowsUtils.getWebContents).toHaveBeenCalled();
      expect(windowsUtils.isDestroyed).toHaveBeenCalled();
      expect(mockTracker.track).not.toHaveBeenCalled();
    });

    // Tests for unsubscribe function returned by subscribe (lines 109-112)
    it('should unsubscribe only the WebContents added by subscribe', () => {
      const stateManager = createMockStateManager();
      const mockTracker = createMockTracker();
      vi.mocked(windowsUtils.createWebContentsTracker).mockReturnValue(mockTracker);

      const bridge = createCoreBridge(stateManager);
      const wrapper1 = createMockWrapper(1);
      const wrapper2 = createMockWrapper(2);

      // Make sure track returns true to add to addedWebContents
      mockTracker.track.mockReturnValue(true);

      // Reset tracking
      vi.clearAllMocks();

      // Now we will track specific webContents
      const webContents1 = createMockWebContents(1);
      const webContents2 = createMockWebContents(2);

      // First webContents from wrapper1
      vi.mocked(windowsUtils.getWebContents).mockReturnValueOnce(webContents1);

      // Second webContents from wrapper2
      vi.mocked(windowsUtils.getWebContents).mockReturnValueOnce(webContents2);

      const subscription = bridge.subscribe([wrapper1, wrapper2]);

      // Clear mocks to test unsubscribe
      vi.clearAllMocks();

      // Now call the returned unsubscribe function
      subscription.unsubscribe();

      // Should have untracked exactly both webContents
      expect(mockTracker.untrack).toHaveBeenCalledTimes(2);
      expect(mockTracker.untrack).toHaveBeenCalledWith(webContents1);
      expect(mockTracker.untrack).toHaveBeenCalledWith(webContents2);
    });
  });

  describe('createBridgeFromStore', () => {
    it('should create a state manager from a Zustand store', () => {
      const store = createMockZustandStore();
      const stateManager = createMockStateManager();

      vi.mocked(registryModule.getStateManager).mockReturnValue(stateManager);

      createBridgeFromStore(store);

      expect(registryModule.getStateManager).toHaveBeenCalledWith(store, undefined);
    });

    it('should create a state manager from a Redux store', () => {
      const store = createMockReduxStore();
      const stateManager = createMockStateManager();

      vi.mocked(registryModule.getStateManager).mockReturnValue(stateManager);

      createBridgeFromStore(store);

      expect(registryModule.getStateManager).toHaveBeenCalledWith(store, undefined);
    });

    it('should pass options to the state manager factory', () => {
      const store = createMockZustandStore();
      const stateManager = createMockStateManager();
      const options: ZustandOptions<AnyState> = {
        exposeState: true,
        handlers: {
          testAction: vi.fn(),
        },
      };

      vi.mocked(registryModule.getStateManager).mockReturnValue(stateManager);

      createBridgeFromStore(store, [], options);

      expect(registryModule.getStateManager).toHaveBeenCalledWith(store, options);
    });

    it('should initialize with provided windows', () => {
      const store = createMockZustandStore();
      const stateManager = createMockStateManager();
      const wrapper = createMockWrapper();

      vi.mocked(registryModule.getStateManager).mockReturnValue(stateManager);

      createBridgeFromStore(store, [wrapper]);

      expect(windowsUtils.prepareWebContents).toHaveBeenCalledWith([wrapper]);
    });
  });
});
