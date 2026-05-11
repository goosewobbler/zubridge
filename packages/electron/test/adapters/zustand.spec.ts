import type { Action, AnyState } from '@zubridge/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StoreApi } from 'zustand/vanilla';
import { createZustandAdapter } from '../../src/adapters/zustand.js';

// Mock the debug utility
vi.mock('@zubridge/utils', () => ({
  debug: vi.fn(), // Simplified mock
}));

// Mock a Zustand store
const createMockStore = (): StoreApi<AnyState> => {
  return {
    getState: vi.fn(() => ({
      count: 0,
      setCount: vi.fn(),
    })),
    setState: vi.fn(),
    subscribe: vi.fn(() => () => {}),
  } as unknown as StoreApi<AnyState>;
};

describe('Zustand Adapter', () => {
  let store: StoreApi<AnyState>;

  beforeEach(() => {
    store = createMockStore();
  });

  describe('general behavior', () => {
    it('should expose getState from the store', () => {
      const adapter = createZustandAdapter(store);
      adapter.getState();
      expect(store.getState).toHaveBeenCalled();
    });

    it('should pass the subscription callback to the store', () => {
      const adapter = createZustandAdapter(store);
      const listener = vi.fn();
      adapter.subscribe(listener);
      expect(store.subscribe).toHaveBeenCalledWith(listener);
    });
  });

  describe('processAction', () => {
    it('should handle built-in setState action', () => {
      const adapter = createZustandAdapter(store);
      const newState = { count: 5 };
      const result = adapter.processAction({ type: 'setState', payload: newState });
      expect(store.setState).toHaveBeenCalledWith(newState);
      expect(result).toEqual({ isSync: true });
    });

    it('should use reducer when provided', () => {
      const mockReducer = vi.fn().mockReturnValue({ count: 10 });

      // Create a store without extra functions in state
      const cleanStore = {
        getState: vi.fn(() => ({ count: 0 })),
        setState: vi.fn(),
        subscribe: vi.fn(() => () => {}),
      } as unknown as StoreApi<AnyState>;

      const adapter = createZustandAdapter(cleanStore, {
        reducer: mockReducer,
      });

      const action: Action = { type: 'REDUCER_ACTION', payload: 'test' };
      const result = adapter.processAction(action);

      expect(mockReducer).toHaveBeenCalledWith({ count: 0 }, action);
      expect(cleanStore.setState).toHaveBeenCalledWith({ count: 10 });
      expect(result).toEqual({ isSync: true });
    });

    it('should handle async custom handlers', async () => {
      const asyncHandler = vi.fn().mockResolvedValue('async-result');

      const adapter = createZustandAdapter(store, {
        handlers: {
          ASYNC_HANDLER_ACTION: asyncHandler,
        },
      });

      const action: Action = { type: 'ASYNC_HANDLER_ACTION', payload: 'test-data' };
      const result = adapter.processAction(action);

      expect(asyncHandler).toHaveBeenCalledWith('test-data');
      expect(result).toEqual({
        isSync: false,
        completion: expect.any(Promise),
      });

      // Wait for completion
      await result.completion;
      expect(asyncHandler).toHaveBeenCalledTimes(1);
    });

    it('should handle async custom handler errors', async () => {
      const asyncHandler = vi.fn().mockRejectedValue(new Error('Async failed'));

      const adapter = createZustandAdapter(store, {
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

      const completionResult = await result.completion;
      expect(completionResult).toEqual({
        error: expect.stringContaining('Async handler execution failed'),
      });
    });

    it('should handle sync custom handlers', () => {
      const syncHandler = vi.fn().mockReturnValue('sync-result');

      const adapter = createZustandAdapter(store, {
        handlers: {
          SYNC_HANDLER_ACTION: syncHandler,
        },
      });

      const action: Action = { type: 'SYNC_HANDLER_ACTION', payload: 'test-data' };
      const result = adapter.processAction(action);

      expect(syncHandler).toHaveBeenCalledWith('test-data');
      expect(result).toEqual({ isSync: true });
      expect(store.setState).not.toHaveBeenCalled();
    });

    it('should handle method calls on store state', () => {
      const adapter = createZustandAdapter(store);
      const action: Action = { type: 'setCount', payload: 42 };
      const result = adapter.processAction(action);

      expect(result).toEqual({ isSync: true });
    });

    it('should handle async method calls on store state', async () => {
      // Mock a store with an async method
      const asyncStore = {
        getState: vi.fn(() => ({
          count: 0,
          asyncIncrement: vi.fn().mockResolvedValue(5),
        })),
        setState: vi.fn(),
        subscribe: vi.fn(() => () => {}),
      } as unknown as StoreApi<AnyState>;

      const adapter = createZustandAdapter(asyncStore);
      const action: Action = { type: 'asyncIncrement', payload: 10 };
      const result = adapter.processAction(action);

      expect(result).toEqual({
        isSync: false,
        completion: expect.any(Promise),
      });

      await result.completion;
    });

    it('should handle nested handlers in store state', () => {
      const nestedStore = {
        getState: vi.fn(() => ({
          count: 0,
          ui: {
            settings: {
              toggle: vi.fn().mockReturnValue('toggled'),
            },
          },
        })),
        setState: vi.fn(),
        subscribe: vi.fn(() => () => {}),
      } as unknown as StoreApi<AnyState>;

      const adapter = createZustandAdapter(nestedStore);
      const action: Action = { type: 'ui.settings.toggle', payload: true };
      const result = adapter.processAction(action);

      expect(result).toEqual({ isSync: true });
    });

    it('should handle async nested handlers in store state', async () => {
      const nestedAsyncStore = {
        getState: vi.fn(() => ({
          count: 0,
          ui: {
            settings: {
              asyncToggle: vi.fn().mockResolvedValue('async-toggled'),
            },
          },
        })),
        setState: vi.fn(),
        subscribe: vi.fn(() => () => {}),
      } as unknown as StoreApi<AnyState>;

      const adapter = createZustandAdapter(nestedAsyncStore);
      const action: Action = { type: 'ui.settings.asyncToggle', payload: true };
      const result = adapter.processAction(action);

      expect(result).toEqual({
        isSync: false,
        completion: expect.any(Promise),
      });

      await result.completion;
    });

    it('should handle middleware option', () => {
      const mockMiddleware = vi.fn();

      const adapter = createZustandAdapter(store, {
        middleware: mockMiddleware,
      });

      expect(adapter).toBeDefined();
    });

    it('should handle actions with no handlers by returning sync result', () => {
      const adapter = createZustandAdapter(store);
      const action: Action = { type: 'UNKNOWN_ACTION', payload: 'test' };
      const result = adapter.processAction(action);

      expect(result).toEqual({ isSync: true });
      expect(store.setState).not.toHaveBeenCalled();
    });

    it('should handle undefined options gracefully', () => {
      const adapter = createZustandAdapter(store, undefined);
      const action: Action = { type: 'UNDEFINED_OPTIONS_ACTION', payload: 'test' };
      const result = adapter.processAction(action);

      expect(result).toEqual({ isSync: true });
    });

    it('should handle empty handlers object', () => {
      const adapter = createZustandAdapter(store, { handlers: {} });
      const action: Action = { type: 'EMPTY_HANDLERS_ACTION', payload: 'test' };
      const result = adapter.processAction(action);

      expect(result).toEqual({ isSync: true });
    });

    it('should handle sync errors in processAction', () => {
      const errorStore = {
        getState: vi.fn(() => {
          throw new Error('State access failed');
        }),
        setState: vi.fn(),
        subscribe: vi.fn(() => () => {}),
      } as unknown as StoreApi<AnyState>;

      const adapter = createZustandAdapter(errorStore);
      const action: Action = { type: 'ERROR_ACTION', payload: 'test' };

      expect(() => adapter.processAction(action)).not.toThrow();
    });
  });

  describe('error handling', () => {
    it('should handle errors in reducer', () => {
      const errorReducer = vi.fn().mockImplementation(() => {
        throw new Error('Reducer error');
      });

      const adapterWithReducer = createZustandAdapter(store, { reducer: errorReducer });

      const action: Action = { type: 'ERROR_ACTION' };
      // Expect this path to be taken, error to be handled internally by debug log
      expect(() => adapterWithReducer.processAction(action)).not.toThrow();
    });
  });
});
