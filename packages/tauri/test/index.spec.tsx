import { act, render, screen, waitFor } from '@testing-library/react';
import React, { useEffect } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import type { UnlistenFn } from '@tauri-apps/api/event';
import { renderHook } from '@testing-library/react';
import type { Action, AnyState, DispatchFunc } from '@zubridge/types';
import {
  type BackendOptions,
  cleanupZubridge,
  getState,
  initializeBridge,
  internalStore,
  updateState,
  useZubridgeDispatch,
  useZubridgeStore,
} from '../src/index.js';

// --- Mocks Setup ---
let mockBackendState: AnyState = { counter: 0, initial: true };
let stateUpdateListener: ((event: { payload: unknown }) => void) | null = null;
const unlistenMock = vi.fn();

// Create mock functions for invoke and listen that will be passed to initializeBridge
const mockInvoke = vi.fn(async <R = unknown>(cmd: string, args?: unknown): Promise<R> => {
  switch (cmd) {
    // Plugin format (Tauri v2)
    case 'plugin:zubridge|get_initial_state':
      return Promise.resolve(mockBackendState) as Promise<R>;
    case 'plugin:zubridge|dispatch_action':
      return Promise.resolve() as Promise<R>;
    // Direct format (Tauri v1)
    case 'get_initial_state':
      return Promise.resolve(mockBackendState) as Promise<R>;
    case 'dispatch_action':
      return Promise.resolve() as Promise<R>;
    // Legacy format - specific to tests
    case '__zubridge_get_initial_state':
      return Promise.resolve(mockBackendState) as Promise<R>;
    case '__zubridge_dispatch_action':
      return Promise.resolve() as Promise<R>;
    // Custom command names
    case 'custom_get_state':
      return Promise.resolve(mockBackendState) as Promise<R>;
    case 'custom_dispatch':
      return Promise.resolve() as Promise<R>;
    // Direct state access
    case 'get_state':
      return Promise.resolve({ value: mockBackendState }) as Promise<R>;
    case 'update_state': {
      const stateArgs = args as { state?: { value?: AnyState } } | undefined;
      mockBackendState = stateArgs?.state?.value ?? mockBackendState;
      return Promise.resolve() as Promise<R>;
    }
    default:
      console.error(`[Mock Invoke] Unknown command: ${cmd}`);
      return Promise.reject(new Error(`[Mock Invoke] Unknown command: ${cmd}`)) as Promise<R>;
  }
});

// Raw mock implementation with payload structure
const mockListenRaw = vi.fn(
  async (event: string, callback: (event: { payload: unknown }) => void): Promise<UnlistenFn> => {
    if (
      event === '__zubridge_state_update' ||
      event === 'zubridge://state-update' ||
      event === 'custom-event'
    ) {
      stateUpdateListener = callback;
      return Promise.resolve(unlistenMock);
    }
    return Promise.resolve(vi.fn()); // Return a generic mock unlisten for other events
  },
);

// Type-compatible wrapper for the BackendOptions interface
const mockListen = async <E = unknown>(
  event: string,
  handler: (event: E) => void,
): Promise<UnlistenFn> => {
  // Adapt the handler to expect an event with payload
  return mockListenRaw(event, (e: { payload: unknown }) => {
    // Call the original handler with the payload as the event
    handler(e as unknown as E);
  });
};

// Legacy commands for backward compatibility with tests
const mockLegacyOptions: BackendOptions = {
  invoke: mockInvoke as BackendOptions['invoke'],
  listen: mockListen,
  commands: {
    getInitialState: '__zubridge_get_initial_state',
    dispatchAction: '__zubridge_dispatch_action',
    stateUpdateEvent: '__zubridge_state_update',
  },
};

// Custom command configuration
const mockCustomOptions: BackendOptions = {
  invoke: mockInvoke as BackendOptions['invoke'],
  listen: mockListen,
  commands: {
    getInitialState: 'custom_get_state',
    dispatchAction: 'custom_dispatch',
    stateUpdateEvent: 'custom-event',
  },
};

// --- Helper Functions ---
function simulateStateUpdate(newState: AnyState) {
  if (stateUpdateListener) {
    act(() => {
      stateUpdateListener({ payload: newState });
    });
  } else {
    console.warn('[TEST Mock] simulateStateUpdate called but no listener is registered.');
  }
}

