import { vi } from 'vitest';

// Mock dependencies using vi.mock before any imports
vi.mock('../src/bridge', () => {
  const mockCoreBridge = {
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
    destroy: vi.fn(),
    getSubscribedWindows: vi.fn().mockReturnValue([1, 2, 3]),
    getWindowSubscriptions: vi.fn().mockReturnValue(['*']),
  };

  return {
    createBridgeFromStore: vi.fn().mockReturnValue(mockCoreBridge),
    createCoreBridge: vi.fn().mockReturnValue(mockCoreBridge),
  };
});

vi.mock('../src/main/dispatch.js', () => ({
  createDispatch: vi.fn().mockReturnValue(vi.fn()),
}));

vi.mock('../src/registry/stateManagerRegistry', () => ({
  getStateManager: vi.fn(),
  removeStateManager: vi.fn(),
}));

import type { AnyState } from '@zubridge/types';
import type { BrowserWindow } from 'electron';
import type { Store } from 'redux';
// Now import everything else
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { StoreApi } from 'zustand/vanilla';
import * as bridge from '../src/bridge';
import { removeStateManager } from '../src/registry/stateManagerRegistry';
import * as main from '../src/main';
import { createDispatch } from '../src/main/dispatch.js';

// Helper mock functions
function createMockWindow(id: number) {
  return {
    webContents: {
      id: id,
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

function _createMockBridge() {
  return {
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
    getSubscribedWindows: vi.fn(() => [1, 2, 3]),
    destroy: vi.fn(),
    dispatch: vi.fn(),
  };
}

// Helper to create a mock core bridge for tests
function createMockCoreBridge() {
  return {
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
    getSubscribedWindows: vi.fn(() => [1, 2, 3]),
    destroy: vi.fn(),
    getWindowSubscriptions: vi.fn().mockReturnValue(['*']),
  };
}

describe('main.ts exports', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('createZustandBridge', () => {
    it('should create a bridge from a Zustand store', () => {
      // Arrange
      const store = createMockStore();
      const options = {};

      // Set up the mock to return a valid core bridge
      const mockCoreBridge = createMockCoreBridge();
      vi.mocked(bridge.createBridgeFromStore).mockReturnValue(mockCoreBridge);

      // Act
      const zustandBridge = main.createZustandBridge(store, options);

      // Assert
      expect(vi.mocked(bridge.createBridgeFromStore)).toHaveBeenCalledWith(store, options);
      expect(createDispatch).toHaveBeenCalledWith(store, options);
      expect(zustandBridge).toHaveProperty('subscribe');
      expect(zustandBridge).toHaveProperty('unsubscribe');
      expect(zustandBridge).toHaveProperty('getSubscribedWindows');
      expect(zustandBridge).toHaveProperty('dispatch');
      expect(zustandBridge).toHaveProperty('destroy');
    });

    it('should cleanup state manager when destroyed', () => {
      // Arrange
      const store = createMockStore();
      const mockCoreBridge = createMockCoreBridge();
      vi.mocked(bridge.createBridgeFromStore).mockReturnValue(mockCoreBridge);

      const zustandBridge = main.createZustandBridge(store);

      // Act
      zustandBridge.destroy();

      // Assert
      expect(mockCoreBridge.destroy).toHaveBeenCalled();
      expect(removeStateManager).toHaveBeenCalledWith(store);
    });

    it('should create bridge with custom options', () => {
      // Arrange
      const store = createMockStore();
      const options = {
        middleware: {
          processAction: vi.fn(),
          setState: vi.fn(),
        },
      };
      const mockCoreBridge = createMockCoreBridge();
      vi.mocked(bridge.createBridgeFromStore).mockReturnValue(mockCoreBridge);

      // Act
      const zustandBridge = main.createZustandBridge(store, options);

      // Assert
      expect(vi.mocked(bridge.createBridgeFromStore)).toHaveBeenCalledWith(store, options);
      expect(createDispatch).toHaveBeenCalledWith(store, options);
      expect(zustandBridge.getSubscribedWindows()).toEqual([1, 2, 3]);
    });

    it('should allow subscribing to windows after creation', () => {
      // Arrange
      const store = createMockStore();
      const window = createMockWindow(1);
      const mockCoreBridge = createMockCoreBridge();
      vi.mocked(bridge.createBridgeFromStore).mockReturnValue(mockCoreBridge);

      // Act
      const zustandBridge = main.createZustandBridge(store);
      zustandBridge.subscribe([window]);

      // Assert
      expect(mockCoreBridge.subscribe).toHaveBeenCalledWith([window]);
    });
  });

  describe('createReduxBridge', () => {
    it('should create a bridge from a Redux store', () => {
      // Arrange
      const store = createMockReduxStore();
      const options = {};
      const mockCoreBridge = createMockCoreBridge();
      vi.mocked(bridge.createBridgeFromStore).mockReturnValue(mockCoreBridge);

      // Act
      const reduxBridge = main.createReduxBridge(store, options);

      // Assert
      expect(vi.mocked(bridge.createBridgeFromStore)).toHaveBeenCalledWith(store, options);
      expect(createDispatch).toHaveBeenCalledWith(store, options);
      expect(reduxBridge).toHaveProperty('subscribe');
      expect(reduxBridge).toHaveProperty('unsubscribe');
      expect(reduxBridge).toHaveProperty('getSubscribedWindows');
      expect(reduxBridge).toHaveProperty('dispatch');
      expect(reduxBridge).toHaveProperty('destroy');
    });

    it('should cleanup state manager when destroyed', () => {
      // Arrange
      const store = createMockReduxStore();
      const mockCoreBridge = createMockCoreBridge();
      vi.mocked(bridge.createBridgeFromStore).mockReturnValue(mockCoreBridge);

      const reduxBridge = main.createReduxBridge(store);

      // Act
      reduxBridge.destroy();

      // Assert
      expect(mockCoreBridge.destroy).toHaveBeenCalled();
      expect(removeStateManager).toHaveBeenCalledWith(store);
    });
  });

  describe('integration tests', () => {
    it('should initialize Zustand bridge with store and a window', () => {
      // Arrange
      const store = createMockStore();
      const window = createMockWindow(1);
      const mockCoreBridge = createMockCoreBridge();
      vi.mocked(bridge.createBridgeFromStore).mockReturnValue(mockCoreBridge);

      // Act
      const zustandBridge = main.createZustandBridge(store);
      zustandBridge.subscribe([window]);

      // Assert
      expect(vi.mocked(bridge.createBridgeFromStore)).toHaveBeenCalledWith(store, undefined);
      expect(createDispatch).toHaveBeenCalledWith(store, undefined);
      expect(mockCoreBridge.subscribe).toHaveBeenCalledWith([window]);
      expect(zustandBridge.getSubscribedWindows()).toEqual([1, 2, 3]);
    });

    it('should initialize Redux bridge with store and a window', () => {
      // Arrange
      const store = createMockReduxStore();
      const window = createMockWindow(1);
      const mockCoreBridge = createMockCoreBridge();
      vi.mocked(bridge.createBridgeFromStore).mockReturnValue(mockCoreBridge);

      // Act
      const reduxBridge = main.createReduxBridge(store);
      reduxBridge.subscribe([window]);

      // Assert
      expect(vi.mocked(bridge.createBridgeFromStore)).toHaveBeenCalledWith(store, undefined);
      expect(createDispatch).toHaveBeenCalledWith(store, undefined);
      expect(mockCoreBridge.subscribe).toHaveBeenCalledWith([window]);
      expect(reduxBridge.getSubscribedWindows()).toEqual([1, 2, 3]);
    });
  });
});
