import type { WebContents } from 'electron';
import { describe, expect, it, vi } from 'vitest';
import { createStore } from 'zustand/vanilla';
import { createZustandBridge } from '../../src/main.js';

vi.mock('electron', () => ({
  ipcMain: { on: vi.fn(), handle: vi.fn(), removeHandler: vi.fn(), removeAllListeners: vi.fn() },
  webContents: { getAllWebContents: () => [] },
  app: { on: vi.fn() },
}));

describe('state broadcast', () => {
  // Delta comparisons are cached per object pair, which is only safe on sanitized copies.
  it('sends every window a nested value the store changed in place', () => {
    const store = createStore(() => ({ tick: 0, user: { name: 'Ada' } }));
    const windows = [1, 2].map((id) => ({
      id,
      isDestroyed: () => false,
      once: vi.fn(),
      send: vi.fn(),
    }));
    createZustandBridge(store).subscribe(windows as unknown as WebContents[]);
    store.setState({ tick: 1 });

    store.getState().user.name = 'Grace';
    store.setState({ tick: 2 });

    for (const { send } of windows) {
      expect(send.mock.lastCall?.[1].delta.changed).toEqual({ tick: 2, user: { name: 'Grace' } });
    }
  });
});
