import type { WebContents } from 'electron';
import { bench, describe, vi } from 'vitest';
import { createStore } from 'zustand/vanilla';
import { createZustandBridge } from '../src/main.js';

vi.mock('electron', () => ({
  ipcMain: { on: vi.fn(), handle: vi.fn(), removeHandler: vi.fn(), removeAllListeners: vi.fn() },
  webContents: { getAllWebContents: () => [] },
  app: { on: vi.fn() },
}));

const createState = () => ({
  tick: 0,
  prefs: Object.fromEntries(Array.from({ length: 400 }, (_, i) => [`pref${i}`, `value-${i}`])),
  flags: Object.fromEntries(
    Array.from({ length: 500 }, (_, i) => [`flag${i}`, { on: i % 2 === 0 }]),
  ),
  items: Array.from({ length: 1500 }, (_, i) => ({ id: i, label: `Item ${i}` })),
});

const fakeWindow = (id: number) =>
  ({
    id,
    isDestroyed: () => false,
    isLoading: () => false,
    once: () => {},
    on: () => {},
    send: () => {},
  }) as unknown as WebContents;

for (const keys of [undefined, ['prefs']]) {
  for (const windowCount of [1, 6]) {
    describe(`setState, ${windowCount} window(s) subscribed to ${keys ?? 'all keys'}`, () => {
      const store = createStore(createState);
      const windows = Array.from({ length: windowCount }, (_, i) => fakeWindow(i + 1));
      createZustandBridge(store).subscribe(windows, keys);

      bench('update one top-level key', () => {
        store.setState({ tick: store.getState().tick + 1 });
      });
    });
  }
}
