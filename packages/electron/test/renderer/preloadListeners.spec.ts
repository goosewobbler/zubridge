import type { IpcRenderer } from 'electron';
import { describe, expect, it, vi } from 'vitest';
import { createIPCManager } from '../../src/renderer/preloadListeners.js';

describe('createIPCManager', () => {
  function createMockIpcRenderer(): IpcRenderer {
    const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
    return {
      on: vi.fn((channel: string, listener: (...args: unknown[]) => void) => {
        if (!listeners.has(channel)) listeners.set(channel, new Set());
        listeners.get(channel)?.add(listener);
      }),
      removeListener: vi.fn((channel: string, listener: (...args: unknown[]) => void) => {
        listeners.get(channel)?.delete(listener);
      }),
    } as unknown as IpcRenderer;
  }

  it('should register and retrieve IPC listeners', () => {
    const ipc = createMockIpcRenderer();
    const manager = createIPCManager({ ipcRenderer: ipc });

    const listener = vi.fn();
    manager.registerIpcListener('test-channel', listener);

    expect(ipc.on).toHaveBeenCalledWith('test-channel', listener);
    expect(manager.ipcListeners.get('test-channel')).toBe(listener);
  });

  it('should clean up stale cleanup function when ipcListeners.delete is called', async () => {
    const ipc = createMockIpcRenderer();
    const manager = createIPCManager({ ipcRenderer: ipc });

    const listener = vi.fn();
    manager.registerIpcListener('test-channel', listener);

    // Manually delete the listener
    manager.ipcListeners.delete('test-channel');
    expect(manager.ipcListeners.get('test-channel')).toBeUndefined();

    // cleanupAll should not call removeListener again for the deleted channel
    ipc.removeListener.mockClear();
    await manager.cleanupRegistry.cleanupAll();

    expect(ipc.removeListener).not.toHaveBeenCalledWith('test-channel', listener);
  });

  it('should replace listener on re-registration for same channel', () => {
    const ipc = createMockIpcRenderer();
    const manager = createIPCManager({ ipcRenderer: ipc });

    const listener1 = vi.fn();
    const listener2 = vi.fn();
    manager.registerIpcListener('ch', listener1);
    manager.registerIpcListener('ch', listener2);

    // Old listener should have been removed
    expect(ipc.removeListener).toHaveBeenCalledWith('ch', listener1);
    expect(manager.ipcListeners.get('ch')).toBe(listener2);
  });
});
