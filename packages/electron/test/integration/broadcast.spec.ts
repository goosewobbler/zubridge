import type { WebContents } from 'electron';
import { describe, expect, it, vi } from 'vitest';
import { createStore } from 'zustand/vanilla';
import { createZustandBridge } from '../../src/main.js';

vi.mock('electron', () => ({
  ipcMain: { on: vi.fn(), handle: vi.fn(), removeHandler: vi.fn(), removeAllListeners: vi.fn() },
  webContents: { getAllWebContents: () => [] },
  app: { on: vi.fn() },
}));

const fakeWindow = (id: number) => ({ id, isDestroyed: () => false, once: vi.fn(), send: vi.fn() });

describe('state broadcast', () => {
  // Comparisons are cached per object pair, which is only safe on sanitized copies.
  it('sends every window a nested value the store changed in place', () => {
    const store = createStore(() => ({ tick: 0, user: { name: 'Ada' } }));
    const all = fakeWindow(1);
    const userOnly = fakeWindow(2);
    const bridge = createZustandBridge(store);
    bridge.subscribe([all] as unknown as WebContents[]);
    bridge.subscribe([userOnly] as unknown as WebContents[], ['user']);
    store.setState({ tick: 1 });

    store.getState().user.name = 'Grace';
    store.setState({ tick: 2 });

    expect(all.send.mock.lastCall?.[1].delta.changed).toEqual({ tick: 2, user: { name: 'Grace' } });
    expect(userOnly.send.mock.lastCall?.[1].delta.changed).toEqual({ user: { name: 'Grace' } });
  });
});
