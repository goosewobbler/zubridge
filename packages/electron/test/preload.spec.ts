import { describe, it, expect, vi, beforeEach } from 'vitest';
import { preloadZustandBridge } from '../src/preload';
import type { AnyState, Thunk } from '@zubridge/types';
import { IpcChannel } from '../src/constants';
import { ipcRenderer } from 'electron';

vi.mock('electron', () => ({
  ipcRenderer: {
    on: vi.fn(),
    removeListener: vi.fn(),
    invoke: vi.fn(),
    send: vi.fn(),
  },
}));

describe('preloadZustandBridge', () => {
  let handlers: any;

  beforeEach(() => {
    vi.resetAllMocks();
    handlers = preloadZustandBridge().handlers;
  });

  it('should create handlers with default channel names', () => {
    expect(handlers).toHaveProperty('subscribe');
    expect(handlers).toHaveProperty('getState');
    expect(handlers).toHaveProperty('dispatch');
  });

  it('should set up a subscription with ipcRenderer', () => {
    const callback = vi.fn();
    vi.spyOn(ipcRenderer, 'on');
    vi.spyOn(ipcRenderer, 'removeListener');

    const unsubscribe = handlers.subscribe(callback);

    expect(ipcRenderer.on).toHaveBeenCalledTimes(1);
    expect(ipcRenderer.on).toHaveBeenCalledWith(IpcChannel.SUBSCRIBE, expect.any(Function));

    // Call the event listener with mock data
    const mockOn = ipcRenderer.on as ReturnType<typeof vi.fn>;
    const listener = mockOn.mock.calls[0][1];
    listener(null, { count: 1 });

    // Verify the callback was called with the state
    expect(callback).toHaveBeenCalledWith({ count: 1 });

    // Unsubscribe
    unsubscribe();

    expect(ipcRenderer.removeListener).toHaveBeenCalledTimes(1);
    expect(ipcRenderer.removeListener).toHaveBeenCalledWith(IpcChannel.SUBSCRIBE, expect.any(Function));
  });

  it('should get state from ipcRenderer', async () => {
    vi.spyOn(ipcRenderer, 'invoke').mockResolvedValue({ count: 1 });

    const state = await handlers.getState();

    expect(ipcRenderer.invoke).toHaveBeenCalledTimes(1);
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(IpcChannel.GET_STATE);
    expect(state).toEqual({ count: 1 });
  });

  it('should accept thunks without error (but not execute them)', () => {
    // Create a spy we can track
    const thunkSpy = vi.fn();

    // Create a thunk that would call our spy if executed
    // The preload just accepts the thunk without executing it
    const thunk = () => {
      thunkSpy();
      return 'thunk result';
    };

    // Dispatch the thunk without error
    const result = handlers.dispatch(thunk);

    // Verify the thunk was NOT executed (preload just passes it through)
    expect(thunkSpy).not.toHaveBeenCalled();

    // We should get undefined since the preload just returns without doing anything with thunks
    expect(result).toBeUndefined();

    // Also verify no IPC calls were made
    expect(ipcRenderer.send).not.toHaveBeenCalled();
  });

  it('should dispatch a string action with payload', () => {
    vi.spyOn(ipcRenderer, 'send');

    handlers.dispatch('increment', 1);

    expect(ipcRenderer.send).toHaveBeenCalledTimes(1);
    expect(ipcRenderer.send).toHaveBeenCalledWith(IpcChannel.DISPATCH, {
      type: 'increment',
      payload: 1,
    });
  });

  it('should dispatch an action object', () => {
    vi.spyOn(ipcRenderer, 'send');

    const action = { type: 'increment', payload: 1 };
    handlers.dispatch(action);

    expect(ipcRenderer.send).toHaveBeenCalledTimes(1);
    expect(ipcRenderer.send).toHaveBeenCalledWith(IpcChannel.DISPATCH, action);
  });
});
