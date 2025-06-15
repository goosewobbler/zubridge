import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as electron from 'electron';
import { preloadBridge, preloadZustandBridge } from '../src/preload.js';
import { IpcChannel } from '../src/constants.js';
import type { AnyState, Action } from '@zubridge/types';
import type { IpcRendererEvent } from 'electron';

// Mock electron for testing
vi.mock('electron', () => {
  const ipcRenderer = {
    on: vi.fn(),
    send: vi.fn(),
    invoke: vi.fn(),
    removeListener: vi.fn(),
  };

  const contextBridge = {
    exposeInMainWorld: vi.fn(),
  };

  return {
    ipcRenderer,
    contextBridge,
  };
});

beforeEach(() => {
  // @ts-ignore - mocking window properties
  window.__zubridge_windowId = '123';

  // Mock IPC invoke for window ID and state
  vi.mocked(electron.ipcRenderer.invoke).mockImplementation((channel) => {
    if (channel === IpcChannel.GET_WINDOW_ID) {
      return Promise.resolve('123');
    }
    if (channel === IpcChannel.GET_STATE) {
      return Promise.resolve({ counter: 5 });
    }
    return Promise.resolve(undefined);
  });
});

afterEach(() => {
  // @ts-ignore - cleanup mocks
  delete window.__zubridge_windowId;
  delete window.__zubridge_subscriptionValidator;
  vi.clearAllMocks();
});

