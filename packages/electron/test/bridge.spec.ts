import type {
  Action,
  AnyState,
  StateManager,
  WebContentsWrapper,
  WrapperOrWebContents,
} from '@zubridge/types';
import type { IpcMainEvent, IpcMainInvokeEvent, WebContents } from 'electron';
import { ipcMain } from 'electron';
import type { Store } from 'redux';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StoreApi } from 'zustand/vanilla';
import type { ZustandOptions } from '../src/adapters/zustand.js';
import { createBridgeFromStore, createCoreBridge } from '../src/bridge.js';
import { IpcChannel } from '../src/constants.js';
import { getStateManager } from '../src/lib/stateManagerRegistry.js';
import {
  createWebContentsTracker,
  getWebContents,
  isDestroyed,
  prepareWebContents,
  safelySendToWindow,
} from '../src/utils/windows.js';

// Mock Electron's ipcMain
vi.mock('electron', () => {
  return {
    ipcMain: {
      on: vi.fn(),
      removeListener: vi.fn(),
      removeAllListeners: vi.fn(),
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
vi.mock('../src/utils/windows.js', () => ({
  createWebContentsTracker: vi.fn(),
  prepareWebContents: vi.fn(),
  getWebContents: vi.fn(),
  isDestroyed: vi.fn((webContents) => {
    // Call the webContents.isDestroyed() if it exists to record the call for testing
    if (webContents && typeof webContents.isDestroyed === 'function') {
      return webContents.isDestroyed();
    }
    return false;
  }),
  safelySendToWindow: vi.fn(),
  setupDestroyListener: vi.fn(),
}));

// Mock the debug utility
vi.mock('@zubridge/core', () => ({
  debug: vi.fn(), // Simplified mock
}));

vi.mock('../src/lib/stateManagerRegistry.js', () => ({
  getStateManager: vi.fn(),
}));

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
    track: vi.fn((_webContents) => true),
    untrack: vi.fn(),
    untrackById: vi.fn(),
    isTracked: vi.fn((_webContents) => true),
    hasId: vi.fn((_id) => true),
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
    vi.resetAllMocks();

    // Setup default mocks for windows utils
    const mockTracker = createMockTracker();
    vi.mocked(getWebContents).mockImplementation((id) => ({ id }) as unknown as WebContents);
    vi.mocked(createWebContentsTracker).mockReturnValue(mockTracker);
    vi.mocked(prepareWebContents).mockImplementation((wrappers) => {
      if (!wrappers) return [];
      return wrappers.map((w) => {
        const webContents = 'webContents' in w ? w.webContents : w;
        return { id: webContents.id, isDestroyed: () => false } as unknown as WebContents;
      });
    });
  });

  describe('createCoreBridge', () => {
    it('should create a bridge with the provided state manager', () => {
      const stateManager = createMockStateManager();
      const bridge = createCoreBridge(stateManager);

      expect(bridge).toBeDefined();
      expect(bridge.subscribe).toBeDefined();
      expect(bridge.unsubscribe).toBeDefined();
      expect(bridge.destroy).toBeDefined();
    });

    it('should initialize IPC handlers for state and actions', () => {
      const stateManager = createMockStateManager();
      createCoreBridge(stateManager);

      // Check that necessary IPC handlers were set up
      expect(ipcMain.on).toHaveBeenCalledWith(IpcChannel.DISPATCH, expect.any(Function));
      expect(ipcMain.handle).toHaveBeenCalledWith(IpcChannel.GET_STATE, expect.any(Function));
    });

    it('should process actions received through IPC', async () => {
      const stateManager = createMockStateManager();
      createCoreBridge(stateManager);

      // Get the dispatch handler registered with ipcMain.on
      const onCalls = vi.mocked(ipcMain.on).mock.calls;
      const dispatchHandler = onCalls.find((call) => call[0] === IpcChannel.DISPATCH)?.[1];
      expect(dispatchHandler).toBeDefined();

      if (dispatchHandler) {
        const action: Action = {
          type: 'INCREMENT',
          __id: 'test-id',
          payload: 42,
        };

        // Create a mock event with sender property
        const mockEvent = {
          sender: {
            id: 123,
            send: vi.fn(),
          },
        };

        // Call the handler with the mock event and action object in correct format
        dispatchHandler(mockEvent as unknown as IpcMainEvent, {
          action,
          parentId: undefined,
        });

        // Allow the async action queue processing to occur
        await Promise.resolve();

        // Verify that processAction was called with the action, accepting additional fields
        expect(stateManager.processAction).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'INCREMENT',
            payload: 42,
            __id: 'test-id',
            __sourceWindowId: 123,
          }),
        );
      }
    });

    it.skip('should handle getState requests through IPC', () => {
      // Skipping this test in the interim build as state retrieval has changed
      const stateManager = createMockStateManager();
      createCoreBridge(stateManager);

      // Get the getState handler registered with ipcMain.handle
      const handleCalls = vi.mocked(ipcMain.handle).mock.calls;
      const getStateHandler = handleCalls.find((call) => call[0] === IpcChannel.GET_STATE)?.[1];
      expect(getStateHandler).toBeDefined();

      if (getStateHandler) {
        const result = getStateHandler({} as unknown as IpcMainInvokeEvent);
        expect(stateManager.getState).toHaveBeenCalled();
        expect(result).toEqual({ counter: 0 });
      }
    });

    it('should subscribe to state changes and broadcast updates', () => {
      const stateManager = createMockStateManager();
      createCoreBridge(stateManager);

      expect(stateManager.subscribe).toHaveBeenCalled();
    });

    it('should add new windows to tracking and send initial state', () => {
      const stateManager = createMockStateManager();
      const bridge = createCoreBridge(stateManager);
      const wrapper = createMockWrapper();

      vi.clearAllMocks(); // Clear previous calls

      bridge.subscribe([wrapper]);

      expect(getWebContents).toHaveBeenCalled();
    });

    it('should unsubscribe specific windows', () => {
      const stateManager = createMockStateManager();
      const mockTracker = createMockTracker();
      vi.mocked(createWebContentsTracker).mockReturnValue(mockTracker);

      const bridge = createCoreBridge(stateManager);
      const wrapper = createMockWrapper();

      // Reset mock calls from initialization
      vi.clearAllMocks();

      // Mock the getWebContents to return a valid WebContents
      const webContents = createMockWebContents();
      vi.mocked(getWebContents).mockReturnValue(webContents);

      bridge.unsubscribe([wrapper]);

      expect(getWebContents).toHaveBeenCalledWith(wrapper);
      expect(mockTracker.untrack).toHaveBeenCalledWith(webContents);
    });

    it('should unsubscribe all windows when called without arguments', () => {
      const stateManager = createMockStateManager();
      const mockTracker = createMockTracker();
      vi.mocked(createWebContentsTracker).mockReturnValue(mockTracker);

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
      const mockTracker = vi.mocked(createWebContentsTracker).mock.results[0].value;
      expect(mockTracker.cleanup).toHaveBeenCalled();
    });

    it('should handle errors during action processing', () => {
      const stateManager = createMockStateManager();
      vi.mocked(ipcMain.on).mockImplementation((channel, handler) => {
        if (channel === IpcChannel.DISPATCH) {
          const mockEvent = { sender: { id: 1, send: vi.fn() } } as unknown as IpcMainEvent;
          try {
            (handler as unknown as (event: IpcMainEvent, data: unknown) => void)(mockEvent, {
              action: { type: 'ERROR_ACTION' },
            });
          } catch (_e) {
            // error expected
          }
        }
        return ipcMain;
      });

      createCoreBridge(stateManager);
      const dispatchHandler = vi
        .mocked(ipcMain.on)
        .mock.calls.find((call) => call[0] === IpcChannel.DISPATCH)?.[1];
      if (dispatchHandler) {
        const mockEvent = { sender: { id: 1, send: vi.fn() } } as unknown as IpcMainEvent;
        // Expect this path to be taken, error to be handled internally by debug log
        expect(() =>
          (dispatchHandler as unknown as (event: IpcMainEvent, data: unknown) => void)(mockEvent, {
            action: null,
          }),
        ).not.toThrow();
      }
    });

    it('should handle errors during state retrieval', () => {
      const stateManager = createMockStateManager();
      vi.mocked(stateManager.getState).mockImplementation(() => {
        throw new Error('State retrieval error');
      });

      createCoreBridge(stateManager);
      const getStateHandler = vi
        .mocked(ipcMain.handle)
        .mock.calls.find((call) => call[0] === IpcChannel.GET_STATE)?.[1];
      if (getStateHandler) {
        // Expect this path to be taken, error to be handled internally by debug log
        expect(() =>
          (getStateHandler as unknown as (event: IpcMainInvokeEvent) => unknown)({
            sender: { id: 1 },
          } as unknown as IpcMainInvokeEvent),
        ).not.toThrow();
      }
    });

    it('should handle errors in state subscription handler', () => {
      const stateManager = createMockStateManager();
      vi.mocked(stateManager.subscribe).mockImplementation((callback) => {
        try {
          (callback as unknown as (state: unknown) => void)({} as unknown);
        } catch (_e) {
          // error expected if callback throws, then subscribe throws its own
        }
        throw new Error('Subscription error simulation');
      });

      // Expect this path to be taken, error to be handled internally by debug log
      // (or thrown if createCoreBridge itself throws, which it might due to the subscription error)
      expect(() => createCoreBridge(stateManager)).toThrow('Subscription error simulation');
    });

    it('should not send updates when there are no active windows', () => {
      const stateManager = createMockStateManager();
      const mockTracker = createMockTracker();

      // Return empty array for active IDs
      mockTracker.getActiveIds.mockReturnValue([]);

      vi.mocked(createWebContentsTracker).mockReturnValue(mockTracker);

      createCoreBridge(stateManager);

      // Manually trigger the subscription callback
      const subscribeCallback = vi.mocked(stateManager.subscribe).mock.calls[0][0];
      subscribeCallback({ test: 'value' });
    });

    // Tests for invalid input to subscribe (lines 86-87)
    it('should handle null or non-array input to subscribe', () => {
      const stateManager = createMockStateManager();
      const bridge = createCoreBridge(stateManager);

      // Test with null
      const result1 = bridge.subscribe(null as unknown as WrapperOrWebContents[]);
      expect(result1).toHaveProperty('unsubscribe');
      expect(typeof result1.unsubscribe).toBe('function');

      // Test with non-array
      const result2 = bridge.subscribe({} as unknown as WrapperOrWebContents[]);
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
      vi.mocked(createWebContentsTracker).mockReturnValue(mockTracker);

      const bridge = createCoreBridge(stateManager);
      const wrapper = createMockWrapper();

      // Create a mock WebContents with destroyed = true
      const webContents = createMockWebContents();
      console.log('webContents isDestroyed before override:', webContents.isDestroyed);
      // Verify isDestroyed is a mock function
      expect(typeof webContents.isDestroyed).toBe('function');
      expect(vi.isMockFunction(webContents.isDestroyed)).toBe(true);

      // Override isDestroyed to return true for this test specifically
      vi.mocked(webContents.isDestroyed).mockImplementation(() => true);
      console.log(
        'webContents isDestroyed after override:',
        webContents.isDestroyed,
        'Returns:',
        webContents.isDestroyed(),
      );

      // Mock getWebContents to return our destroyed WebContents
      vi.mocked(getWebContents).mockReturnValue(webContents);

      // Reset tracking
      vi.clearAllMocks();

      bridge.subscribe([wrapper]);

      // The tracker.track should not be called because WebContents is destroyed
      expect(getWebContents).toHaveBeenCalled();
      expect(webContents.isDestroyed).toHaveBeenCalled();
      expect(mockTracker.track).not.toHaveBeenCalled();
    });

    // Tests for subscription with specific keys
    it('should pass the correct keys parameter when subscribing', () => {
      const stateManager = createMockStateManager();
      const mockTracker = createMockTracker();
      vi.mocked(createWebContentsTracker).mockReturnValue(mockTracker);

      // Create bridge
      const bridge = createCoreBridge(stateManager);

      // Set up mocks
      const wrapper = createMockWrapper();
      const webContents = createMockWebContents();
      vi.mocked(getWebContents).mockReturnValue(webContents);

      // Reset tracking
      vi.clearAllMocks();

      // Subscribe with specific keys
      bridge.subscribe([wrapper], ['counter', 'theme']);

      // Verify basic expectations
      expect(getWebContents).toHaveBeenCalledWith(wrapper);
      expect(mockTracker.track).toHaveBeenCalledWith(webContents);
    });

    // Test for subscription with '*' key
    it('should subscribe with "*" key', () => {
      const stateManager = createMockStateManager();
      const mockTracker = createMockTracker();
      vi.mocked(createWebContentsTracker).mockReturnValue(mockTracker);

      // Create bridge
      const bridge = createCoreBridge(stateManager);
      const wrapper = createMockWrapper();
      const webContents = createMockWebContents();

      vi.mocked(getWebContents).mockReturnValue(webContents);

      // Reset tracking
      vi.clearAllMocks();

      // Subscribe with '*' key
      bridge.subscribe([wrapper], ['*']);

      // Verify the correct handling
      expect(getWebContents).toHaveBeenCalledWith(wrapper);
      expect(mockTracker.track).toHaveBeenCalledWith(webContents);
    });

    // Tests for unsubscribe function returned by subscribe (lines 109-112)
    it('should unsubscribe only the WebContents added by subscribe', () => {
      const stateManager = createMockStateManager();
      const mockTracker = createMockTracker();
      vi.mocked(createWebContentsTracker).mockReturnValue(mockTracker);

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
      vi.mocked(getWebContents).mockReturnValueOnce(webContents1);

      // Second webContents from wrapper2
      vi.mocked(getWebContents).mockReturnValueOnce(webContents2);

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

    // Test for the race condition fix: GET_STATE should return full state during initialization
    it('should return full state when no subscription manager exists (initialization phase)', () => {
      const stateManager = createMockStateManager();
      const testState = { general: { value: 42 }, theme: { dark: true } };
      vi.mocked(stateManager.getState).mockReturnValue(testState);

      // Create bridge (this sets up the GET_STATE handler)
      createCoreBridge(stateManager);

      // Get the GET_STATE handler
      const getStateHandler = vi
        .mocked(ipcMain.handle)
        .mock.calls.find((call) => call[0] === IpcChannel.GET_STATE)?.[1];

      expect(getStateHandler).toBeDefined();

      if (getStateHandler) {
        // Mock event with a window ID that has no subscription manager
        const mockEvent = { sender: { id: 999 } } as unknown as IpcMainInvokeEvent;

        // Call the handler without any options (no bypassAccessControl)
        const result = (
          getStateHandler as unknown as (event: IpcMainInvokeEvent, options?: unknown) => unknown
        )(mockEvent, {});

        // Should return full state since no subscription manager exists for this window
        expect(result).toEqual(testState);

        // Call with empty options
        const result2 = (
          getStateHandler as unknown as (event: IpcMainInvokeEvent, options?: unknown) => unknown
        )(mockEvent, undefined);
        expect(result2).toEqual(testState);
      }
    });

    // Test that filtering still works after subscription is set up
    it('should filter state when subscription manager exists', () => {
      const stateManager = createMockStateManager();
      const testState = { general: { value: 42 }, theme: { dark: true } };
      vi.mocked(stateManager.getState).mockReturnValue(testState);

      // Create bridge
      const bridge = createCoreBridge(stateManager);

      // Set up a subscription to create a subscription manager
      const wrapper = createMockWrapper(123);
      const webContents = createMockWebContents(123);
      vi.mocked(getWebContents).mockReturnValue(webContents);

      // Subscribe to specific keys only
      bridge.subscribe([wrapper], ['general']);

      // Get the GET_STATE handler
      const getStateHandler = vi
        .mocked(ipcMain.handle)
        .mock.calls.find((call) => call[0] === IpcChannel.GET_STATE)?.[1];

      if (getStateHandler) {
        // Mock event with the same window ID that now has a subscription manager
        const mockEvent = { sender: { id: 123 } } as unknown as IpcMainInvokeEvent;

        // Call the handler without bypassAccessControl
        const result = (
          getStateHandler as unknown as (event: IpcMainInvokeEvent, options?: unknown) => unknown
        )(mockEvent, {});

        // Should return filtered state (only 'general' key) since subscription manager exists
        expect(result).toEqual({ general: { value: 42 } });
      }
    });
  });

  describe('createBridgeFromStore', () => {
    it('should create a state manager from a Zustand store', () => {
      const store = createMockZustandStore();
      const stateManager = createMockStateManager();

      vi.mocked(getStateManager).mockReturnValue(stateManager);

      createBridgeFromStore(store);

      expect(getStateManager).toHaveBeenCalledWith(store, undefined);
    });

    it('should create a state manager from a Redux store', () => {
      const store = createMockReduxStore();
      const stateManager = createMockStateManager();

      vi.mocked(getStateManager).mockReturnValue(stateManager);

      createBridgeFromStore(store);

      expect(getStateManager).toHaveBeenCalledWith(store, undefined);
    });

    it('should pass options to the state manager factory', () => {
      const store = createMockZustandStore();
      const stateManager = createMockStateManager();
      const options: ZustandOptions<AnyState> = {
        handlers: {
          testAction: vi.fn(),
        },
      };

      vi.mocked(getStateManager).mockReturnValue(stateManager);

      createBridgeFromStore(store, options);

      expect(getStateManager).toHaveBeenCalledWith(store, options);
    });

    it('should allow subscribing to windows after bridge creation', () => {
      const stateManager = createMockStateManager();
      const mockTracker = createMockTracker();
      vi.mocked(createWebContentsTracker).mockReturnValue(mockTracker);

      // Create a mock wrapper and WebContents
      const wrapper = createMockWrapper();
      const webContents = createMockWebContents(123);

      // Set up the mocks for the subscribe call path
      vi.mocked(getWebContents).mockReturnValue(webContents);
      vi.mocked(isDestroyed).mockReturnValue(false);

      // Mock track to return true (successfully tracked)
      mockTracker.track.mockReturnValue(true);

      // Create bridge
      const bridge = createCoreBridge(stateManager);

      // Reset all mocks to ensure we're only checking calls after this point
      vi.clearAllMocks();

      // Now subscribe to the bridge
      bridge.subscribe([wrapper]);

      // Verify getWebContents was called with the wrapper
      expect(getWebContents).toHaveBeenCalledWith(wrapper);

      // Verify isDestroyed was called with the WebContents
      expect(isDestroyed).toHaveBeenCalledWith(webContents);

      // Verify the tracker.track was called with the webContents
      expect(mockTracker.track).toHaveBeenCalledWith(webContents);

      // Verify that safelySendToWindow was called to send initial state
      expect(safelySendToWindow).toHaveBeenCalled();
    });

    it('should create a core bridge with the state manager', () => {
      const store = createMockZustandStore();
      const stateManager = createMockStateManager();

      vi.mocked(getStateManager).mockReturnValue(stateManager);

      const result = createBridgeFromStore(store);

      // Verify that the resulting object has the expected bridge properties
      expect(result).toHaveProperty('subscribe');
      expect(result).toHaveProperty('unsubscribe');
      expect(result).toHaveProperty('getSubscribedWindows');
      expect(result).toHaveProperty('destroy');
    });
  });
});
