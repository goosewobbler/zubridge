import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as electron from 'electron';
import { preloadBridge, preloadZustandBridge } from '../src/preload.js';
import type { AnyState } from '@zubridge/types';
import { IpcChannel } from '../src/constants.js';
import { ipcRenderer } from 'electron';

// Mock electron for testing
vi.mock('electron', () => {
  const ipcRenderer = {
    on: vi.fn(),
    send: vi.fn(),
    invoke: vi.fn(),
  };

  // Add contextBridge that was missing
  const contextBridge = {
    exposeInMainWorld: vi.fn(),
  };

  return {
    ipcRenderer,
    contextBridge,
  };
});

describe('preloadBridge', () => {
  beforeEach(() => {
    vi.resetAllMocks();

    vi.mocked(electron.ipcRenderer).send.mockReset();
    vi.mocked(electron.ipcRenderer).on.mockReset();
    vi.mocked(electron.ipcRenderer).invoke.mockReset();

    // Set up window ID for tests
    global.window.__zubridge_windowId = '123';

    // Properly mock the thunk processor to intercept dispatches before they go to IPC
    global.window.__zubridge_thunkProcessor = {
      executeThunk: vi.fn().mockResolvedValue('thunk-result'),
      dispatchAction: vi.fn((action) => {
        // Mock the dispatch and make sure it never reaches IPC call
        return { success: true, action };
      }),
    };
  });

  it('creates handlers with expected methods', () => {
    const bridge = preloadBridge<AnyState>();

    expect(bridge).toHaveProperty('handlers');
    expect(bridge.handlers).toHaveProperty('dispatch');
    expect(bridge.handlers).toHaveProperty('getState');
    expect(bridge.handlers).toHaveProperty('subscribe');
  });

  it('sets up subscription with ipcRenderer', () => {
    const callback = vi.fn();
    const ipcRenderer = vi.mocked(electron.ipcRenderer);

    let ipcCallback: (event: any, data: any) => void = () => {};

    // Update the mock to capture the callback
    ipcRenderer.on.mockImplementation((channel, cb) => {
      if (channel === IpcChannel.SUBSCRIBE) {
        ipcCallback = cb;
      }
      return ipcRenderer;
    });

    const bridge = preloadBridge();
    bridge.handlers.subscribe(callback);

    // Simulate a state update coming from main process
    ipcCallback({} as any, { count: 42 });

    // Check that our callback was called with the state
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
    const bridge = preloadBridge();

    // Create a thunk
    const thunk = vi.fn((getState, dispatch) => {
      // This function should be executed in the renderer, not preload
      return 'thunk result';
    });

    // Execute the thunk
    bridge.handlers.dispatch(thunk);

    // The thunk itself should not be called directly
    expect(thunk).not.toHaveBeenCalled();

    // Instead, it should be passed to the thunk processor
    expect(window.__zubridge_thunkProcessor.executeThunk).toHaveBeenCalled();
  });

  it('dispatches string actions correctly', () => {
    const ipcRenderer = vi.mocked(electron.ipcRenderer);
    const dispatchAction = vi.fn();

    // Override the global mock for this test only
    const originalThunkProcessor = global.window.__zubridge_thunkProcessor;
    global.window.__zubridge_thunkProcessor = {
      ...originalThunkProcessor,
      dispatchAction: dispatchAction,
    };

    const bridge = preloadBridge();

    bridge.handlers.dispatch('INCREMENT', 5);

    // Don't use toHaveBeenCalledWith as it's too strict - inspect the first argument only
    expect(dispatchAction).toHaveBeenCalled();
    const firstCall = dispatchAction.mock.calls[0];
    const actionArg = firstCall[0];
    expect(actionArg).toMatchObject({
      type: 'INCREMENT',
      payload: 5,
    });
  });

  it('dispatches action objects correctly', () => {
    const ipcRenderer = vi.mocked(electron.ipcRenderer);
    const dispatchAction = vi.fn();

    // Override the global mock for this test only
    const originalThunkProcessor = global.window.__zubridge_thunkProcessor;
    global.window.__zubridge_thunkProcessor = {
      ...originalThunkProcessor,
      dispatchAction: dispatchAction,
    };

    const bridge = preloadBridge();

    bridge.handlers.dispatch({ type: 'INCREMENT', payload: 5 });

    // Don't use toHaveBeenCalledWith as it's too strict - inspect the first argument only
    expect(dispatchAction).toHaveBeenCalled();
    const firstCall = dispatchAction.mock.calls[0];
    const actionArg = firstCall[0];
    expect(actionArg).toMatchObject({
      type: 'INCREMENT',
      payload: 5,
    });
  });
});

describe('preloadZustandBridge', () => {
  it('is an alias for preloadBridge', () => {
    expect(preloadZustandBridge).toBe(preloadBridge);
  });
});
