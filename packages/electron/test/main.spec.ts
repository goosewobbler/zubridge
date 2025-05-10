import { vi } from 'vitest';

// Mock dependencies using vi.mock before any imports
vi.mock('../src/bridge', () => {
  const mockCoreBridge = {
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
    destroy: vi.fn(),
    getSubscribedWindows: vi.fn().mockReturnValue([1, 2, 3]),
  };

  return {
    createBridgeFromStore: vi.fn().mockReturnValue(mockCoreBridge),
    createCoreBridge: vi.fn().mockReturnValue(mockCoreBridge),
  };
});

vi.mock('../src/main/dispatch.js', () => ({
  createDispatch: vi.fn().mockReturnValue(() => {}),
}));

vi.mock('../src/lib/stateManagerRegistry', () => ({
  getStateManager: vi.fn(),
  removeStateManager: vi.fn(),
}));

// Now import everything else
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { BrowserWindow } from 'electron';
import type { AnyState, StateManager } from '@zubridge/types';
import type { StoreApi } from 'zustand/vanilla';
import type { Store } from 'redux';
import * as main from '../src/main';
import * as bridge from '../src/bridge';
import { createDispatch } from '../src/main/dispatch.js';
import { getStateManager, removeStateManager } from '../src/lib/stateManagerRegistry';
import { ZustandOptions } from '../src/adapters/zustand';

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
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('createZustandBridge', () => {
    it.skip('should create a bridge from a Zustand store', () => {
      // Arrange
      const store = createMockStore();
      const windows = [createMockWindow(1)];
      const options: ZustandOptions<AnyState> = { handlers: {} };

      // Act
      const bridge = main.createZustandBridge(store, windows, options);

      // Assert
      expect(bridge.createBridgeFromStore).toHaveBeenCalledWith(store, windows, options);
      expect(createDispatch).toHaveBeenCalledWith(store, options);
      expect(bridge).toHaveProperty('subscribe');
      expect(bridge).toHaveProperty('unsubscribe');
      expect(bridge).toHaveProperty('getSubscribedWindows');
      expect(bridge).toHaveProperty('dispatch');
      expect(bridge).toHaveProperty('destroy');
    });

    it.skip('should cleanup state manager when destroyed', () => {
      // Arrange
      const store = createMockStore();
      const bridge = main.createZustandBridge(store);
      const mockBridgeFromModule = vi.mocked(bridge.createBridgeFromStore).mock.results[0].value;

      // Act
      bridge.destroy();

      // Assert
      expect(mockBridgeFromModule.destroy).toHaveBeenCalled();
      expect(removeStateManager).toHaveBeenCalledWith(store);
    });
  });

  describe('createReduxBridge', () => {
    it.skip('should create a bridge from a Redux store', () => {
      // Arrange
      const store = createMockReduxStore();
      const windows = [createMockWindow(1)];
      const options = {};

      // Act
      const bridge = main.createReduxBridge(store, windows, options);

      // Assert
      expect(bridge.createBridgeFromStore).toHaveBeenCalledWith(store, windows, options);
      expect(createDispatch).toHaveBeenCalledWith(store, options);
      expect(bridge).toHaveProperty('subscribe');
      expect(bridge).toHaveProperty('unsubscribe');
      expect(bridge).toHaveProperty('getSubscribedWindows');
      expect(bridge).toHaveProperty('dispatch');
      expect(bridge).toHaveProperty('destroy');
    });

    it.skip('should cleanup state manager when destroyed', () => {
      // Arrange
      const store = createMockReduxStore();
      const bridge = main.createReduxBridge(store);
      const mockBridgeFromModule = vi.mocked(bridge.createBridgeFromStore).mock.results[0].value;

      // Act
      bridge.destroy();

      // Assert
      expect(mockBridgeFromModule.destroy).toHaveBeenCalled();
      expect(removeStateManager).toHaveBeenCalledWith(store);
    });
  });

  describe('integration tests', () => {
    it('should initialize Zustand bridge with store and a window', () => {
      // Arrange
      const store = createMockStore();
      const window = createMockWindow(1);
      const mockBridge = createMockBridge();

      // Mock the bridge creation properly
      vi.mocked(bridge.createBridgeFromStore).mockImplementation(() => ({
        subscribe: mockBridge.subscribe,
        unsubscribe: mockBridge.unsubscribe,
        destroy: mockBridge.destroy,
        getSubscribedWindows: mockBridge.getSubscribedWindows,
      }));

      // Act
      const bridge2 = main.createZustandBridge(store, [window]);

      // Assert
      expect(bridge.createBridgeFromStore).toHaveBeenCalledWith(store, [window], undefined);
      expect(createDispatch).toHaveBeenCalledWith(store, undefined);
      expect(bridge2.getSubscribedWindows()).toEqual([1, 2, 3]);
    });

    it('should initialize Redux bridge with store and a window', () => {
      // Arrange
      const store = createMockReduxStore();
      const window = createMockWindow(1);
      const mockBridge = createMockBridge();

      // Mock the bridge creation properly
      vi.mocked(bridge.createBridgeFromStore).mockImplementation(() => ({
        subscribe: mockBridge.subscribe,
        unsubscribe: mockBridge.unsubscribe,
        destroy: mockBridge.destroy,
        getSubscribedWindows: mockBridge.getSubscribedWindows,
      }));

      // Act
      const bridge2 = main.createReduxBridge(store, [window]);

      // Assert
      expect(bridge.createBridgeFromStore).toHaveBeenCalledWith(store, [window], undefined);
      expect(createDispatch).toHaveBeenCalledWith(store, undefined);
      expect(bridge2.getSubscribedWindows()).toEqual([1, 2, 3]);
    });
  });
});
