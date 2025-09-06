import type { AnyState, DispatchFunc, Handlers } from '@zubridge/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Import from source
import { createHandlers, createUseStore, useDispatch } from '../src/index';

type TestState = {
  testCounter: number;
};

// Mock zustand
vi.mock('zustand', () => ({
  useStore: vi.fn().mockReturnValue({ test: 'state' }),
}));

// Create a working mock store
const mockZustandStore = {
  getState: vi.fn().mockReturnValue({ test: 'state' }),
  setState: vi.fn(),
  subscribe: vi.fn(),
  destroy: vi.fn(),
};

vi.mock('zustand/vanilla', () => {
  return {
    createStore: vi.fn().mockImplementation((factory) => {
      // Call the factory function right away to simulate store creation
      if (typeof factory === 'function') {
        const setState = vi.fn();
        factory(setState);
      }
      return mockZustandStore;
    }),
  };
});

// Mock electron
vi.mock('electron', () => ({
  ipcRenderer: {
    invoke: vi.fn().mockResolvedValue({ test: 'state' }),
    send: vi.fn(),
    on: vi.fn(),
    removeListener: vi.fn(),
  },
}));

describe('createHandlers', () => {
  const originalWindow = global.window;

  afterEach(() => {
    // Restore window after each test
    global.window = originalWindow;
  });

  it('should throw an error when window is undefined', () => {
    // @ts-expect-error - Intentionally setting window to undefined for testing
    global.window = undefined;

    expect(() => createHandlers()).toThrow('Zubridge handlers not found in window');
  });

  it('should throw an error when window.zubridge is undefined', () => {
    // Create a new window object without zubridge
    const windowWithoutZubridge = { ...originalWindow } as Window & typeof globalThis;
    (windowWithoutZubridge as { zubridge?: unknown }).zubridge = undefined;
    global.window = windowWithoutZubridge;

    expect(() => createHandlers()).toThrow('Zubridge handlers not found in window');
  });

  it('should return window.zubridge when it exists', () => {
    const mockHandlers = {
      dispatch: vi.fn(),
      getState: vi.fn(),
      subscribe: vi.fn(),
    };

    global.window.zubridge = mockHandlers;

    const handlers = createHandlers();
    expect(handlers).toBe(mockHandlers);
  });
});

describe('createUseStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (window as { zubridge?: Handlers<AnyState> }).zubridge = {
      dispatch: vi.fn(),
      getState: vi.fn().mockReturnValue(Promise.resolve({ test: 'state' })),
      subscribe: vi.fn(),
    } as unknown as Handlers<AnyState>;
  });

  it('should return a store hook', async () => {
    const useStore = createUseStore<AnyState>();
    expect(useStore).toBeDefined();
  });

  it('should create a useStore hook with custom handlers when provided', () => {
    const customHandlers = {
      dispatch: vi.fn(),
      getState: vi.fn().mockReturnValue(Promise.resolve({ custom: true })),
      subscribe: vi.fn(),
    } as unknown as Handlers<AnyState>;

    const useStore = createUseStore<AnyState>(customHandlers);
    expect(useStore).toBeDefined();
  });
});

describe('useDispatch', () => {
  let mockHandlers: Handlers<TestState>;
  let dispatch: DispatchFunc<TestState, Record<string, unknown>>;
  let _actionCompletionResolver: (value?: unknown) => void;

  beforeEach(() => {
    vi.clearAllMocks();

    // Create mock handlers that control promise resolution
    mockHandlers = {
      dispatch: vi.fn(),
      getState: vi.fn().mockReturnValue(Promise.resolve({ testCounter: 0 })),
      subscribe: vi.fn(),
    } as unknown as Handlers<TestState>;

    // Create dispatch function for tests
    dispatch = useDispatch<TestState>(mockHandlers);
  });

  it('should return a dispatch function', () => {
    expect(dispatch).toBeDefined();
    expect(typeof dispatch).toBe('function');
  });
});
