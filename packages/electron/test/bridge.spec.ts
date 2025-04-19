import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ipcMain } from 'electron';
import type { BrowserWindow, WebContents } from 'electron';
import type { AnyState, StateManager, WebContentsWrapper } from '@zubridge/types';
import type { StoreApi } from 'zustand/vanilla';
import type { Store } from 'redux';
import { createCoreBridge, createBridgeFromStore } from '../src/bridge';
import * as registryModule from '../src/utils/stateManagerRegistry';
import { IpcChannel } from '../src/constants';

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

// Helper mock functions
function createMockWebContents(id = 1): WebContentsWrapper {
  return {
    id,
    send: vi.fn(),
    isDestroyed: vi.fn(() => false),
    isLoading: vi.fn(() => false),
    once: vi.fn((event, callback) => {
      if (event === 'did-finish-load') {
        callback();
      }
      return { dispose: vi.fn() };
    }),
    webContents: {
      id,
      send: vi.fn(),
      isDestroyed: vi.fn(() => false),
      once: vi.fn(),
    },
    ipc: {
      handle: vi.fn(),
      removeHandler: vi.fn(),
    },
  } as unknown as WebContentsWrapper;
}

function createMockBrowserWindow(id = 1): BrowserWindow {
  const webContents = createMockWebContents(id);
  return {
    webContents,
    isDestroyed: vi.fn(() => false),
  } as unknown as BrowserWindow;
}

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

