import { vi } from 'vitest';
import type { Action, Handlers, AnyState } from '@zubridge/types';
import type {} from '@zubridge/types/internal'; // Import internal window augmentations

// Set up mocks for the window object
const mockZubridge = {
  dispatch: vi.fn(),
  getState: vi.fn(),
  subscribe: vi.fn(),
};

// Add properties to global object in a type-safe way
Object.defineProperty(global, 'window', {
  value: {
    zubridge: mockZubridge,
    __zubridge_windowId: undefined,
    __zubridge_thunkProcessor: {
      executeThunk: vi.fn().mockResolvedValue('thunk-result'),
      dispatchAction: vi.fn().mockImplementation((action) => Promise.resolve()),
      completeAction: vi.fn(),
    },
  },
  writable: true,
});

// Mock Electron IPC modules
vi.mock('electron', () => ({
  ipcRenderer: {
    send: vi.fn(),
    invoke: vi.fn(),
    on: vi.fn(),
    removeListener: vi.fn(),
  },
  ipcMain: {
    on: vi.fn(),
    handle: vi.fn(),
    emit: vi.fn(),
    removeHandler: vi.fn(),
    removeAllListeners: vi.fn(),
  },
  contextBridge: {
    exposeInMainWorld: vi.fn(),
  },
}));
