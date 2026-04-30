import { debug } from '@zubridge/core';

type ListenFn = <E = unknown>(event: string, handler: (event: E) => void) => Promise<() => void>;

type Unlisten = () => void;

/**
 * Tracks Tauri event listeners so they can be torn down together. Mirrors
 * `packages/electron/src/renderer/preloadListeners.ts` but uses Tauri's
 * `listen` primitive instead of `ipcRenderer`.
 */
export class InvokeListeners {
  private readonly listen: ListenFn;
  private readonly unlistens: Map<string, Unlisten[]> = new Map();
  private destroyed = false;

  constructor(listen: ListenFn) {
    this.listen = listen;
  }

  async on<E = unknown>(event: string, handler: (event: E) => void): Promise<Unlisten> {
    if (this.destroyed) {
      debug(
        'tauri:error',
        `[InvokeListeners] Cannot register listener for "${event}" after destroy`,
      );
      return () => {};
    }
    const unlisten = await this.listen<E>(event, handler);
    const wrapped = () => {
      try {
        unlisten();
      } catch (err) {
        debug('tauri:error', `[InvokeListeners] Error unlistening "${event}":`, err);
      }
      const arr = this.unlistens.get(event);
      if (arr) {
        const idx = arr.indexOf(wrapped);
        if (idx >= 0) arr.splice(idx, 1);
        if (arr.length === 0) this.unlistens.delete(event);
      }
    };
    const arr = this.unlistens.get(event) ?? [];
    arr.push(wrapped);
    this.unlistens.set(event, arr);
    return wrapped;
  }

  async destroy(): Promise<void> {
    this.destroyed = true;
    for (const [, list] of this.unlistens) {
      for (const u of list) {
        try {
          u();
        } catch {
          /* swallow */
        }
      }
    }
    this.unlistens.clear();
  }
}
