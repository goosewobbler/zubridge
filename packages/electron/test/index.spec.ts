import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { AnyState, Handlers, Thunk, DispatchFunc } from '@zubridge/types';

// Import from source
import { createUseStore, useDispatch, createHandlers } from '../src/index';

type TestState = {
  testCounter: number;
};

// Helper function for testing errors
const fail = (message: string) => {
  expect.fail(message);
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
  let dispatch: DispatchFunc<TestState, any>;
  let actionCompletionResolver: (value?: any) => void;

  beforeEach(() => {
    vi.clearAllMocks();

    // Create mock handlers with controlled promise resolution
    mockHandlers = {
      dispatch: vi.fn().mockImplementation((action, payload) => {
        // Return a promise that can be manually resolved later for testing timing control
        return new Promise<void>((resolve) => {
          actionCompletionResolver = resolve;
          // Default auto-resolve after a short delay to prevent test hanging
          setTimeout(() => resolve(), 10);
        });
      }),
      getState: vi.fn().mockResolvedValue({ testCounter: 1 }),
      subscribe: vi.fn(),
    };

    // Set up global window.zubridge with similar behavior
    (window as any).zubridge = {
      dispatch: vi.fn().mockImplementation((action, payload) => {
        return new Promise<void>((resolve) => {
          setTimeout(() => resolve(), 10);
        });
      }),
      getState: vi.fn().mockReturnValue(Promise.resolve({ test: 'state' })),
      subscribe: vi.fn(),
    } as unknown as Handlers<AnyState>;

    // Create dispatch function for tests
    dispatch = useDispatch<TestState>(mockHandlers);
  });

  it('should return a dispatch function', () => {
    expect(dispatch).toBeDefined();
    expect(typeof dispatch).toBe('function');
  });

  it('should handle string action types and return a promise', async () => {
    // Setup a special implementation to test resolution
    mockHandlers.dispatch.mockImplementationOnce((action, payload) => {
      return new Promise((resolve) => {
        // Store the resolver for later manual resolution
        actionCompletionResolver = resolve;
      });
    });

    // Dispatch an action without awaiting
    const promise = dispatch('INCREMENT', 5);

    // Verify it returns a promise that hasn't resolved yet
    expect(promise).toBeInstanceOf(Promise);

    // We need to flush the microtask queue to ensure our promise is processed
    await Promise.resolve();

    // Ensure dispatch was called with the right arguments
    expect(mockHandlers.dispatch).toHaveBeenCalledWith('INCREMENT', 5);

    // Manually resolve the promise to simulate acknowledgment
    actionCompletionResolver();

    // Now await the promise to confirm it resolves
    await promise;
  });

  it('should handle action objects and return a promise', async () => {
    const action = { type: 'SET_COUNTER', payload: 42 };

    // Setup controlled promise resolution
    let promiseResolved = false;
    mockHandlers.dispatch.mockImplementationOnce(() => {
      return new Promise((resolve) => {
        // Store the resolver for later manual resolution
        actionCompletionResolver = () => {
          promiseResolved = true;
          resolve();
        };
      });
    });

    // Dispatch and start awaiting
    const awaitPromise = dispatch(action).then(() => {
      expect(promiseResolved).toBe(true);
    });

    // We need to flush the microtask queue to ensure our promise is processed
    await Promise.resolve();

    // Verify dispatch was called with the normalized action
    expect(mockHandlers.dispatch).toHaveBeenCalledWith({
      type: 'SET_COUNTER',
      payload: 42,
    });

    // Simulate the action being processed and acknowledged
    actionCompletionResolver();

    // Wait for the promise to resolve
    await awaitPromise;
  });

  it('should execute thunks locally and return their result', async () => {
    // Create a thunk that tracks its execution state
    let thunkExecuted = false;
    let firstActionDispatched = false;
    let secondActionDispatched = false;

    // Mock dispatch implementation for tracking each step
    mockHandlers.dispatch.mockImplementation((action) => {
      // Set the flags immediately before returning the promise
      if (typeof action === 'string' && action === 'FIRST_ACTION') {
        firstActionDispatched = true;
      } else if (typeof action === 'string' && action === 'SECOND_ACTION') {
        secondActionDispatched = true;
      } else if (typeof action === 'object' && action.type === 'FIRST_ACTION') {
        firstActionDispatched = true;
      } else if (typeof action === 'object' && action.type === 'SECOND_ACTION') {
        secondActionDispatched = true;
      }
      return Promise.resolve();
    });

    const thunkAction = vi.fn(async (getState, thunkDispatch) => {
      const currentState = getState();
      expect(currentState).toEqual({ test: 'state' });

      // Dispatch first action and wait
      await thunkDispatch('FIRST_ACTION');
      expect(firstActionDispatched).toBe(true);

      // Dispatch second action and wait
      await thunkDispatch('SECOND_ACTION');
      expect(secondActionDispatched).toBe(true);

      thunkExecuted = true;
      return 'thunk-completed';
    });

    // Dispatch the thunk
    const result = await dispatch(thunkAction as unknown as Thunk<TestState>);

    // Verify the thunk executed fully
    expect(thunkExecuted).toBe(true);
    expect(result).toBe('thunk-completed');

    // Verify both actions were dispatched in order
    expect(mockHandlers.dispatch).toHaveBeenNthCalledWith(1, 'FIRST_ACTION');
    expect(mockHandlers.dispatch).toHaveBeenNthCalledWith(2, 'SECOND_ACTION');
  });

  it('should guarantee sequential execution of async dispatches within thunks', async () => {
    // Track the order of execution
    const executionOrder: string[] = [];

    // Mock implementations for order tracking
    mockHandlers.dispatch.mockImplementation((action) => {
      if (typeof action === 'string') {
        executionOrder.push(`dispatch:${action}:start`);
        return new Promise((resolve) => {
          // Simulate async processing
          setTimeout(() => {
            executionOrder.push(`dispatch:${action}:end`);
            resolve();
          }, 5);
        });
      } else if (typeof action === 'object') {
        executionOrder.push(`dispatch:${action.type}:start`);
        return new Promise((resolve) => {
          // Simulate async processing with different timing to test ordering
          setTimeout(() => {
            executionOrder.push(`dispatch:${action.type}:end`);
            resolve();
          }, 10);
        });
      }
      return Promise.resolve();
    });

    // Create a thunk with multiple awaited dispatches
    const sequentialThunk = vi.fn(async (getState, thunkDispatch) => {
      executionOrder.push('thunk:start');

      // First dispatch
      await thunkDispatch('ACTION_ONE');
      executionOrder.push('thunk:after-action-one');

      // Second dispatch with different format
      await thunkDispatch({ type: 'ACTION_TWO' });
      executionOrder.push('thunk:after-action-two');

      // Last dispatch
      await thunkDispatch('ACTION_THREE');
      executionOrder.push('thunk:end');

      return 'completed';
    });

    // Execute the thunk
    await dispatch(sequentialThunk as unknown as Thunk<TestState>);

    // Verify the execution happened in the correct sequential order
    expect(executionOrder).toEqual([
      'thunk:start',
      'dispatch:ACTION_ONE:start',
      'dispatch:ACTION_ONE:end',
      'thunk:after-action-one',
      'dispatch:ACTION_TWO:start',
      'dispatch:ACTION_TWO:end',
      'thunk:after-action-two',
      'dispatch:ACTION_THREE:start',
      'dispatch:ACTION_THREE:end',
      'thunk:end',
    ]);
  });

  it('should properly handle errors in dispatch promises', async () => {
    // Mock a dispatch that fails
    mockHandlers.dispatch.mockImplementationOnce(() => Promise.reject(new Error('Action failed')));

    // Attempt to dispatch
    try {
      await dispatch('FAILING_ACTION');
      fail('Should have thrown an error');
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe('Action failed');
    }

    // Verify dispatch was called despite the error
    expect(mockHandlers.dispatch).toHaveBeenCalledWith('FAILING_ACTION');
  });

  it('should properly handle errors in thunks', async () => {
    // Create a thunk that throws an error
    const errorThunk = vi.fn(async () => {
      throw new Error('Thunk execution failed');
    });

    // Attempt to dispatch the thunk
    try {
      await dispatch(errorThunk as unknown as Thunk<TestState>);
      fail('Should have thrown an error');
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe('Thunk execution failed');
    }

    // Verify the thunk was called
    expect(errorThunk).toHaveBeenCalled();
  });
});