function createMockZustandStore(): StoreApi<AnyState> {
  return {
    getState: vi.fn(() => ({ counter: 0 })),
    setState: vi.fn(),
    subscribe: vi.fn(() => () => {}),
  } as unknown as StoreApi<AnyState>;
}

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
  });

  describe('getWebContentsId (internal function)', () => {
    // We can test this indirectly through createCoreBridge
    it('should extract WebContents ID from BrowserWindow', () => {
      const stateManager = createMockStateManager();
      const browserWindow = createMockBrowserWindow();
      // Pass the window in construction for proper setup
      const bridge = createCoreBridge(stateManager, [browserWindow]);

      expect(bridge.getSubscribedWindows()).toEqual([1]);
    });

    it('should handle WebContents object', () => {
      // For this test, we'll just verify that a WebContents object used with subscribe()
      // doesn't throw an error when we try to use it with the bridge
      const stateManager = createMockStateManager();
      const webContents = createMockWebContents();

      // Create an empty bridge and then subscribe the webContents
      const bridge = createCoreBridge(stateManager);

      // This shouldn't throw
      expect(() => {
        bridge.subscribe([webContents]);
      }).not.toThrow();
    });
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

    it('should not subscribe any windows when none are provided', () => {
      const stateManager = createMockStateManager();
      const bridge = createCoreBridge(stateManager);

      expect(bridge.getSubscribedWindows()).toEqual([]);
    });

    it('should subscribe provided windows', () => {
      const stateManager = createMockStateManager();
      const browserWindow = createMockBrowserWindow();

      // Pass window directly during creation
      createCoreBridge(stateManager, [browserWindow]);

      // In the actual implementation, ipcMain.handle is used instead of webContents.ipc.handle
      expect(ipcMain.handle).toHaveBeenCalledWith(IpcChannel.GET_STATE, expect.any(Function));
      expect(ipcMain.on).toHaveBeenCalledWith(IpcChannel.DISPATCH, expect.any(Function));
      expect(browserWindow.webContents.send).toHaveBeenCalled();
    });

    it('should handle multiple windows', () => {
      const stateManager = createMockStateManager();
      const browserWindow1 = createMockBrowserWindow(1);
      const browserWindow2 = createMockBrowserWindow(2);

      // Pass windows directly during creation
      const bridge = createCoreBridge(stateManager, [browserWindow1, browserWindow2]);

      expect(bridge.getSubscribedWindows()).toEqual([1, 2]);
      expect(browserWindow1.webContents.send).toHaveBeenCalled();
      expect(browserWindow2.webContents.send).toHaveBeenCalled();
    });

    it('should skip destroyed web contents', () => {
      const stateManager = createMockStateManager();
      const browserWindow = createMockBrowserWindow();

      // Mock the window as destroyed
      vi.mocked(browserWindow.webContents.isDestroyed).mockReturnValue(true);

      // Pass window directly during creation
      const bridge = createCoreBridge(stateManager, [browserWindow]);

      // Window ID still might be in the set, but operations shouldn't be performed on it
      expect(browserWindow.webContents.send).not.toHaveBeenCalled();
    });

    it('should subscribe to state changes', () => {
      const stateManager = createMockStateManager();
      const browserWindow = createMockBrowserWindow();

      // Get a direct reference to the mock send function
      const sendMock = browserWindow.webContents.send;

      createCoreBridge(stateManager, [browserWindow]);

      expect(stateManager.subscribe).toHaveBeenCalled();
      expect(sendMock).toHaveBeenCalled();
    });

    it('should handle new windows subscription', () => {
      const stateManager = createMockStateManager();
      const bridge = createCoreBridge(stateManager);

      // Initially no windows
      expect(bridge.getSubscribedWindows()).toEqual([]);

      // Subscribe a new window
      const browserWindow = createMockBrowserWindow();
      bridge.subscribe([browserWindow]);

      expect(bridge.getSubscribedWindows()).toEqual([1]);
      expect(browserWindow.webContents.send).toHaveBeenCalled();
    });

    it('should handle window unsubscription', () => {
      const stateManager = createMockStateManager();
      const browserWindow1 = createMockBrowserWindow(1);
      const browserWindow2 = createMockBrowserWindow(2);

      // Create bridge with windows directly
      const bridge = createCoreBridge(stateManager, [browserWindow1, browserWindow2]);

      expect(bridge.getSubscribedWindows()).toEqual([1, 2]);

      // Unsubscribe one window
      bridge.unsubscribe([browserWindow1]);

      expect(bridge.getSubscribedWindows()).toEqual([2]);
    });

    it('should unsubscribe all windows when called without arguments', () => {
      const stateManager = createMockStateManager();
      const browserWindow1 = createMockBrowserWindow(1);
      const browserWindow2 = createMockBrowserWindow(2);

      // Create bridge with windows directly
      const bridge = createCoreBridge(stateManager, [browserWindow1, browserWindow2]);

      expect(bridge.getSubscribedWindows()).toEqual([1, 2]);

      // Unsubscribe all windows
      bridge.unsubscribe();

      expect(bridge.getSubscribedWindows()).toEqual([]);
    });

    it('should clean up all resources when destroy is called', () => {
      const stateManager = createMockStateManager();
      const browserWindow = createMockBrowserWindow();

      // Create bridge with window directly
      const bridge = createCoreBridge(stateManager, [browserWindow]);

      expect(bridge.getSubscribedWindows()).toEqual([1]);

      bridge.destroy();

      expect(bridge.getSubscribedWindows()).toEqual([]);
      expect(ipcMain.removeHandler).toHaveBeenCalledWith(IpcChannel.GET_STATE);
    });

    it('should correctly handle IPC dispatch messages', () => {
      const stateManager = createMockStateManager();
      const browserWindow = createMockBrowserWindow();

      createCoreBridge(stateManager, [browserWindow]);

      // Get the dispatch handler from IPC main (we can't get it directly)
      expect(ipcMain.on).toHaveBeenCalledWith(IpcChannel.DISPATCH, expect.any(Function));

      // Extract the handler from the mock
      const onCalls = vi.mocked(ipcMain.on).mock.calls;
      const dispatchHandler = onCalls.find((call) => call[0] === IpcChannel.DISPATCH)?.[1];

      expect(dispatchHandler).toBeDefined();

      if (dispatchHandler) {
        // Simulate an IPC message
        const action = { type: 'TEST_ACTION', payload: 42 };
        dispatchHandler({} as any, action);

        expect(stateManager.processAction).toHaveBeenCalledWith(action);
      }
    });

    it('should correctly handle IPC get state messages', () => {
      const stateManager = createMockStateManager();
      const browserWindow = createMockBrowserWindow();

      createCoreBridge(stateManager, [browserWindow]);

      // Get the get state handler from IPC main
      expect(ipcMain.handle).toHaveBeenCalledWith(IpcChannel.GET_STATE, expect.any(Function));

      // Extract the handler from the mock
      const handleCalls = vi.mocked(ipcMain.handle).mock.calls;
      const getStateHandler = handleCalls.find((call) => call[0] === IpcChannel.GET_STATE)?.[1];

      expect(getStateHandler).toBeDefined();

      if (getStateHandler) {
        // Simulate an IPC message
        const result = getStateHandler({} as any);

        expect(stateManager.getState).toHaveBeenCalled();
        // The result should contain our counter data after sanitization
        expect(result).toHaveProperty('counter', 0);
      }
    });

    it('should handle errors in processAction', () => {
      const stateManager = createMockStateManager();
      const browserWindow = createMockBrowserWindow();

      // Mock processAction to throw an error
      vi.mocked(stateManager.processAction).mockImplementation(() => {
        throw new Error('Test error');
      });

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      createCoreBridge(stateManager, [browserWindow]);

      // Get the dispatch handler from IPC main
      const onCalls = vi.mocked(ipcMain.on).mock.calls;
      const dispatchHandler = onCalls.find((call) => call[0] === IpcChannel.DISPATCH)?.[1];

      expect(dispatchHandler).toBeDefined();

      if (dispatchHandler) {
        // Simulate an IPC message
        const action = { type: 'TEST_ACTION' };
        dispatchHandler({} as any, action);

        expect(stateManager.processAction).toHaveBeenCalledWith(action);
        expect(consoleSpy).toHaveBeenCalledWith('Error handling dispatch:', expect.any(Error));
      }

      consoleSpy.mockRestore();
    });
  });

  describe('createBridgeFromStore', () => {
    it('should get the state manager for a Zustand store', () => {
      const store = createMockZustandStore();
      const stateManager = createMockStateManager();
      const options = { testOption: true };

      vi.mocked(registryModule.getStateManager).mockReturnValue(stateManager);

      createBridgeFromStore(store, [], options as any);

      expect(registryModule.getStateManager).toHaveBeenCalledWith(store, options);
    });

    it('should get the state manager for a Redux store', () => {
      const store = createMockReduxStore();
      const stateManager = createMockStateManager();
      const options = { testOption: true };

      vi.mocked(registryModule.getStateManager).mockReturnValue(stateManager);

      createBridgeFromStore(store, [], options as any);

      expect(registryModule.getStateManager).toHaveBeenCalledWith(store, options);
    });

    it('should create a core bridge with the state manager', () => {
      const store = createMockZustandStore();
      const stateManager = createMockStateManager();
      const browserWindow = createMockBrowserWindow();

      vi.mocked(registryModule.getStateManager).mockReturnValue(stateManager);

      // Create bridge with window directly
      const bridge = createBridgeFromStore(store, [browserWindow]);

      expect(bridge.getSubscribedWindows()).toEqual([1]);
      expect(browserWindow.webContents.send).toHaveBeenCalled();
    });
  });
});
