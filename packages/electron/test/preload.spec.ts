import { describe, it, expect, vi, beforeEach } from 'vitest';
import { preloadBridge, preloadZustandBridge } from '../src/preload';
import type { AnyState } from '@zubridge/types';
import { IpcChannel } from '../src/constants';
import { ipcRenderer } from 'electron';

// Mock electron for testing
vi.mock('electron', () => ({
  ipcRenderer: {
    on: vi.fn(() => ipcRenderer),
    removeListener: vi.fn(),
    invoke: vi.fn(),
    send: vi.fn(),
  },
}));

describe('preloadBridge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates handlers with expected methods', () => {
    const bridge = preloadBridge<AnyState>();

    expect(bridge).toHaveProperty('handlers');
    expect(bridge.handlers).toHaveProperty('dispatch');
    expect(bridge.handlers).toHaveProperty('getState');
    expect(bridge.handlers).toHaveProperty('subscribe');
  });

  it('sets up subscription with ipcRenderer', () => {
    const bridge = preloadBridge<AnyState>();
    const callback = vi.fn();

    bridge.handlers.subscribe(callback);

    expect(ipcRenderer.on).toHaveBeenCalledWith(IpcChannel.SUBSCRIBE, expect.any(Function));

    // Get the callback function registered with ipcRenderer
    const ipcCallback = vi.mocked(ipcRenderer.on).mock.calls[0][1];

    // Simulate state update event
    ipcCallback({} as any, { count: 42 });

    expect(callback).toHaveBeenCalledWith({ count: 42 });
  });

  it('gets state from ipcRenderer', async () => {
    const bridge = preloadBridge<AnyState>();

    vi.mocked(ipcRenderer.invoke).mockResolvedValueOnce({ count: 42 });

    const state = await bridge.handlers.getState();

    expect(ipcRenderer.invoke).toHaveBeenCalledWith(IpcChannel.GET_STATE);
    expect(state).toEqual({ count: 42 });
  });

  it('does not execute thunks in preload', () => {
    const bridge = preloadBridge<AnyState>();
    const thunk = vi.fn();

    bridge.handlers.dispatch(thunk);

    expect(thunk).not.toHaveBeenCalled();
  });

  it('dispatches string actions correctly', () => {
    const bridge = preloadBridge<AnyState>();

    bridge.handlers.dispatch('INCREMENT', 5);

    expect(ipcRenderer.send).toHaveBeenCalledWith(IpcChannel.DISPATCH, {
      type: 'INCREMENT',
      payload: 5,
    });
  });

  it('dispatches action objects correctly', () => {
    const bridge = preloadBridge<AnyState>();

    bridge.handlers.dispatch({ type: 'INCREMENT', payload: 5 });

    expect(ipcRenderer.send).toHaveBeenCalledWith(IpcChannel.DISPATCH, { type: 'INCREMENT', payload: 5 });
  });
});

describe('preloadZustandBridge', () => {
  it('is an alias for preloadBridge', () => {
    expect(preloadZustandBridge).toBe(preloadBridge);
  });
});