describe('preloadBridge', () => {
  describe('handlers', () => {
    it('should create handlers with expected methods', () => {
      const bridge = preloadBridge<AnyState>();
      expect(bridge).toHaveProperty('handlers');
      expect(bridge.handlers).toHaveProperty('dispatch');
      expect(bridge.handlers).toHaveProperty('getState');
      expect(bridge.handlers).toHaveProperty('subscribe');
      expect(bridge).toHaveProperty('initialized');
    });

    it('should set up subscription with ipcRenderer', () => {
      const callback = vi.fn();
      const mockedIpcRenderer = vi.mocked(electron.ipcRenderer);
      let ipcCallback: (event: any, data: any) => void = () => {};
      mockedIpcRenderer.on.mockImplementation((channel, cb) => {
        if (channel === IpcChannel.SUBSCRIBE) {
          ipcCallback = cb;
        }
        return mockedIpcRenderer;
      });
      const bridge = preloadBridge();
      bridge.handlers.subscribe(callback);
      expect(mockedIpcRenderer.on).toHaveBeenCalledWith(IpcChannel.SUBSCRIBE, expect.any(Function));
      expect(mockedIpcRenderer.send).toHaveBeenCalledWith(IpcChannel.SUBSCRIBE, { keys: ['*'] });
      ipcCallback({} as any, { counter: 42 });
      expect(callback).toHaveBeenCalledWith({ counter: 42 });
    });

    it('should return unsubscribe function that removes the listener', () => {
      const callback = vi.fn();
      const bridge = preloadBridge();
      const unsubscribe = bridge.handlers.subscribe(callback);
      unsubscribe();
      const callback2 = vi.fn();
      bridge.handlers.subscribe(callback2);
      const ipcCallbacks = vi
        .mocked(electron.ipcRenderer.on)
        .mock.calls.filter(([channel]) => channel === IpcChannel.SUBSCRIBE)
        .map(([, cb]) => cb);
      if (ipcCallbacks.length > 0) {
        ipcCallbacks[0]({} as any, { counter: 42 });
      }
      expect(callback).not.toHaveBeenCalled();
      expect(callback2).toHaveBeenCalledWith({ counter: 42 });
    });

    it('should get state from ipcRenderer', async () => {
      const bridge = preloadBridge<AnyState>();
      const state = await bridge.handlers.getState();
      expect(electron.ipcRenderer.invoke).toHaveBeenCalledWith(IpcChannel.GET_STATE, undefined);
      expect(state).toEqual({ counter: 5 });
    });

    it('should get state with bypassAccessControl option', async () => {
      const bridge = preloadBridge<AnyState>();
      await bridge.handlers.getState({ bypassAccessControl: true });
      expect(electron.ipcRenderer.invoke).toHaveBeenCalledWith(IpcChannel.GET_STATE, { bypassAccessControl: true });
    });
  });

  describe('dispatch', () => {
    it('should dispatch string actions correctly', async () => {
      const bridge = preloadBridge();
      const mockedIpcRenderer = vi.mocked(electron.ipcRenderer);

      // Store the registered callbacks for later use
      const callbacks: Record<string, any> = {};

      mockedIpcRenderer.on.mockImplementation((channel, callback) => {
        callbacks[channel] = callback;
        return mockedIpcRenderer;
      });

      // Start the dispatch operation
      const dispatchPromise = bridge.handlers.dispatch('INCREMENT', 5);

      // Verify the action was sent
      expect(mockedIpcRenderer.send).toHaveBeenCalledWith(
        IpcChannel.DISPATCH,
        expect.objectContaining({
          action: expect.objectContaining({ type: 'INCREMENT', payload: 5, __id: expect.any(String) }),
        }),
      );

      // Extract the action ID from the send call
      const sentAction = mockedIpcRenderer.send.mock.calls[0][1].action;
      const actionId = sentAction.__id;

      // Manually trigger the acknowledgment callback
      const ackCallback = callbacks[IpcChannel.DISPATCH_ACK];
      if (ackCallback) {
        ackCallback({} as IpcRendererEvent, { actionId, success: true });
      }

      // Now wait for the promise to resolve
      const result = await dispatchPromise;

      // Verify the result
      expect(result).toEqual(expect.objectContaining({ type: 'INCREMENT', payload: 5, __id: expect.any(String) }));
    });

    it('should dispatch action objects correctly', async () => {
      const bridge = preloadBridge();
      const mockedIpcRenderer = vi.mocked(electron.ipcRenderer);

      // Store the registered callbacks for later use
      const callbacks: Record<string, any> = {};

      mockedIpcRenderer.on.mockImplementation((channel, callback) => {
        callbacks[channel] = callback;
        return mockedIpcRenderer;
      });

      // Start the dispatch operation
      const action: Action = { type: 'INCREMENT', payload: 5 };
      const dispatchPromise = bridge.handlers.dispatch(action);

      // Verify the action was sent
      expect(mockedIpcRenderer.send).toHaveBeenCalledWith(
        IpcChannel.DISPATCH,
        expect.objectContaining({
          action: expect.objectContaining({ type: 'INCREMENT', payload: 5, __id: expect.any(String) }),
        }),
      );

      // Extract the action ID from the send call
      const sentAction = mockedIpcRenderer.send.mock.calls[0][1].action;
      const actionId = sentAction.__id;

      // Manually trigger the acknowledgment callback
      const ackCallback = callbacks[IpcChannel.DISPATCH_ACK];
      if (ackCallback) {
        ackCallback({} as IpcRendererEvent, { actionId, success: true });
      }

      // Now wait for the promise to resolve
      const result = await dispatchPromise;

      // Verify the result
      expect(result).toEqual(expect.objectContaining({ type: 'INCREMENT', payload: 5, __id: expect.any(String) }));
    });
  });

  describe('initialization', () => {
    it('should set up IPC listeners during initialization', () => {
      const mockedIpcRenderer = vi.mocked(electron.ipcRenderer);
      preloadBridge();
      expect(mockedIpcRenderer.on).toHaveBeenCalledWith(IpcChannel.DISPATCH_ACK, expect.any(Function));
      expect(mockedIpcRenderer.on).toHaveBeenCalledWith(IpcChannel.REGISTER_THUNK_ACK, expect.any(Function));
    });
  });
});

describe('preloadZustandBridge', () => {
  it('should be an alias for preloadBridge', () => {
    expect(preloadZustandBridge).toBe(preloadBridge);
  });
});