// --- Test Suite ---
type TestState = { counter: number; initial: boolean; message?: string };

beforeEach(async () => {
  // Reset backend state
  mockBackendState = { counter: 10, initial: true };
  stateUpdateListener = null;

  // Clear Vitest mocks (including call history)
  vi.clearAllMocks();
  unlistenMock.mockReset();
  mockInvoke.mockClear();
  mockListenRaw.mockClear();

  // Cleanup state since last test
  cleanupZubridge();
});

describe('@zubridge/tauri', () => {
  describe('Manual Initialization', () => {
    it('should set status to initializing then ready', async () => {
      expect(internalStore.getState().__bridge_status).toBe('uninitialized');
      const initPromise = initializeBridge(mockLegacyOptions);
      await waitFor(() => expect(internalStore.getState().__bridge_status).toBe('initializing'));
      await act(async () => {
        await initPromise;
      });
      expect(internalStore.getState().__bridge_status).toBe('ready');
    });

    it('should fetch initial state', async () => {
      mockBackendState = { counter: 55, initial: false };
      await act(async () => {
        await initializeBridge(mockLegacyOptions);
      });
      expect(mockInvoke).toHaveBeenCalledWith('__zubridge_get_initial_state', undefined);
      const state = internalStore.getState();
      expect(state.counter).toBe(55);
      expect(state.initial).toBe(false);
      expect(state.__bridge_status).toBe('ready');
    });

    it('should set up listener', async () => {
      await act(async () => {
        await initializeBridge(mockLegacyOptions);
      });
      expect(mockListenRaw).toHaveBeenCalledWith('__zubridge_state_update', expect.any(Function));
      expect(stateUpdateListener).toBeInstanceOf(Function);
    });

    it('should handle concurrent initialization calls gracefully', async () => {
      const p1 = initializeBridge(mockLegacyOptions);
      const p2 = initializeBridge(mockLegacyOptions);
      const p3 = initializeBridge(mockLegacyOptions);
      await act(async () => {
        await Promise.all([p1, p2, p3]);
      });
      expect(internalStore.getState().__bridge_status).toBe('ready');
      expect(mockInvoke).toHaveBeenCalledTimes(1);
      expect(mockListenRaw).toHaveBeenCalledTimes(1);
    });

    it('should handle re-initialization with new functions after cleanup', async () => {
      // First initialization
      await act(async () => {
        await initializeBridge(mockLegacyOptions);
      });

      expect(internalStore.getState().__bridge_status).toBe('ready');
      expect(mockInvoke).toHaveBeenCalledTimes(1);
      expect(mockListenRaw).toHaveBeenCalledTimes(1);

      // Capture current call counts
      const invokeCallCount = mockInvoke.mock.calls.length;

      // Clean up
      cleanupZubridge();
      expect(internalStore.getState().__bridge_status).toBe('uninitialized');

      // Create new mock functions
      const newMockInvoke = vi.fn(async <R = unknown>(cmd: string, args?: unknown): Promise<R> => {
        if (cmd === '__zubridge_get_initial_state') {
          return Promise.resolve({ counter: 100, initial: false, source: 'new' }) as Promise<R>;
        }
        return mockInvoke(cmd, args) as Promise<R>;
      });

      const newMockListen = async <E = unknown>(
        event: string,
        handler: (event: E) => void,
      ): Promise<UnlistenFn> => {
        return mockListenRaw(event, (e: { payload: unknown }) => {
          handler(e as unknown as E);
        });
      };

      // Re-initialize with new functions
      await act(async () => {
        await initializeBridge({
          invoke: newMockInvoke as BackendOptions['invoke'],
          listen: newMockListen,
          commands: {
            getInitialState: '__zubridge_get_initial_state',
            dispatchAction: '__zubridge_dispatch_action',
            stateUpdateEvent: '__zubridge_state_update',
          },
        });
      });

      // Verify re-initialization happened with new functions
      expect(internalStore.getState().__bridge_status).toBe('ready');
      expect(internalStore.getState().source).toBe('new');
      expect(internalStore.getState().counter).toBe(100);

      // Original mock wasn't called again
      expect(mockInvoke.mock.calls.length).toBe(invokeCallCount);

      // New mock was called
      expect(newMockInvoke).toHaveBeenCalledWith('__zubridge_get_initial_state', undefined);

      // Test dispatch with new function
      let dispatchFn: DispatchFunc<AnyState> | null = null;
      const TestComponent = () => {
        dispatchFn = useZubridgeDispatch();
        return null;
      };
      render(<TestComponent />);

      await act(async () => {
        await dispatchFn({ type: 'TEST_ACTION' });
      });

      // Should use new function for dispatch
      expect(newMockInvoke).toHaveBeenCalledWith('__zubridge_dispatch_action', expect.anything());
    });

    it('should throw error when options are missing', async () => {
      await expect(
        act(async () => {
          // @ts-expect-error - Testing invalid parameters
          await initializeBridge({});
        }),
      ).rejects.toThrow(
        "Zubridge Tauri: 'invoke' AND 'listen' functions must be provided in options.",
      );
    });

    it('should throw error when invoke function is missing', async () => {
      await expect(
        act(async () => {
          // @ts-expect-error - Testing invalid parameters
          await initializeBridge({ listen: mockListen });
        }),
      ).rejects.toThrow(
        "Zubridge Tauri: 'invoke' AND 'listen' functions must be provided in options.",
      );
    });

    it('should throw error when listen function is missing', async () => {
      await expect(
        act(async () => {
          // @ts-expect-error - Testing invalid parameters
          await initializeBridge({ invoke: mockInvoke });
        }),
      ).rejects.toThrow(
        "Zubridge Tauri: 'invoke' AND 'listen' functions must be provided in options.",
      );
    });

    it('should handle initialization with v1 Tauri APIs', async () => {
      const v1Invoke = vi.fn(async <R = unknown>(cmd: string, args?: unknown): Promise<R> => {
        return mockInvoke(cmd, args) as Promise<R>;
      });
      const v1Listen = vi.fn(
        async (event: string, callback: (event: { payload: unknown }) => void) => {
          return mockListenRaw(event, callback);
        },
      );

      await act(async () => {
        await initializeBridge({
          invoke: v1Invoke as BackendOptions['invoke'],
          listen: v1Listen as BackendOptions['listen'],
        });
      });

      // Should try plugin format first, then fall back to direct format
      expect(v1Invoke).toHaveBeenCalledWith('plugin:zubridge|get_initial_state', undefined);
      expect(v1Listen).toHaveBeenCalledWith('zubridge://state-update', expect.any(Function));
      expect(internalStore.getState().__bridge_status).toBe('ready');
    });

    it('should handle initialization with v2 Tauri APIs', async () => {
      const v2Invoke = vi.fn(async <R = unknown>(cmd: string, args?: unknown): Promise<R> => {
        return mockInvoke(cmd, args) as Promise<R>;
      });
      const v2Listen = vi.fn(
        async (event: string, callback: (event: { payload: unknown }) => void) => {
          return mockListenRaw(event, callback);
        },
      );

      await act(async () => {
        await initializeBridge({
          invoke: v2Invoke as BackendOptions['invoke'],
          listen: v2Listen as BackendOptions['listen'],
        });
      });

      expect(v2Invoke).toHaveBeenCalledWith('plugin:zubridge|get_initial_state', undefined);
      expect(v2Listen).toHaveBeenCalledWith('zubridge://state-update', expect.any(Function));
      expect(internalStore.getState().__bridge_status).toBe('ready');
    });

    it('should handle initialization failure (invoke)', async () => {
      const mockInvokeError = vi.fn().mockRejectedValue(new Error('Test init error'));
      const mockListenRaw = vi.fn();

      try {
        await initializeBridge({
          invoke: mockInvokeError as BackendOptions['invoke'],
          listen: mockListen,
        });
      } catch (_e) {
        // Expected to throw
      }

      const state = internalStore.getState();
      expect(state.__bridge_status).toBe('error');
      expect(state.__bridge_error).toBeDefined();
      expect(mockListenRaw).not.toHaveBeenCalled();
    });

    it('should handle initialization failure (listen)', async () => {
      const listenError = new Error('Listen failed');
      const failingMockListen = vi.fn().mockRejectedValue(listenError);

      await expect(
        act(async () => {
          await initializeBridge({
            invoke: mockInvoke as BackendOptions['invoke'],
            listen: failingMockListen as BackendOptions['listen'],
          });
        }),
      ).rejects.toThrow();

      // Use waitFor to ensure state update from catch block occurs
      await waitFor(() => {
        const state = internalStore.getState();
        expect(state.__bridge_status).toBe('error');
        expect(state.__bridge_error).toBeDefined();
      });

      expect(unlistenMock).not.toHaveBeenCalled();
    });

    // New tests for the flexible command formats

    it('should initialize with plugin format commands', async () => {
      // Mock to simulate plugin format supported by backend
      const pluginInvoke = vi.fn(async <R = unknown>(cmd: string, _args?: unknown): Promise<R> => {
        if (cmd === 'plugin:zubridge|get_initial_state') {
          return Promise.resolve({ counter: 42, source: 'plugin' }) as Promise<R>;
        }
        if (cmd === 'plugin:zubridge|dispatch_action') {
          return Promise.resolve() as Promise<R>;
        }
        return Promise.reject(new Error(`Unknown command: ${cmd}`)) as Promise<R>;
      });

      // Reset the spy before passing it to ensure call count is 0
      pluginInvoke.mockClear();

      await act(async () => {
        await initializeBridge({
          invoke: pluginInvoke as BackendOptions['invoke'],
          listen: mockListen,
          commands: {
            getInitialState: 'plugin:zubridge|get_initial_state',
            dispatchAction: 'plugin:zubridge|dispatch_action',
            stateUpdateEvent: 'zubridge://state-update',
          },
        });
      });

      // Should try plugin format first and succeed
      expect(pluginInvoke).toHaveBeenCalledWith('plugin:zubridge|get_initial_state', undefined);
      expect(internalStore.getState().counter).toBe(42);
      expect(internalStore.getState().source).toBe('plugin');

      // Test that dispatch uses the plugin format
      let dispatchFn: DispatchFunc<AnyState> | null = null;
      const TestComponent = () => {
        dispatchFn = useZubridgeDispatch();
        return null;
      };
      render(<TestComponent />);

      await act(async () => {
        await dispatchFn({ type: 'TEST_PLUGIN' });
      });

      expect(pluginInvoke).toHaveBeenCalledWith(
        'plugin:zubridge|dispatch_action',
        expect.anything(),
      );
    });

    it('should fall back to direct format commands when plugin format fails', async () => {
      cleanupZubridge();

      // Create a mock function that fails for plugin format but succeeds for direct format
      const mockPluginFailInvoke = vi.fn().mockImplementation((command, _args) => {
        if (command.startsWith('plugin:')) {
          return Promise.reject(new Error('Plugin format not supported'));
        }
        return Promise.resolve({ counter: 100 });
      });

      // Initialize with our custom invoke function
      await act(async () => {
        await initializeBridge({
          invoke: mockPluginFailInvoke as BackendOptions['invoke'],
          listen: mockListen,
        });
      });

      // Verify that the plugin format was tried first and then the direct format
      expect(mockPluginFailInvoke).toHaveBeenCalledWith(
        'plugin:zubridge|get_initial_state',
        undefined,
      );
      expect(mockPluginFailInvoke).toHaveBeenCalledWith('get_initial_state', undefined);

      // Wait for the state to be updated after the async operations complete
      await waitFor(() => {
        const state = internalStore.getState();
        return state.__bridge_status === 'ready';
      });

      // Verify that the store was updated with the bridge status
      const state = internalStore.getState();
      expect(state.__bridge_status).toBe('ready');

      // The active commands are stored in the module scope variable 'activeCommands'
      // Access it via a test component using the dispatch function
      let dispatchFn: DispatchFunc<AnyState> | null = null;
      const TestComponent = () => {
        dispatchFn = useZubridgeDispatch();
        return null;
      };
      render(<TestComponent />);

      // Test that dispatch uses the direct format
      await act(async () => {
        await dispatchFn({ type: 'TEST_DIRECT' });
      });

      // Verify dispatch called the direct command format
      expect(mockPluginFailInvoke).toHaveBeenCalledWith('dispatch_action', expect.anything());
    });

    it('should use custom command names when provided', async () => {
      await act(async () => {
        await initializeBridge(mockCustomOptions);
      });

      // Should use the custom command name directly
      expect(mockInvoke).toHaveBeenCalledWith('custom_get_state', undefined);
      expect(mockListenRaw).toHaveBeenCalledWith('custom-event', expect.any(Function));

      // Test that dispatch uses the custom command name
      let dispatchFn: DispatchFunc<AnyState> | null = null;
      const TestComponent = () => {
        dispatchFn = useZubridgeDispatch();
        return null;
      };
      render(<TestComponent />);

      await act(async () => {
        await dispatchFn({ type: 'TEST_CUSTOM' });
      });

      expect(mockInvoke).toHaveBeenCalledWith('custom_dispatch', expect.anything());
    });

    it('should throw when command format fails', async () => {
      cleanupZubridge();

      // Mock a failing invoke function
      const failingInvoke = vi.fn().mockImplementation(() => {
        throw new Error('Mock backend error');
      });

      // Attempt to initialize with failing invoke
      await expect(
        initializeBridge({
          invoke: failingInvoke as BackendOptions['invoke'],
          listen: mockListen,
        }),
      ).rejects.toThrow('Failed to connect to backend');

      // Check that invoke was called with the plugin command format
      expect(failingInvoke).toHaveBeenCalledWith('plugin:zubridge|get_initial_state', undefined);

      // Verify bridge status was set to error
      expect(internalStore.getState().__bridge_status).toBe('error');

      // Clean up
      cleanupZubridge();
    });

    it('should dispatch an action', async () => {
      await initializeBridge({
        invoke: mockInvoke as BackendOptions['invoke'],
        listen: mockListen,
      });

      let dispatchFn: DispatchFunc<AnyState> | null = null;
      const TestComponent = () => {
        dispatchFn = useZubridgeDispatch();
        return null;
      };
      render(<TestComponent />);

      await act(async () => {
        await dispatchFn({
          type: 'INCREMENT',
          payload: 1,
        });
      });

      expect(mockInvoke).toHaveBeenCalled();
    });
  });

  describe('State Updates', () => {
    it('should update store when state update event is received', async () => {
      await act(async () => {
        await initializeBridge(mockLegacyOptions);
      });
      await waitFor(() => expect(internalStore.getState().__bridge_status).toBe('ready'));
      await waitFor(() => expect(stateUpdateListener).toBeInstanceOf(Function));

      const updatedState: Partial<TestState> = { counter: 150, message: 'Event Update' };
      simulateStateUpdate(updatedState);

      await waitFor(() => {
        const state = internalStore.getState();
        expect(state.counter).toBe(150);
        expect(state.message).toBe('Event Update');
      });
      expect(internalStore.getState().__bridge_status).toBe('ready');
    });

    it('should handle multiple successive state updates correctly', async () => {
      cleanupZubridge();

      // Setup with initial state
      act(() => {
        internalStore.setState({
          counter: 10,
          initial: true,
        });
      });

      // Set up component to track state changes
      let renderCount = 0;
      const counterValues: number[] = [];

      function CounterTrackingComponent() {
        const state = useZubridgeStore<AnyState>((state) => state);
        const counter = (state?.counter as number) || 0;

        // Track render count and values
        useEffect(() => {
          renderCount++;
          counterValues.push(counter);
        }, [counter]);

        return <div data-testid="counter">{counter}</div>;
      }

      // Initialize bridge
      await initializeBridge({
        invoke: mockInvoke as BackendOptions['invoke'],
        listen: mockListen,
      });

      // Render component to track state
      render(<CounterTrackingComponent />);

      // Initial render should have occurred
      expect(renderCount).toBe(1);
      expect(counterValues[0]).toBe(10);

      // Simulate first state update
      act(() => {
        simulateStateUpdate({ counter: 20 });
      });

      // Wait for the state update to propagate
      await waitFor(() => {
        expect(counterValues.length).toBe(2);
      });

      // Check values after first update
      expect(renderCount).toBe(2);
      expect(counterValues[1]).toBe(20);

      // Simulate second state update
      act(() => {
        simulateStateUpdate({ counter: 30 });
      });

      // Wait for the second update
      await waitFor(() => {
        expect(counterValues.length).toBe(3);
      });

      // Check after second update
      expect(renderCount).toBe(3);
      expect(counterValues[2]).toBe(30);

      cleanupZubridge();
    });
  });

  describe('useZubridgeDispatch Hook', () => {
    it('should invoke backend command via useZubridgeDispatch', async () => {
      await act(async () => {
        await initializeBridge(mockLegacyOptions);
      });

      let dispatchFn: DispatchFunc<AnyState> | null = null;
      const TestComponent = () => {
        dispatchFn = useZubridgeDispatch();
        return null;
      };
      render(<TestComponent />);

      expect(dispatchFn).toBeInstanceOf(Function);

      const testAction: Action = { type: 'TEST_ACTION', payload: { value: 1 } };
      await act(async () => {
        await dispatchFn(testAction);
      });

      expect(mockInvoke).toHaveBeenCalledWith('__zubridge_dispatch_action', expect.anything());
    });

    it('should handle dispatch failure', async () => {
      await act(async () => {
        await initializeBridge(mockLegacyOptions);
      });

      // Override mockInvoke for specific command
      const dispatchError = new Error('Dispatch failed');
      mockInvoke.mockImplementation(async (cmd: string, _args?: unknown) => {
        if (cmd === '__zubridge_dispatch_action') {
          throw dispatchError;
        }
        // Default behavior for other commands
        return mockBackendState;
      });

      let dispatchFn: DispatchFunc<AnyState> | null = null;
      const TestComponent = () => {
        dispatchFn = useZubridgeDispatch();
        return null;
      };
      render(<TestComponent />);
      expect(dispatchFn).toBeInstanceOf(Function);

      const testAction: Action = { type: 'FAILING_ACTION' };
      await expect(
        act(async () => {
          await dispatchFn(testAction);
        }),
      ).rejects.toThrow(dispatchError);
    });

    it('should execute thunks locally with state and dispatch', async () => {
      await act(async () => {
        await initializeBridge(mockLegacyOptions);
      });

      // Initialize state for testing
      mockBackendState = { counter: 42, initial: false };
      internalStore.setState({
        ...mockBackendState,
        __bridge_status: 'ready',
      });

      // Create a component to get the dispatch function
      let dispatchFn: DispatchFunc<AnyState> | null = null;
      const TestComponent = () => {
        dispatchFn = useZubridgeDispatch();
        return null;
      };
      render(<TestComponent />);
      expect(dispatchFn).toBeInstanceOf(Function);

      // Reset the mockInvoke implementation to ensure it doesn't throw errors
      // This prevents unhandled rejections in this test
      mockInvoke.mockImplementation(async (cmd: string, _args?: unknown): Promise<unknown> => {
        if (cmd === '__zubridge_dispatch_action') {
          return Promise.resolve();
        }
        // Default behavior for other commands
        return mockBackendState;
      });

      // Create a thunk that accesses state and calls dispatch
      const thunkMock = vi.fn(async (getState, dispatch) => {
        const state = await getState();
        expect(state.counter).toBe(42);

        // Dispatch an action from within the thunk
        dispatch({ type: 'THUNK_NESTED_ACTION', payload: state.counter * 2 });
        return Promise.resolve('thunk result');
      });

      // Execute the thunk
      let result: unknown;
      await act(async () => {
        result = await dispatchFn(thunkMock);
      });

      // Verify thunk was executed and dispatch was called
      expect(thunkMock).toHaveBeenCalled();
      expect(mockInvoke).toHaveBeenCalledWith('__zubridge_dispatch_action', {
        action: { action_type: 'THUNK_NESTED_ACTION', payload: 84 },
      });
      expect(result).toBe('thunk result');
    });

    it('should handle thunk errors', async () => {
      await act(async () => {
        await initializeBridge(mockLegacyOptions);
      });

      // Get dispatch function
      let dispatchFn: DispatchFunc<AnyState> | null = null;
      render(
        <TestComponent
          setDispatch={(fn) => {
            dispatchFn = fn;
          }}
        />,
      );

      // Create a thunk that throws an error
      const errorThunk = () => {
        throw new Error('Thunk execution failed');
      };

      // Execute the thunk and expect it to throw
      await expect(
        act(async () => {
          await dispatchFn(errorThunk);
        }),
      ).rejects.toThrow('Thunk execution failed');
    });
  });

  describe('Direct State Interaction Functions', () => {
    beforeEach(async () => {
      // Initialize bridge before each test in this suite
      await act(async () => {
        await initializeBridge(mockLegacyOptions);
      });
      // Ensure the bridge is ready
      await waitFor(() => expect(internalStore.getState().__bridge_status).toBe('ready'));
    });

    it('getState should invoke active command', async () => {
      mockBackendState = { counter: 99, initial: false };
      await getState();
      // In this case it should use the legacy command from the options
      expect(mockInvoke).toHaveBeenCalledWith('__zubridge_get_initial_state', undefined);
    });

    it('should handle getState failure', async () => {
      const getError = new Error('getState failed');
      mockInvoke.mockImplementationOnce(() => Promise.reject(getError));
      await expect(getState()).rejects.toThrow(getError);
    });

    it('updateState should invoke update_state', async () => {
      const newState = { counter: 101, initial: false, message: 'Direct Update' };
      await updateState(newState);
      expect(mockInvoke).toHaveBeenCalledWith('update_state', { state: { value: newState } });
    });

    it('should handle updateState failure', async () => {
      const updateError = new Error('updateState failed');
      mockInvoke.mockImplementationOnce(() => Promise.reject(updateError));
      await expect(updateState({ failed: true })).rejects.toThrow(updateError);
    });

    it('should throw error when getState is called without active command', async () => {
      cleanupZubridge(); // Reset activeCommands
      await expect(getState()).rejects.toThrow('Zubridge not initialized');
    });
  });

  describe('cleanupZubridge Functionality', () => {
    it('should call unlisten and set status to uninitialized', async () => {
      await act(async () => {
        await initializeBridge(mockLegacyOptions);
      });
      await waitFor(() => expect(internalStore.getState().__bridge_status).toBe('ready'));

      const callsBeforeCleanup = unlistenMock.mock.calls.length;
      cleanupZubridge();

      expect(unlistenMock.mock.calls.length).toBeGreaterThan(callsBeforeCleanup);
      expect(internalStore.getState().__bridge_status).toBe('uninitialized');

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      expect(internalStore.getState().__bridge_status).toBe('uninitialized');
    });
  });

  describe('useZubridgeStore Hook', () => {
    it('should return selected state slice after initialization', async () => {
      mockBackendState = { counter: 88, initial: true, message: 'Hook Test' };
      await act(async () => {
        await initializeBridge(mockLegacyOptions);
      });
      await waitFor(() => expect(internalStore.getState().__bridge_status).toBe('ready'));

      let messageFromHook: string | undefined;
      let statusFromHook: string | undefined;
      const TestComponent = () => {
        messageFromHook = useZubridgeStore((s) => s.message as string | undefined);
        statusFromHook = useZubridgeStore((s) => s.__bridge_status as string | undefined);
        return <div>Message: {messageFromHook ?? 'N/A'}</div>;
      };

      render(<TestComponent />);

      await waitFor(() => {
        expect(statusFromHook).toBe('ready');
        expect(messageFromHook).toBe('Hook Test');
      });
      expect(await screen.findByText('Message: Hook Test')).toBeInTheDocument();
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle direct functions without initialization', async () => {
      // This tests lines 67-69
      cleanupZubridge();

      // Try to use functions without initialization
      await expect(getState()).rejects.toThrow('Zubridge not initialized');
      await expect(updateState({ test: true })).rejects.toThrow('Zubridge not initialized');
    });

    it('should handle dispatch when bridge is initializing', async () => {
      // Tests lines 209-211 and 195-202
      cleanupZubridge();

      // Set bridge to initializing but don't wait for it to complete
      const initPromise = initializeBridge(mockLegacyOptions);

      // Render component to get dispatch function wrapped in act()
      let dispatchFn: DispatchFunc<AnyState> | null = null;
      await act(async () => {
        render(
          <React.StrictMode>
            <TestComponent
              setDispatch={(fn) => {
                dispatchFn = fn;
              }}
            />
          </React.StrictMode>,
        );
      });

      expect(dispatchFn).toBeInstanceOf(Function);

      // Mock a successful response for the dispatch
      mockInvoke.mockImplementation(async (cmd: string, _args?: unknown) => {
        if (cmd === '__zubridge_dispatch_action') {
          return Promise.resolve();
        }
        return mockBackendState;
      });

      // Dispatch while bridge is initializing (should wait for initialization)
      const actionPromise = dispatchFn({ type: 'TEST_WAIT' });

      // Complete initialization
      await act(async () => {
        await initPromise;
      });

      // Action should complete after initialization
      await actionPromise;

      // Updated test - the payload structure needs to match what's used in index.ts
      expect(mockInvoke).toHaveBeenCalledWith('__zubridge_dispatch_action', {
        action: {
          action_type: 'TEST_WAIT',
          payload: undefined,
        },
      });
    });

    it('should handle dispatch without active command', async () => {
      cleanupZubridge();

      // Mock invoke and listen functions
      const mockInvokeFunc = vi.fn();
      const mockListenFunc = vi.fn();

      // Initialize the bridge with proper functions
      initializeBridge({
        invoke: mockInvokeFunc,
        listen: mockListenFunc,
        commands: {
          getInitialState: 'get_initial_state',
          // Empty dispatch command simulates missing command
          dispatchAction: '',
          stateUpdateEvent: 'state_update',
        },
      });

      // Set bridge status to ready to bypass initialization checks
      act(() => {
        internalStore.setState({
          __bridge_status: 'ready',
          counter: 0,
        });
      });

      // Use renderHook to get the dispatch function
      const { result } = renderHook(() => useZubridgeDispatch());

      // Test that it throws the expected error about missing dispatch command
      await expect(result.current({ type: 'TEST' })).rejects.toThrow(
        'Zubridge dispatch command not determined',
      );

      cleanupZubridge();
    });

    it('should handle dispatch when the bridge is not ready and no initialization is in progress', async () => {
      // Tests lines 218-248 more thoroughly
      cleanupZubridge();

      // Set the bridge status to something other than 'ready' but without an initialization promise
      internalStore.setState({ __bridge_status: 'uninitialized' });

      // Render component to get dispatch function
      let dispatchFn: DispatchFunc<AnyState> | null = null;
      await act(async () => {
        render(
          <React.StrictMode>
            <TestComponent
              setDispatch={(fn) => {
                dispatchFn = fn;
              }}
            />
          </React.StrictMode>,
        );
      });

      // This should fail specifically with the updated error message that matches the implementation
      await expect(dispatchFn({ type: 'NO_INIT_PROMISE' })).rejects.toThrow(
        'Zubridge is not initialized (missing invoke function)',
      );
    });

    it('should handle initialization errors when trying to dispatch', async () => {
      // Tests lines 195-202 more thoroughly
      cleanupZubridge();

      // Create a failing initialization
      const initError = new Error('Test init error');
      const failingInit = vi.fn().mockRejectedValue(initError);

      // Start initialization but expect it to fail
      let initPromise: Promise<void>;
      try {
        initPromise = initializeBridge({
          invoke: failingInit,
          listen: mockListen,
        });
        await initPromise;
      } catch (_e) {
        // Expected error
      }

      // Now the bridge should be in error state
      expect(internalStore.getState().__bridge_status).toBe('error');

      // Render component to get dispatch function
      let dispatchFn: DispatchFunc<AnyState> | null = null;
      await act(async () => {
        render(
          <React.StrictMode>
            <TestComponent
              setDispatch={(fn) => {
                dispatchFn = fn;
              }}
            />
          </React.StrictMode>,
        );
      });

      // Don't try to access initializePromise directly
      // Instead, we verify the error behavior from dispatch directly

      // This should fail with an error related to initialization
      await expect(
        act(async () => {
          // We expect this to fail because the bridge is in error state
          await dispatchFn({ type: 'INIT_ERROR' });
        }),
      ).rejects.toThrow();

      // Verify the error state remains
      expect(internalStore.getState().__bridge_status).toBe('error');
      expect(internalStore.getState().__bridge_error).toBeDefined();

      // Cleanup properly
      cleanupZubridge();
    });
  });

  // Test the dispatch function from useZubridgeDispatch
  describe('dispatching actions', () => {
    let dispatch: DispatchFunc<AnyState>;

    beforeEach(() => {
      vi.clearAllMocks();
      // Define resetState function instead of calling it
      const resetState = () => {
        cleanupZubridge();
        mockBackendState = { counter: 0, initial: true };
      };
      resetState();

      // Get the dispatch function from the hook
      const TestComponent = () => {
        dispatch = useZubridgeDispatch<AnyState>();
        return null;
      };
      render(<TestComponent />);
    });

    // Add at least one test to prevent "No test found in suite" error
    it('should be defined', () => {
      expect(dispatch).toBeDefined();
    });
  });
});

// Helper component to fix React act() warnings
interface TestProps {
  setDispatch: (dispatch: DispatchFunc<AnyState>) => void;
}

function TestComponent({ setDispatch }: TestProps) {
  const dispatch = useZubridgeDispatch();
  React.useEffect(() => {
    setDispatch(dispatch);
  }, [dispatch, setDispatch]);
  return null;
}
