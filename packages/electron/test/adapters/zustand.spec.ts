import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StoreApi } from 'zustand/vanilla';
import type { AnyState, RootReducer, Action } from '@zubridge/types';
import { createZustandAdapter, ZustandOptions } from '../../src/adapters/zustand.js';

// Mock the debug utility
vi.mock('@zubridge/core', () => ({
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

  describe('processAction with standard call', () => {
    it('should handle built-in setState action', () => {
      const adapter = createZustandAdapter(store);
      const newState = { count: 5 };
      adapter.processAction({ type: 'setState', payload: newState });
      expect(store.setState).toHaveBeenCalledWith(newState);
    });

    it('should call methods in the state object', () => {
      const setCountMock = vi.fn();
      vi.mocked(store.getState).mockReturnValue({
        count: 0,
        setCount: setCountMock,
      });

      const adapter = createZustandAdapter(store);
      adapter.processAction({ type: 'setCount', payload: 10 });

      expect(setCountMock).toHaveBeenCalledWith(10);
    });
  });

  describe('processAction with custom handlers', () => {
    it('should call custom handlers when provided', () => {
      const customHandler = vi.fn();
      const adapterWithHandlers = createZustandAdapter(store, {
        handlers: {
          CUSTOM_ACTION: customHandler,
        },
      });

      const action: Action = { type: 'CUSTOM_ACTION', payload: 'test-data' };
      adapterWithHandlers.processAction(action);

      expect(customHandler).toHaveBeenCalledWith('test-data');
      expect(store.setState).not.toHaveBeenCalled();
    });

    it('should call custom handlers with case-insensitive matching', () => {
      const incrementHandler = vi.fn();
      const decrementHandler = vi.fn();
      const adapterWithHandlers = createZustandAdapter(store, {
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
    });
  });

  describe('processAction with nested path resolution', () => {
    it('should handle nested paths in handlers', () => {
      const incrementHandler = vi.fn();
      const decrementHandler = vi.fn();
      const resetHandler = vi.fn();

      const adapterWithNestedHandlers = createZustandAdapter(store, {
        handlers: {
          counter: {
            increment: incrementHandler,
            decrement: decrementHandler,
            reset: resetHandler,
          } as any,
        },
      });

      // Test nested path resolution
      adapterWithNestedHandlers.processAction({ type: 'counter.increment', payload: 1 });
      expect(incrementHandler).toHaveBeenCalledWith(1);

      adapterWithNestedHandlers.processAction({ type: 'counter.decrement', payload: 1 });
      expect(decrementHandler).toHaveBeenCalledWith(1);

      adapterWithNestedHandlers.processAction({ type: 'counter.reset' });
      expect(resetHandler).toHaveBeenCalled();
    });

    it('should handle case-insensitive nested paths', () => {
      const setThemeHandler = vi.fn();

      const adapterWithNestedHandlers = createZustandAdapter(store, {
        handlers: {
          Theme: {
            setTheme: setThemeHandler,
          } as any,
        },
      });

      // Test case-insensitive nested path resolution
      adapterWithNestedHandlers.processAction({ type: 'theme.settheme', payload: 'dark' });
      expect(setThemeHandler).toHaveBeenCalledWith('dark');
    });

    it('should handle deeply nested paths', () => {
      const updateHandler = vi.fn();

      const adapterWithDeepHandlers = createZustandAdapter(store, {
        handlers: {
          ui: {
            settings: {
              theme: {
                update: updateHandler,
              },
            },
          } as any,
        },
      });

      // Test deeply nested path resolution
      adapterWithDeepHandlers.processAction({ type: 'ui.settings.theme.update', payload: 'light' });
      expect(updateHandler).toHaveBeenCalledWith('light');
    });

    it('should handle nested paths in state object', () => {
      const counterIncrementMock = vi.fn();
      const counterDecrementMock = vi.fn();

      vi.mocked(store.getState).mockReturnValue({
        counter: {
          increment: counterIncrementMock,
          decrement: counterDecrementMock,
        },
      });

      const adapter = createZustandAdapter(store);

      // Test state object nested path resolution
      adapter.processAction({ type: 'counter.increment', payload: 5 });
      expect(counterIncrementMock).toHaveBeenCalledWith(5);

      adapter.processAction({ type: 'counter.decrement', payload: 2 });
      expect(counterDecrementMock).toHaveBeenCalledWith(2);
    });

    it('should fall back to exact paths when nested path not found', () => {
      const exactPathHandler = vi.fn();

      const adapter = createZustandAdapter(store, {
        handlers: {
          'counter.increment': exactPathHandler,
        },
      });

      // This should match the exact path 'counter.increment'
      adapter.processAction({ type: 'counter.increment', payload: 1 });
      expect(exactPathHandler).toHaveBeenCalledWith(1);
    });
  });

  describe('processAction with reducer', () => {
    it('should use the reducer when provided', () => {
      const reducer: RootReducer<AnyState> = vi.fn((state, action) => {
        if (action.type === 'INCREMENT') {
          return { ...state, count: state.count + 1 };
        }
        return state;
      });

      const adapterWithReducer = createZustandAdapter(store, { reducer });
      const action: Action = { type: 'INCREMENT' };
      adapterWithReducer.processAction(action);

      expect(reducer).toHaveBeenCalledWith({ count: 0, setCount: expect.any(Function) }, action);
      expect(store.setState).toHaveBeenCalled();
    });

    it('should catch and log errors during action processing', async () => {
      const errorReducer: RootReducer<AnyState> = vi.fn(() => {
        throw new Error('Test reducer error');
      });

      const adapterWithReducer = createZustandAdapter(store, { reducer: errorReducer });

      const action: Action = { type: 'ERROR_ACTION' };
      // Expect this path to be taken, error to be handled internally by debug log
      expect(() => adapterWithReducer.processAction(action)).not.toThrow();
    });
  });
});
