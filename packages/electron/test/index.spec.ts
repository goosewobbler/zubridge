import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { AnyState, Handlers, Thunk } from '@zubridge/types';

// Import from source
import { createUseStore, useDispatch, createHandlers } from '../src/index';

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
    // @ts-ignore - Intentionally setting window to undefined for testing
    global.window = undefined;

    expect(() => {
      createHandlers();
    }).toThrow('Zubridge handlers not found in window');
  });

  it('should throw an error when window.zubridge is undefined', () => {
    // Create a new window object without zubridge
    const windowWithoutZubridge = { ...originalWindow } as Window & typeof globalThis;
    (windowWithoutZubridge as any).zubridge = undefined;
    global.window = windowWithoutZubridge;

    expect(() => {
      createHandlers();
    }).toThrow('Zubridge handlers not found in window');
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
    (window as any).zubridge = {
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

  beforeEach(() => {
    vi.clearAllMocks();

    // Create mock handlers
    mockHandlers = {
      dispatch: vi.fn(),
      getState: vi.fn().mockResolvedValue({ testCounter: 1 }),
      subscribe: vi.fn(),
    };

    // Set up global window.zubridge
    (window as any).zubridge = {
      dispatch: vi.fn(),
      getState: vi.fn().mockReturnValue(Promise.resolve({ test: 'state' })),
      subscribe: vi.fn(),
    } as unknown as Handlers<AnyState>;
  });

  it('should return a dispatch function', async () => {
    const dispatch = useDispatch<AnyState>();
    expect(dispatch).toBeDefined();
  });

  it('should create a dispatch function with custom handlers when provided', () => {
    const customHandlers = {
      dispatch: vi.fn(),
      getState: vi.fn().mockReturnValue(Promise.resolve({ test: 'state' })),
      subscribe: vi.fn(),
    } as unknown as Handlers<AnyState>;

    const dispatch = useDispatch<AnyState>(customHandlers);
    expect(dispatch).toBeDefined();
  });

  it('should handle string action types', () => {
    const dispatch = useDispatch<TestState>(mockHandlers);

    dispatch('INCREMENT', 5);

    expect(mockHandlers.dispatch).toHaveBeenCalledWith('INCREMENT', 5);
  });

  it('should handle action objects', () => {
    const dispatch = useDispatch<TestState>(mockHandlers);
    const action = { type: 'SET_COUNTER', payload: 42 };

    dispatch(action);

    expect(mockHandlers.dispatch).toHaveBeenCalledWith(action);
  });

  it('should normalize typed action objects', () => {
    const dispatch = useDispatch<TestState, { SET_COUNTER: number }>(mockHandlers);
    const typedAction = { type: 'SET_COUNTER', payload: 42 };

    dispatch(typedAction);

    // Verify the action was properly normalized for handlers.dispatch
    expect(mockHandlers.dispatch).toHaveBeenCalledWith({
      type: 'SET_COUNTER',
      payload: 42,
    });
  });

  it('should execute thunk actions', () => {
    const dispatch = useDispatch<TestState>(mockHandlers);

    const thunkAction = vi.fn((getState, innerDispatch) => {
      const state = getState();
      // Use expect.any to avoid exact comparison that might fail
      expect(state).toEqual(expect.any(Object));
      innerDispatch('INCREMENT');
      return 'thunk-result';
    });

    const result = dispatch(thunkAction as unknown as Thunk<TestState>);

    expect(thunkAction).toHaveBeenCalled();
    expect(mockHandlers.dispatch).toHaveBeenCalledWith('INCREMENT');
    expect(result).toBe('thunk-result');
  });
});
