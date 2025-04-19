import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Store } from 'redux';
import type { AnyState, Action } from '@zubridge/types';

import { createReduxAdapter } from '../../src/adapters/redux.js';

// Create a mock Redux store
function createMockStore(initialState: AnyState = {}) {
  let currentState = { ...initialState };
  const listeners: Array<() => void> = [];

  const store = {
    getState: vi.fn(() => currentState),
    dispatch: vi.fn((action: any) => {
      if (action.type === 'TEST_ACTION') {
        currentState = { ...currentState, value: action.payload };
      }
      // Notify all listeners
      listeners.forEach((listener) => listener());
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

    it('should catch and log errors during action processing', () => {
      const errorStore = createMockStore();
      errorStore.dispatch = vi.fn().mockImplementation(() => {
        throw new Error('Test dispatch error');
      });

      const errorAdapter = createReduxAdapter(errorStore);

      // Mock console.error
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const action: Action = { type: 'ERROR_ACTION', payload: 'error-data' };
      errorAdapter.processAction(action);

      // Verify error was logged
      expect(consoleErrorSpy).toHaveBeenCalledWith('Error processing Redux action:', expect.any(Error));

      // Restore console.error
      consoleErrorSpy.mockRestore();
    });
  });
});
