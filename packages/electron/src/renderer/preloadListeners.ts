import { debug } from '@zubridge/core';
import type { IpcRendererEvent, ipcRenderer } from 'electron';

export class CleanupRegistry {
  private cleanups: Array<() => void | Promise<void>> = [];

  add(cleanup: () => void | Promise<void>): void {
    this.cleanups.push(cleanup);
  }

  async cleanupAll(): Promise<void> {
    const results = await Promise.allSettled(this.cleanups.map((cleanup) => cleanup()));

    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        debug('cleanup:error', `Cleanup ${index} failed:`, result.reason);
      }
    });

    this.cleanups.length = 0;
  }
}

export interface IPCListeners {
  get: (channel: string) => ((event: IpcRendererEvent, ...args: unknown[]) => void) | undefined;
  set: (channel: string, listener: (event: IpcRendererEvent, ...args: unknown[]) => void) => void;
  delete: (channel: string) => void;
}

export interface IPCManagerConfig {
  ipcRenderer: typeof ipcRenderer;
}

export interface IPCManager {
  ipcListeners: IPCListeners;
  cleanupRegistry: {
    ipc: CleanupRegistry;
    dom: CleanupRegistry;
    thunks: CleanupRegistry;
    cleanupAll: () => Promise<void>;
  };
  registerIpcListener: (
    channel: string,
    listener: (event: IpcRendererEvent, ...args: unknown[]) => void,
  ) => void;
}

export function createIPCManager({ ipcRenderer }: IPCManagerConfig): IPCManager {
  const ipcListeners: Map<string, (event: IpcRendererEvent, ...args: unknown[]) => void> =
    new Map();

  const cleanupRegistry = {
    ipc: new CleanupRegistry(),
    dom: new CleanupRegistry(),
    thunks: new CleanupRegistry(),

    async cleanupAll() {
      await Promise.all([this.ipc.cleanupAll(), this.dom.cleanupAll(), this.thunks.cleanupAll()]);
    },
  };

  const registerIpcListener = (
    channel: string,
    listener: (event: IpcRendererEvent, ...args: unknown[]) => void,
  ) => {
    try {
      const existingListener = ipcListeners.get(channel);
      if (existingListener) {
        ipcRenderer.removeListener(channel, existingListener);
      }

      ipcRenderer.on(channel, listener);
      ipcListeners.set(channel, listener);

      cleanupRegistry.ipc.add(() => {
        ipcRenderer.removeListener(channel, listener);
        ipcListeners.delete(channel);
      });
    } catch (error) {
      debug('ipc:error', `Failed to register IPC listener for channel ${channel}:`, error);
    }
  };

  return {
    ipcListeners: {
      get: (channel: string) => ipcListeners.get(channel),
      set: (channel: string, listener) => ipcListeners.set(channel, listener),
      delete: (channel: string) => ipcListeners.delete(channel),
    },
    cleanupRegistry,
    registerIpcListener,
  };
}
