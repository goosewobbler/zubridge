import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BrowserWindow } from 'electron';
import type { AnyState, StateManager } from '@zubridge/types';
import type { StoreApi } from 'zustand/vanilla';
import type { Store } from 'redux';
import { createZustandBridge, createReduxBridge, createDispatch } from '../src/main';
import * as bridgeModule from '../src/bridge';
import * as dispatchModule from '../src/utils/dispatch';
import * as registryModule from '../src/utils/stateManagerRegistry';
import { ZustandOptions } from '../src/adapters/zustand';

// Mock the imported modules
vi.mock('../src/bridge', () => {
  return {
    createCoreBridge: vi.fn(),
    createBridgeFromStore: vi.fn(() => ({
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
      getSubscribedWindows: vi.fn(() => [1, 2, 3]),
      destroy: vi.fn(),
    })),
  };
});

vi.mock('../src/utils/dispatch', () => {
  return {
    createDispatch: vi.fn(() => vi.fn()),
  };
});

vi.mock('../src/utils/stateManagerRegistry', () => {
  return {
    removeStateManager: vi.fn(),
    getStateManager: vi.fn(),
  };
});

// Helper mock functions
function createMockWindow() {
  return {
    webContents: {
      id: 1,
      send: vi.fn(),
      isDestroyed: vi.fn(() => false),
      once: vi.fn(),
      ipc: {
        handle: vi.fn(),
        removeHandler: vi.fn(),
      },
    },
  } as unknown as BrowserWindow;
}

function createMockStore() {
  return {
    getState: vi.fn(() => ({ counter: 0 })),
    setState: vi.fn(),
    subscribe: vi.fn(() => () => {}),
    destroy: vi.fn(),
  } as unknown as StoreApi<AnyState>;
}

function createMockReduxStore() {
  return {
    getState: vi.fn(() => ({ counter: 0 })),
    dispatch: vi.fn(),
    subscribe: vi.fn(() => () => {}),
    replaceReducer: vi.fn(),
    [Symbol.observable]: vi.fn(),
  } as unknown as Store<AnyState>;
}

function createMockBridge() {
  return {
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
    getSubscribedWindows: vi.fn(() => [1, 2, 3]),
    destroy: vi.fn(),
    dispatch: vi.fn(),
  };
}

describe('main.ts exports', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('createZustandBridge', () => {
    it('should create a bridge from a Zustand store', () => {
      // Arrange
      const store = createMockStore();
      const windows = [createMockWindow()];
      const options: ZustandOptions<AnyState> = { handlers: {} };

      // Act
      const bridge = createZustandBridge(store, windows, options);

      // Assert
      expect(bridgeModule.createBridgeFromStore).toHaveBeenCalledWith(store, windows, options);
      expect(dispatchModule.createDispatch).toHaveBeenCalledWith(store, options);
      expect(bridge).toHaveProperty('subscribe');
      expect(bridge).toHaveProperty('unsubscribe');
      expect(bridge).toHaveProperty('getSubscribedWindows');
      expect(bridge).toHaveProperty('dispatch');
      expect(bridge).toHaveProperty('destroy');
    });

    it('should provide default empty array for windows', () => {
      // Arrange
      const store = createMockStore();

      // Act
      createZustandBridge(store);

      // Assert
      expect(bridgeModule.createBridgeFromStore).toHaveBeenCalledWith(store, [], undefined);
    });

    it('should cleanup state manager when destroyed', () => {
      // Arrange
      const store = createMockStore();
      const bridge = createZustandBridge(store);
      const mockBridgeFromModule = vi.mocked(bridgeModule.createBridgeFromStore).mock.results[0].value;

      // Act
      bridge.destroy();

      // Assert
      expect(mockBridgeFromModule.destroy).toHaveBeenCalled();
      expect(registryModule.removeStateManager).toHaveBeenCalledWith(store);
    });
  });

  describe('createReduxBridge', () => {
    it('should create a bridge from a Redux store', () => {
      // Arrange
      const store = createMockReduxStore();
      const windows = [createMockWindow()];
      const options = {};

      // Act
      const bridge = createReduxBridge(store, windows, options);

      // Assert
      expect(bridgeModule.createBridgeFromStore).toHaveBeenCalledWith(store, windows, options);
      expect(dispatchModule.createDispatch).toHaveBeenCalledWith(store, options);
      expect(bridge).toHaveProperty('subscribe');
      expect(bridge).toHaveProperty('unsubscribe');
      expect(bridge).toHaveProperty('getSubscribedWindows');
      expect(bridge).toHaveProperty('dispatch');
      expect(bridge).toHaveProperty('destroy');
    });

    it('should provide default empty array for windows', () => {
      // Arrange
      const store = createMockReduxStore();

      // Act
      createReduxBridge(store);

      // Assert
      expect(bridgeModule.createBridgeFromStore).toHaveBeenCalledWith(store, [], undefined);
    });

    it('should cleanup state manager when destroyed', () => {
      // Arrange
      const store = createMockReduxStore();
      const bridge = createReduxBridge(store);
      const mockBridgeFromModule = vi.mocked(bridgeModule.createBridgeFromStore).mock.results[0].value;

      // Act
      bridge.destroy();

      // Assert
      expect(mockBridgeFromModule.destroy).toHaveBeenCalled();
      expect(registryModule.removeStateManager).toHaveBeenCalledWith(store);
    });
  });

  describe('integration tests', () => {
    it('should initialize Zustand bridge with store and a window', () => {
      // Arrange
      const store = createMockStore();
      const window = createMockWindow();
      const mockBridge = createMockBridge();

      vi.mocked(bridgeModule.createBridgeFromStore).mockReturnValueOnce({
        subscribe: mockBridge.subscribe,
        unsubscribe: mockBridge.unsubscribe,
        getSubscribedWindows: mockBridge.getSubscribedWindows,
        destroy: mockBridge.destroy,
      });

      const createDispatchSpy = vi.spyOn(dispatchModule, 'createDispatch');

      // Act
      const bridge = createZustandBridge(store, [window]);

      // Assert
      expect(bridgeModule.createBridgeFromStore).toHaveBeenCalledWith(store, [window], undefined);
      expect(createDispatchSpy).toHaveBeenCalledWith(store, undefined);
      expect(bridge.getSubscribedWindows()).toEqual([1, 2, 3]);
    });

    it('should initialize Redux bridge with store and a window', () => {
      // Arrange
      const store = createMockReduxStore();
      const window = createMockWindow();
      const mockBridge = createMockBridge();

      vi.mocked(bridgeModule.createBridgeFromStore).mockReturnValueOnce({
        subscribe: mockBridge.subscribe,
        unsubscribe: mockBridge.unsubscribe,
        getSubscribedWindows: mockBridge.getSubscribedWindows,
        destroy: mockBridge.destroy,
      });

      const createDispatchSpy = vi.spyOn(dispatchModule, 'createDispatch');

      // Act
      const bridge = createReduxBridge(store, [window]);

      // Assert
      expect(bridgeModule.createBridgeFromStore).toHaveBeenCalledWith(store, [window], undefined);
      expect(createDispatchSpy).toHaveBeenCalledWith(store, undefined);
      expect(bridge.getSubscribedWindows()).toEqual([1, 2, 3]);
    });
  });
});
