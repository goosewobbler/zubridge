import { debug } from '@zubridge/core';
import type { IpcRendererEvent, ipcRenderer } from 'electron';

export class CleanupRegistry {
  private cleanups: Array<() => void | Promise<void>> = [];

  add(cleanup: () => void | Promise<void>): void {
    this.cleanups.push(cleanup);
  }

  remove(cleanup: () => void | Promise<void>): void {
    const index = this.cleanups.indexOf(cleanup);
    if (index !== -1) {
      this.cleanups.splice(index, 1);
    }
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

  // Track cleanup functions per channel to prevent accumulation on re-registration
  const ipcCleanupFunctions: Map<string, () => void> = new Map();

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

      // Remove previous cleanup function if exists to prevent accumulation
      const existingCleanup = ipcCleanupFunctions.get(channel);
      if (existingCleanup) {
        cleanupRegistry.ipc.remove(existingCleanup);
        ipcCleanupFunctions.delete(channel);
      }

      ipcRenderer.on(channel, listener);
      ipcListeners.set(channel, listener);

      const cleanupFn = () => {
        ipcRenderer.removeListener(channel, listener);
        ipcListeners.delete(channel);
      };
      ipcCleanupFunctions.set(channel, cleanupFn);
      cleanupRegistry.ipc.add(cleanupFn);
    } catch (error) {
      debug('ipc:error', `Failed to register IPC listener for channel ${channel}:`, error);
    }
  };

  return {
    ipcListeners: {
      get: (channel: string) => ipcListeners.get(channel),
      /**
       * WARNING: Do NOT use this to register new listeners — use registerIpcListener() instead.
       * This only updates the tracking map and does NOT register a cleanup function.
       * Provided for internal bookkeeping only.
       */
      set: (channel: string, listener) => ipcListeners.set(channel, listener),
      delete: (channel: string) => ipcListeners.delete(channel),
    },
    cleanupRegistry,
    registerIpcListener,
  };
}
