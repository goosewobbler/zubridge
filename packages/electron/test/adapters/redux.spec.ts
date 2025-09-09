import type { Action, AnyState } from '@zubridge/types';
import type { Store } from 'redux';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createReduxAdapter } from '../../src/adapters/redux.js';

// Mock the debug utility
vi.mock('@zubridge/core', () => ({
  debug: vi.fn(), // Simplified mock
}));

// Create a mock Redux store
function createMockStore(initialState: AnyState = {}) {
  let currentState = { ...initialState };
  const listeners: Array<() => void> = [];

  const store = {
    getState: vi.fn(() => currentState),
    dispatch: vi.fn((action: Action) => {
      if (action.type === 'TEST_ACTION') {
        currentState = { ...currentState, value: action.payload };
      }
      // Notify all listeners
      listeners.forEach((listener) => {
        listener();
      });
      return action;
    }),
    subscribe: vi.fn((listener: () => void) => {
      listeners.push(listener);
      return () => {
        const index = listeners.indexOf(listener);
        if (index > -1) {
          listeners.splice(index, 1);
        }
      };
    }),
    replaceReducer: vi.fn(),
    [Symbol.observable]: vi.fn(),
  };

  return store as unknown as Store<AnyState>;
}

describe('Redux Adapter', () => {
  let store: Store<AnyState>;
  let adapter: ReturnType<typeof createReduxAdapter>;

  beforeEach(() => {
    store = createMockStore({ value: 0 });
    adapter = createReduxAdapter(store);
  });

  describe('getState', () => {
    it('should return the current store state', () => {
      const state = adapter.getState();
      expect(state).toEqual({ value: 0 });
      expect(store.getState).toHaveBeenCalled();
    });
  });

  describe('subscribe', () => {
    it('should subscribe to store updates and call listener with state', () => {
      const listener = vi.fn();
      const unsubscribe = adapter.subscribe(listener);

      // Verify subscribe was called
      expect(store.subscribe).toHaveBeenCalled();

      // Dispatch an action to trigger the subscription
      store.dispatch({ type: 'TEST_ACTION', payload: 42 });

      // Verify listener was called with the new state
      expect(listener).toHaveBeenCalledWith({ value: 42 });

      // Unsubscribe and verify no more calls
      unsubscribe();
      store.dispatch({ type: 'TEST_ACTION', payload: 100 });
      expect(listener).toHaveBeenCalledTimes(1);
    });
  });

  describe('processAction', () => {
    it('should dispatch actions to the Redux store', () => {
      const action: Action = { type: 'TEST_ACTION', payload: 99 };
      adapter.processAction(action);

      // Verify action was dispatched to store
      expect(store.dispatch).toHaveBeenCalledWith(action);

      // Verify state was updated
      expect(store.getState()).toEqual({ value: 99 });
    });

    it('should use custom handlers when provided', () => {
      const customHandler = vi.fn();
      const adapterWithHandlers = createReduxAdapter(store, {
        handlers: {
          CUSTOM_ACTION: customHandler,
        },
      });

      const action: Action = { type: 'CUSTOM_ACTION', payload: 'test-data' };
      adapterWithHandlers.processAction(action);

      // Verify handler was called
      expect(customHandler).toHaveBeenCalledWith('test-data');

      // Verify direct store dispatch was not called
      expect(store.dispatch).not.toHaveBeenCalledWith(action);
    });

    it('should handle handlers with case-insensitive matching', () => {
      const incrementHandler = vi.fn();
      const decrementHandler = vi.fn();
      const adapterWithHandlers = createReduxAdapter(store, {
        handlers: {
          increment: incrementHandler,
          DECREMENT: decrementHandler,
        },
      });

      // Test uppercase action with lowercase handler
      adapterWithHandlers.processAction({ type: 'INCREMENT', payload: 5 });
      expect(incrementHandler).toHaveBeenCalledWith(5);

      // Test lowercase action with uppercase handler
      adapterWithHandlers.processAction({ type: 'decrement', payload: 3 });
      expect(decrementHandler).toHaveBeenCalledWith(3);

      // Verify direct store dispatch was not called
      expect(store.dispatch).not.toHaveBeenCalled();
    });

    describe('nested path resolution', () => {
      it('should resolve nested path handlers', () => {
        const counterHandler = vi.fn();
        const themeHandler = vi.fn();

        const adapterWithNestedHandlers = createReduxAdapter(store, {
          handlers: {
            counter: {
              increment: counterHandler,
            },
            theme: {
              toggle: themeHandler,
            },
          },
        });

        // Test counter.increment action
        const counterAction: Action = { type: 'counter.increment', payload: 5 };
        adapterWithNestedHandlers.processAction(counterAction);
        expect(counterHandler).toHaveBeenCalledWith(5);

        // Test theme.toggle action
        const themeAction: Action = { type: 'theme.toggle', payload: true };
        adapterWithNestedHandlers.processAction(themeAction);
        expect(themeHandler).toHaveBeenCalledWith(true);

        // Verify direct store dispatch was not called
        expect(store.dispatch).not.toHaveBeenCalledWith(counterAction);
        expect(store.dispatch).not.toHaveBeenCalledWith(themeAction);
      });

      it('should resolve case-insensitive nested path handlers', () => {
        const counterHandler = vi.fn();

        const adapterWithNestedHandlers = createReduxAdapter(store, {
          handlers: {
            Counter: {
              Increment: counterHandler,
            },
          },
        });

        // Test counter.increment action with different casing
        const counterAction: Action = { type: 'counter.increment', payload: 10 };
        adapterWithNestedHandlers.processAction(counterAction);
        expect(counterHandler).toHaveBeenCalledWith(10);
      });

      it('should handle deeply nested paths', () => {
        const updateHandler = vi.fn();

        const adapterWithDeepHandlers = createReduxAdapter(store, {
          handlers: {
            ui: {
              settings: {
                theme: {
                  update: updateHandler,
                },
              },
            },
          },
        });

        // Test deeply nested path resolution
        adapterWithDeepHandlers.processAction({
          type: 'ui.settings.theme.update',
          payload: 'light',
        });
        expect(updateHandler).toHaveBeenCalledWith('light');
        expect(store.dispatch).not.toHaveBeenCalled();
      });

      it('should fall back to exact paths when nested path not found', () => {
        const exactPathHandler = vi.fn();

        const adapter = createReduxAdapter(store, {
          handlers: {
            'counter.increment': exactPathHandler,
          },
        });

        // This should match the exact path 'counter.increment'
        adapter.processAction({ type: 'counter.increment', payload: 1 });
        expect(exactPathHandler).toHaveBeenCalledWith(1);
        expect(store.dispatch).not.toHaveBeenCalled();
      });

      it('should dispatch to Redux when no matching handler is found', () => {
        const incrementHandler = vi.fn();

        const adapterWithHandlers = createReduxAdapter(store, {
          handlers: {
            counter: {
              increment: incrementHandler,
            },
          },
        });

        // This should be dispatched to Redux since there's no matching handler
        const action: Action = { type: 'counter.decrement', payload: 1 };
        adapterWithHandlers.processAction(action);

        expect(incrementHandler).not.toHaveBeenCalled();
        expect(store.dispatch).toHaveBeenCalledWith(action);
      });
    });

    it('should catch and log errors during action processing', () => {
      const errorStore = createMockStore();
      errorStore.dispatch = vi.fn().mockImplementation(() => {
        throw new Error('Test dispatch error');
      });

      const errorAdapter = createReduxAdapter(errorStore);

      const action: Action = { type: 'ERROR_ACTION', payload: 'error-data' };
      // Expect this path to be taken, error to be handled internally by debug log
      expect(() => errorAdapter.processAction(action)).not.toThrow();
    });

    it('should catch and log errors from handlers', () => {
      const errorHandler = vi.fn().mockImplementation(() => {
        throw new Error('Test handler error');
      });

      const errorStore = createMockStore();
      errorStore.dispatch = vi.fn();

      const adapter = createReduxAdapter(errorStore, {
        handlers: {
          ERROR_HANDLER_ACTION: errorHandler,
        },
      });

      const action: Action = { type: 'ERROR_HANDLER_ACTION', payload: 'error-data' };
      // Expect this path to be taken, error to be handled internally by debug log
      expect(() => adapter.processAction(action)).not.toThrow();
      expect(errorHandler).toHaveBeenCalled();
      expect(errorStore.dispatch).not.toHaveBeenCalled();
    });

    it('should handle async handlers that resolve successfully', async () => {
      const asyncHandler = vi.fn().mockResolvedValue('async-result');

      const adapter = createReduxAdapter(store, {
        handlers: {
          ASYNC_SUCCESS_ACTION: asyncHandler,
        },
      });

      const action: Action = { type: 'ASYNC_SUCCESS_ACTION', payload: 'test-data' };
      const result = adapter.processAction(action);

      expect(asyncHandler).toHaveBeenCalledWith('test-data');
      expect(result).toEqual({
        isSync: false,
        completion: expect.any(Promise),
      });

      // Wait for the async completion
      await result.completion;
      expect(asyncHandler).toHaveBeenCalledTimes(1);
    });

    it('should handle async handler errors', async () => {
      const asyncHandler = vi.fn().mockRejectedValue(new Error('Async handler failed'));

      const adapter = createReduxAdapter(store, {
        handlers: {
          ASYNC_ERROR_ACTION: asyncHandler,
        },
      });

      const action: Action = { type: 'ASYNC_ERROR_ACTION', payload: 'test-data' };
      const result = adapter.processAction(action);

      expect(asyncHandler).toHaveBeenCalledWith('test-data');
      expect(result).toEqual({
        isSync: false,
        completion: expect.any(Promise),
      });

      // Wait for the async completion and check error handling
      const completionResult = await result.completion;
      expect(completionResult).toEqual({
        error: expect.stringContaining('Async handler execution failed'),
      });
    });

    it('should handle sync handlers that complete successfully', () => {
      const syncHandler = vi.fn().mockReturnValue('sync-result');

      const adapter = createReduxAdapter(store, {
        handlers: {
          SYNC_SUCCESS_ACTION: syncHandler,
        },
      });

      const action: Action = { type: 'SYNC_SUCCESS_ACTION', payload: 'test-data' };
      const result = adapter.processAction(action);

      expect(syncHandler).toHaveBeenCalledWith('test-data');
      expect(result).toEqual({ isSync: true });
      expect(store.dispatch).not.toHaveBeenCalled();
    });

    it('should handle middleware option', () => {
      const mockMiddleware = vi.fn();

      const adapter = createReduxAdapter(store, {
        middleware: mockMiddleware,
      });

      // The middleware should be passed through but not directly tested here
      // since it's more of an integration concern
      expect(adapter).toBeDefined();
    });

    it('should handle actions with no custom handlers by dispatching to Redux', () => {
      const action: Action = { type: 'NO_HANDLER_ACTION', payload: 'test-data' };

      const adapter = createReduxAdapter(store, {
        handlers: {
          // No handlers defined
        },
      });

      const result = adapter.processAction(action);

      expect(store.dispatch).toHaveBeenCalledWith(action);
      expect(result).toEqual({ isSync: true });
    });

    it('should handle undefined options gracefully', () => {
      const action: Action = { type: 'UNDEFINED_OPTIONS_ACTION', payload: 'test-data' };

      const adapter = createReduxAdapter(store, undefined);

      const result = adapter.processAction(action);

      expect(store.dispatch).toHaveBeenCalledWith(action);
      expect(result).toEqual({ isSync: true });
    });

    it('should handle empty handlers object', () => {
      const action: Action = { type: 'EMPTY_HANDLERS_ACTION', payload: 'test-data' };

      const adapter = createReduxAdapter(store, { handlers: {} });

      const result = adapter.processAction(action);

      expect(store.dispatch).toHaveBeenCalledWith(action);
      expect(result).toEqual({ isSync: true });
    });
  });
});
