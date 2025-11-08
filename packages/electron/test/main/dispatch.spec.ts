import type { Action, AnyState, DispatchOptions, StateManager, Thunk } from '@zubridge/types';
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import type { StoreApi } from 'zustand/vanilla';
import type { ZustandOptions } from '../../src/adapters/zustand.js';
import { createDispatch } from '../../src/main/dispatch.js';
import { getMainThunkProcessor } from '../../src/main/mainThunkProcessor.js';
import { getStateManager } from '../../src/registry/stateManagerRegistry.js';

// Mock all external dependencies
vi.mock('@zubridge/core', () => ({
  debug: vi.fn(),
}));

vi.mock('node:crypto', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    randomUUID: vi.fn(() => 'mock-uuid'),
  };
});

vi.mock('../../src/registry/stateManagerRegistry.js', () => ({
  getStateManager: vi.fn(),
}));

vi.mock('../../src/main/mainThunkProcessor.js', () => {
  const mockProcessor = {
    initialize: vi.fn(),
    executeThunk: vi.fn(),
    processAction: vi.fn(),
    isFirstActionForThunk: vi.fn(),
  };

  return {
    getMainThunkProcessor: vi.fn(() => mockProcessor),
  };
});

describe('Dispatch', () => {
  let mockStateManager: StateManager<AnyState>;
  let mockStore: StoreApi<AnyState>;
  let mockMainThunkProcessor: ReturnType<typeof getMainThunkProcessor>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockStateManager = {
      processAction: vi.fn(),
      getState: vi.fn(() => ({ counter: 0 })),
      subscribe: vi.fn(),
    };

    mockStore = {
      getState: vi.fn(() => ({ counter: 0 })),
      setState: vi.fn(),
      subscribe: vi.fn(),
      getInitialState: vi.fn(() => ({ counter: 0 })),
    };

    // Get the mocked thunk processor
    mockMainThunkProcessor = vi.mocked(getMainThunkProcessor)();

    // Setup default mocks
    vi.mocked(getStateManager).mockReturnValue(mockStateManager);
    (mockMainThunkProcessor.initialize as Mock).mockClear();
    (mockMainThunkProcessor.executeThunk as Mock).mockResolvedValue('thunk-result');
    (mockMainThunkProcessor.processAction as Mock).mockImplementation(() => {});
    (mockMainThunkProcessor.isFirstActionForThunk as Mock).mockReturnValue(false);
  });

  describe('createDispatch', () => {
    it('should create dispatch function for StoreApi', () => {
      const dispatch = createDispatch(mockStore);

      expect(typeof dispatch).toBe('function');
      expect(getStateManager).toHaveBeenCalledWith(mockStore, undefined);
      expect(mockMainThunkProcessor.initialize).toHaveBeenCalledWith({
        stateManager: mockStateManager,
      });
    });

    it('should create dispatch function for Redux store', () => {
      const reduxStore = {
        ...mockStore,
        replaceReducer: vi.fn(),
      };

      const dispatch = createDispatch(reduxStore);

      expect(typeof dispatch).toBe('function');
      expect(getStateManager).toHaveBeenCalledWith(reduxStore, undefined);
    });

    it('should accept pre-created state manager', () => {
      const dispatch = createDispatch(mockStateManager);

      expect(typeof dispatch).toBe('function');
      expect(getStateManager).not.toHaveBeenCalled();
      expect(mockMainThunkProcessor.initialize).toHaveBeenCalledWith({
        stateManager: mockStateManager,
      });
    });

    it('should pass options to state manager creation', () => {
      const options: ZustandOptions<AnyState> = {
        handlers: { TEST: vi.fn() },
      };

      createDispatch(mockStore, options);

      expect(getStateManager).toHaveBeenCalledWith(mockStore, options);
    });

    it('should distinguish between StateManager and Store using processAction property', () => {
      const storeWithoutProcessAction = { getState: vi.fn(), subscribe: vi.fn() };
      const stateManagerWithProcessAction = { ...mockStateManager, processAction: vi.fn() };

      // Should call getStateManager for store
      createDispatch(storeWithoutProcessAction as unknown as StoreApi<AnyState>);
      expect(getStateManager).toHaveBeenCalledWith(storeWithoutProcessAction, undefined);

      vi.clearAllMocks();

      // Should NOT call getStateManager for state manager
      createDispatch(stateManagerWithProcessAction);
      expect(getStateManager).not.toHaveBeenCalled();
    });
  });

  describe('dispatch function - thunks', () => {
    it('should handle thunk functions', async () => {
      const dispatch = createDispatch(mockStateManager);
      const mockThunk: Thunk<AnyState> = vi.fn();
      (mockMainThunkProcessor.executeThunk as Mock).mockResolvedValue('thunk-result');

      const result = await dispatch(mockThunk);

      expect(mockMainThunkProcessor.executeThunk).toHaveBeenCalledWith(mockThunk, undefined);
      expect(result).toBe('thunk-result');
    });

    it('should pass options to thunk execution', async () => {
      const dispatch = createDispatch(mockStateManager);
      const mockThunk: Thunk<AnyState> = vi.fn();
      const options: DispatchOptions = { bypassThunkLock: true };

      await dispatch(mockThunk, options);

      expect(mockMainThunkProcessor.executeThunk).toHaveBeenCalledWith(mockThunk, options);
    });

    it('should propagate thunk execution errors', async () => {
      const dispatch = createDispatch(mockStateManager);
      const mockThunk: Thunk<AnyState> = vi.fn();
      const error = new Error('Thunk failed');
      (mockMainThunkProcessor.executeThunk as Mock).mockRejectedValue(error);

      await expect(dispatch(mockThunk)).rejects.toThrow('Thunk failed');
    });
  });

  describe('dispatch function - string actions', () => {
    it('should handle string actions', async () => {
      const dispatch = createDispatch(mockStateManager);

      const result = await dispatch('INCREMENT');

      expect(mockMainThunkProcessor.processAction).toHaveBeenCalledWith(
        {
          type: 'INCREMENT',
          payload: undefined,
          __id: 'mock-uuid',
          __isFromMainProcess: true,
        },
        undefined,
      );

      expect(result).toEqual({
        type: 'INCREMENT',
        payload: undefined,
        __id: 'mock-uuid',
        __isFromMainProcess: true,
      });
    });

    it('should handle string actions with payload', async () => {
      const dispatch = createDispatch(mockStateManager);
      const payload = { count: 5 };

      await dispatch('SET_COUNT', payload);

      expect(mockMainThunkProcessor.processAction).toHaveBeenCalledWith(
        {
          type: 'SET_COUNT',
          payload,
          __id: 'mock-uuid',
          __isFromMainProcess: true,
        },
        undefined,
      );
    });

    it('should pass options to processAction for string actions', async () => {
      const dispatch = createDispatch(mockStateManager);
      const options: DispatchOptions = { keys: ['admin'] };

      await dispatch('ADMIN_ACTION', { data: 'test' }, options);

      expect(mockMainThunkProcessor.processAction).toHaveBeenCalledWith(
        {
          type: 'ADMIN_ACTION',
          payload: { data: 'test' },
          __id: 'mock-uuid',
          __isFromMainProcess: true,
        },
        options,
      );
    });
  });

  describe('dispatch function - action objects', () => {
    it('should handle action objects', async () => {
      const dispatch = createDispatch(mockStateManager);
      const action: Action = { type: 'TEST_ACTION', payload: { test: true } };

      const result = await dispatch(action);

      expect(mockMainThunkProcessor.processAction).toHaveBeenCalledWith(
        {
          type: 'TEST_ACTION',
          payload: { test: true },
          __id: 'mock-uuid',
          __isFromMainProcess: true,
        },
        undefined,
      );

      expect(result).toEqual({
        type: 'TEST_ACTION',
        payload: { test: true },
        __id: 'mock-uuid',
        __isFromMainProcess: true,
      });
    });

    it('should preserve existing action ID', async () => {
      const dispatch = createDispatch(mockStateManager);
      const action: Action = {
        type: 'TEST_ACTION',
        __id: 'existing-id',
        payload: { test: true },
      };

      await dispatch(action);

      expect(mockMainThunkProcessor.processAction).toHaveBeenCalledWith(
        {
          type: 'TEST_ACTION',
          payload: { test: true },
          __id: 'existing-id',
          __isFromMainProcess: true,
        },
        undefined,
      );
    });

    it('should generate ID when missing', async () => {
      const dispatch = createDispatch(mockStateManager);
      const action: Action = { type: 'TEST_ACTION' };

      await dispatch(action);

      expect(mockMainThunkProcessor.processAction).toHaveBeenCalledWith(
        {
          type: 'TEST_ACTION',
          __id: 'mock-uuid',
          __isFromMainProcess: true,
        },
        undefined,
      );
    });
  });

  describe('error handling', () => {
    it('should throw error for invalid action type', async () => {
      const dispatch = createDispatch(mockStateManager);

      await expect(dispatch(null as unknown as Thunk<AnyState>)).rejects.toThrow(
        'Invalid action type: object',
      );
      await expect(dispatch(undefined as unknown as Thunk<AnyState>)).rejects.toThrow(
        'Invalid action type: undefined',
      );
      await expect(dispatch(123 as unknown as Thunk<AnyState>)).rejects.toThrow(
        'Invalid action type: number',
      );
    });

    it('should propagate processAction errors', async () => {
      const dispatch = createDispatch(mockStateManager);
      const error = new Error('Process action failed');
      (mockMainThunkProcessor.processAction as Mock).mockImplementation(() => {
        throw error;
      });

      await expect(dispatch('TEST_ACTION')).rejects.toThrow('Process action failed');
    });

    it('should handle errors in internal dispatch', async () => {
      const dispatch = createDispatch(mockStateManager);
      // Mock thunk processor to throw during action processing
      (mockMainThunkProcessor.processAction as Mock).mockImplementation(() => {
        throw new Error('Internal error');
      });

      await expect(dispatch('TEST_ACTION')).rejects.toThrow('Internal error');
    });
  });

  describe('action metadata', () => {
    it('should preserve all action properties', async () => {
      const dispatch = createDispatch(mockStateManager);
      const action: Action = {
        type: 'COMPLEX_ACTION',
        payload: { data: 'test' },
        __custom: 'property',
        __meta: { timestamp: Date.now() },
      } as Action & { __custom: string; __meta: { timestamp: number } };

      await dispatch(action);

      const [processedAction] = (mockMainThunkProcessor.processAction as Mock).mock.calls[0];
      expect(processedAction).toMatchObject({
        type: 'COMPLEX_ACTION',
        payload: { data: 'test' },
        __custom: 'property',
        __meta: { timestamp: expect.any(Number) },
        __isFromMainProcess: true,
        __id: expect.any(String),
      });
    });

    it('should mark action with main process flag', async () => {
      const dispatch = createDispatch(mockStateManager);

      await dispatch('TEST_ACTION');

      const [processedAction] = (mockMainThunkProcessor.processAction as Mock).mock.calls[0];
      expect(processedAction.__isFromMainProcess).toBe(true);
    });
  });

  describe('dispatch with different payloads', () => {
    it('should handle null payload', async () => {
      const dispatch = createDispatch(mockStateManager);

      await dispatch('NULL_ACTION', null);

      const [processedAction] = (mockMainThunkProcessor.processAction as Mock).mock.calls[0];
      expect(processedAction.payload).toBeNull();
    });

    it('should handle undefined payload', async () => {
      const dispatch = createDispatch(mockStateManager);

      await dispatch('UNDEFINED_ACTION', undefined);

      const [processedAction] = (mockMainThunkProcessor.processAction as Mock).mock.calls[0];
      expect(processedAction.payload).toBeUndefined();
    });

    it('should handle complex object payload', async () => {
      const dispatch = createDispatch(mockStateManager);
      const complexPayload = {
        nested: { data: 'test' },
        array: [1, 2, 3],
        nullValue: null,
        undefinedValue: undefined,
      };

      await dispatch('COMPLEX_ACTION', complexPayload);

      const [processedAction] = (mockMainThunkProcessor.processAction as Mock).mock.calls[0];
      expect(processedAction.payload).toEqual(complexPayload);
    });
  });

  describe('state manager integration', () => {
    it('should initialize thunk processor with state manager from store', () => {
      createDispatch(mockStore);

      expect(mockMainThunkProcessor.initialize).toHaveBeenCalledWith({
        stateManager: mockStateManager,
      });
    });

    it('should initialize thunk processor with provided state manager', () => {
      const customStateManager = { ...mockStateManager, processAction: vi.fn() };

      createDispatch(customStateManager);

      expect(mockMainThunkProcessor.initialize).toHaveBeenCalledWith({
        stateManager: customStateManager,
      });
    });
  });

  describe('multiple dispatch calls', () => {
    it('should handle multiple sequential dispatches', async () => {
      const dispatch = createDispatch(mockStateManager);

      await dispatch('ACTION_1');
      await dispatch('ACTION_2');
      await dispatch('ACTION_3');

      expect(mockMainThunkProcessor.processAction).toHaveBeenCalledTimes(3);
      expect(mockMainThunkProcessor.processAction).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ type: 'ACTION_1' }),
        undefined,
      );
      expect(mockMainThunkProcessor.processAction).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ type: 'ACTION_2' }),
        undefined,
      );
      expect(mockMainThunkProcessor.processAction).toHaveBeenNthCalledWith(
        3,
        expect.objectContaining({ type: 'ACTION_3' }),
        undefined,
      );
    });

    it('should handle concurrent dispatches', async () => {
      const dispatch = createDispatch(mockStateManager);

      const promises = [
        dispatch('CONCURRENT_1'),
        dispatch('CONCURRENT_2'),
        dispatch('CONCURRENT_3'),
      ];

      await Promise.all(promises);

      expect(mockMainThunkProcessor.processAction).toHaveBeenCalledTimes(3);
    });
  });

  describe('dispatch options handling', () => {
    it('should pass dispatch options to thunk execution', async () => {
      const dispatch = createDispatch(mockStateManager);
      const thunkFn: Thunk<AnyState> = vi.fn();
      const options: DispatchOptions = {
        bypassThunkLock: true,
        bypassAccessControl: true,
        keys: ['admin'],
      };

      await dispatch(thunkFn, options);

      expect(mockMainThunkProcessor.executeThunk).toHaveBeenCalledWith(thunkFn, options);
    });

    it('should pass dispatch options to action processing', async () => {
      const dispatch = createDispatch(mockStateManager);
      const options: DispatchOptions = {
        bypassThunkLock: true,
        keys: ['user'],
      };

      await dispatch('TEST_ACTION', { data: 'test' }, options);

      expect(mockMainThunkProcessor.processAction).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'TEST_ACTION' }),
        options,
      );
    });
  });

  describe('edge cases', () => {
    it('should handle empty string action type', async () => {
      const dispatch = createDispatch(mockStateManager);

      await dispatch('');

      const [processedAction] = (mockMainThunkProcessor.processAction as Mock).mock.calls[0];
      expect(processedAction.type).toBe('');
    });

    it('should handle action with no type property', async () => {
      const dispatch = createDispatch(mockStateManager);
      const actionWithoutType = { payload: 'test' } as unknown as Action;

      await dispatch(actionWithoutType);

      const [processedAction] = (mockMainThunkProcessor.processAction as Mock).mock.calls[0];
      expect(processedAction.type).toBeUndefined();
    });

    it('should handle very large payloads', async () => {
      const dispatch = createDispatch(mockStateManager);
      const largePayload = {
        data: new Array(1000).fill('test'),
        nested: {
          deep: {
            values: new Array(100).fill({ id: 1, name: 'test' }),
          },
        },
      };

      await dispatch('LARGE_PAYLOAD', largePayload);

      const [processedAction] = (mockMainThunkProcessor.processAction as Mock).mock.calls[0];
      expect(processedAction.payload).toEqual(largePayload);
    });
  });

  describe('type checking and validation', () => {
    it('should handle actions with symbol types', async () => {
      const dispatch = createDispatch(mockStateManager);
      const testSymbol = Symbol('TEST');
      const symbolAction = { type: testSymbol as unknown as string };

      // Symbol types cause an error in debug message formatting
      await expect(dispatch(symbolAction)).rejects.toThrow(
        'Cannot convert a Symbol value to a string',
      );
    });

    it('should reject non-function, non-string, non-object actions', async () => {
      const dispatch = createDispatch(mockStateManager);

      await expect(dispatch(true as unknown as Thunk<AnyState>)).rejects.toThrow(
        'Invalid action type: boolean',
      );
      await expect(dispatch(123 as unknown as Thunk<AnyState>)).rejects.toThrow(
        'Invalid action type: number',
      );
      // Note: Arrays are objects in JS, so they get processed as action objects
      // This is expected behavior, so we test that arrays are handled
      const result = await dispatch([] as unknown as Action);
      expect(result).toHaveProperty('__id');
      expect(result).toHaveProperty('__isFromMainProcess', true);
    });
  });
});
