import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnyState, StateManager, Action } from '@zubridge/types';
import type { StoreApi } from 'zustand/vanilla';
import type { Store } from 'redux';

import { createDispatch } from '../../src/utils/dispatch.js';
import * as stateManagerRegistry from '../../src/utils/stateManagerRegistry.js';

// Helper to create a mock StateManager
function createMockStateManager() {
  return {
    getState: vi.fn(() => ({ counter: 0 })),
    subscribe: vi.fn(() => () => {}),
    processAction: vi.fn(),
  } as unknown as StateManager<AnyState>;
}

// Helper to create a mock Zustand store
function createMockZustandStore() {
  return {
    getState: vi.fn(() => ({ counter: 0 })),
    setState: vi.fn(),
    subscribe: vi.fn(() => () => {}),
    destroy: vi.fn(),
  } as unknown as StoreApi<AnyState>;
}

// Helper to create a mock Redux store
function createMockReduxStore() {
  return {
    getState: vi.fn(() => ({ counter: 0 })),
    dispatch: vi.fn(),
    subscribe: vi.fn(() => () => {}),
    replaceReducer: vi.fn(),
    [Symbol.observable]: vi.fn(),
  } as unknown as Store<AnyState>;
}

describe('createDispatch utility', () => {
  let stateManager: StateManager<AnyState>;
  let zustandStore: StoreApi<AnyState>;
  let reduxStore: Store<AnyState>;
  let getStateManagerSpy: any;

  beforeEach(() => {
    vi.resetAllMocks();
    stateManager = createMockStateManager();
    zustandStore = createMockZustandStore();
    reduxStore = createMockReduxStore();

    // Spy on getStateManager to control its behavior
    getStateManagerSpy = vi.spyOn(stateManagerRegistry, 'getStateManager').mockImplementation(() => stateManager);
  });

  describe('createDispatch with StateManager', () => {
    it('should create a dispatch function that processes actions', () => {
      const dispatch = createDispatch(stateManager);
      const action: Action = { type: 'TEST_ACTION', payload: 42 };

      dispatch(action);

      expect(stateManager.processAction).toHaveBeenCalledWith(action);
    });

    it('should handle string actions with separate payload', () => {
      const dispatch = createDispatch(stateManager);

      dispatch('TEST_ACTION', 42);

      expect(stateManager.processAction).toHaveBeenCalledWith({
        type: 'TEST_ACTION',
        payload: 42,
      });
    });

    it('should handle thunks', () => {
      const dispatch = createDispatch(stateManager);
      const thunkFn = vi.fn((getState, dispatch) => {
        const state = getState();
        expect(state).toEqual({ counter: 0 });
        dispatch('NESTED_ACTION', 99);
      });

      dispatch(thunkFn);

      expect(thunkFn).toHaveBeenCalled();
      expect(stateManager.getState).toHaveBeenCalled();
      expect(stateManager.processAction).toHaveBeenCalledWith({
        type: 'NESTED_ACTION',
        payload: 99,
      });
    });

    it('should log errors for invalid actions', () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const dispatch = createDispatch(stateManager);

      // @ts-ignore - Testing invalid input
      dispatch(null);

      expect(consoleErrorSpy).toHaveBeenCalledWith('Invalid action or thunk:', null);
      consoleErrorSpy.mockRestore();
    });

    it('should catch and log errors during dispatch', () => {
      stateManager.processAction = vi.fn().mockImplementation(() => {
        throw new Error('Test error');
      });

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const dispatch = createDispatch(stateManager);

      dispatch({ type: 'ERROR_ACTION' });

      expect(consoleErrorSpy).toHaveBeenCalledWith('Error in dispatch:', expect.any(Error));
      consoleErrorSpy.mockRestore();
    });
  });

  describe('createDispatch with Store', () => {
    it('should create a dispatch function for Zustand store', () => {
      const dispatch = createDispatch(zustandStore);

      dispatch({ type: 'TEST_ACTION', payload: 42 });

      expect(getStateManagerSpy).toHaveBeenCalledWith(zustandStore, undefined);
      expect(stateManager.processAction).toHaveBeenCalledWith({
        type: 'TEST_ACTION',
        payload: 42,
      });
    });

    it('should create a dispatch function for Redux store', () => {
      const dispatch = createDispatch(reduxStore);

      dispatch({ type: 'TEST_ACTION', payload: 42 });

      expect(getStateManagerSpy).toHaveBeenCalledWith(reduxStore, undefined);
      expect(stateManager.processAction).toHaveBeenCalledWith({
        type: 'TEST_ACTION',
        payload: 42,
      });
    });

    it('should pass options to getStateManager', () => {
      const options = { handlers: { CUSTOM: vi.fn() } };
      const dispatch = createDispatch(zustandStore, options);

      dispatch('CUSTOM');

      expect(getStateManagerSpy).toHaveBeenCalledWith(zustandStore, options);
    });
  });
});
