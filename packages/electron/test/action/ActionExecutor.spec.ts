import type { Action, AnyState, StateManager } from '@zubridge/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ActionExecutor } from '../../src/action/ActionExecutor.js';

// Mock dependencies
vi.mock('@zubridge/core', () => ({
  debug: vi.fn(),
}));

vi.mock('../../src/thunk/init.js', () => ({
  thunkManager: {
    setCurrentThunkAction: vi.fn(),
  },
}));

import { thunkManager } from '../../src/thunk/init.js';

// Helper to create a mock StateManager
function createMockStateManager(): StateManager<AnyState> {
  return {
    getState: vi.fn().mockReturnValue({ count: 0 }),
    processAction: vi.fn(),
    subscribe: vi.fn(),
  } as unknown as StateManager<AnyState>;
}

describe('ActionExecutor', () => {
  let stateManager: StateManager<AnyState>;
  let executor: ActionExecutor<AnyState>;

  beforeEach(() => {
    vi.clearAllMocks();
    stateManager = createMockStateManager();
    executor = new ActionExecutor(stateManager);
  });

  describe('constructor', () => {
    it('should initialize with a state manager', () => {
      expect(executor).toBeInstanceOf(ActionExecutor);
    });
  });

  describe('executeAction', () => {
    it('should execute regular actions without thunk context', async () => {
      const action: Action = { type: 'INCREMENT', __id: 'test-id' };
      const expectedResult = { count: 1 };

      vi.mocked(stateManager.processAction).mockReturnValue(expectedResult);

      const result = await executor.executeAction(action);

      expect(stateManager.processAction).toHaveBeenCalledWith(action);
      expect(thunkManager.setCurrentThunkAction).not.toHaveBeenCalled();
      expect(result).toBe(expectedResult);
    });

    it('should set thunk context for thunk actions', async () => {
      const action: Action = {
        type: 'THUNK_INCREMENT',
        __id: 'test-id',
        __thunkParentId: 'thunk-123',
      };
      const expectedResult = { count: 1 };

      vi.mocked(stateManager.processAction).mockReturnValue(expectedResult);

      const result = await executor.executeAction(action);

      expect(thunkManager.setCurrentThunkAction).toHaveBeenCalledWith('thunk-123');
      expect(stateManager.processAction).toHaveBeenCalledWith(action);
      expect(thunkManager.setCurrentThunkAction).toHaveBeenCalledWith(undefined);
      expect(result).toBe(expectedResult);
    });

    it('should handle actions with error results', async () => {
      const action: Action = { type: 'ERROR_ACTION', __id: 'test-id' };
      const errorResult = { error: new Error('Test error') };

      vi.mocked(stateManager.processAction).mockReturnValue(errorResult);

      await expect(executor.executeAction(action)).rejects.toThrow('Test error');
    });

    it('should handle async actions with completion property', async () => {
      const action: Action = { type: 'ASYNC_ACTION', __id: 'test-id' };
      const completionResult = { count: 5 };
      const asyncResult = {
        completion: Promise.resolve(completionResult),
      };

      vi.mocked(stateManager.processAction).mockReturnValue(asyncResult);

      const result = await executor.executeAction(action);

      expect(result).toBe(completionResult);
    });

    it('should handle async action errors', async () => {
      const action: Action = { type: 'ASYNC_ERROR_ACTION', __id: 'test-id' };
      const asyncResult = {
        completion: Promise.reject(new Error('Async error')),
      };

      vi.mocked(stateManager.processAction).mockReturnValue(asyncResult);

      await expect(executor.executeAction(action)).rejects.toThrow('Async error');
    });

    it('should clear thunk context even if action processing fails', async () => {
      const action: Action = {
        type: 'THUNK_ERROR_ACTION',
        __id: 'test-id',
        __thunkParentId: 'thunk-123',
      };

      vi.mocked(stateManager.processAction).mockImplementation(() => {
        throw new Error('Processing error');
      });

      await expect(executor.executeAction(action)).rejects.toThrow('Processing error');

      // Should have cleared thunk context
      expect(thunkManager.setCurrentThunkAction).toHaveBeenCalledWith('thunk-123');
      expect(thunkManager.setCurrentThunkAction).toHaveBeenCalledWith(undefined);
    });

    it('should handle non-object results from state manager', async () => {
      const action: Action = { type: 'PRIMITIVE_ACTION', __id: 'test-id' };

      vi.mocked(stateManager.processAction).mockReturnValue(42);

      const result = await executor.executeAction(action);

      expect(result).toBe(42);
    });

    it('should handle null results from state manager', async () => {
      const action: Action = { type: 'NULL_ACTION', __id: 'test-id' };

      vi.mocked(stateManager.processAction).mockReturnValue(null);

      const result = await executor.executeAction(action);

      expect(result).toBe(null);
    });

    it('should handle undefined results from state manager', async () => {
      const action: Action = { type: 'UNDEFINED_ACTION', __id: 'test-id' };

      vi.mocked(stateManager.processAction).mockReturnValue(undefined);

      const result = await executor.executeAction(action);

      expect(result).toBe(undefined);
    });

    it('should handle actions without IDs', async () => {
      const action: Action = { type: 'NO_ID_ACTION' };
      const expectedResult = { success: true };

      vi.mocked(stateManager.processAction).mockReturnValue(expectedResult);

      const result = await executor.executeAction(action);

      expect(result).toBe(expectedResult);
    });

    it('should handle complex nested thunk contexts', async () => {
      const action1: Action = {
        type: 'NESTED_THUNK_1',
        __id: 'test-id-1',
        __thunkParentId: 'parent-thunk',
      };
      const action2: Action = {
        type: 'NESTED_THUNK_2',
        __id: 'test-id-2',
        __thunkParentId: 'child-thunk',
      };

      vi.mocked(stateManager.processAction).mockReturnValue({ success: true });

      // Execute first action
      await executor.executeAction(action1);

      // Execute second action
      await executor.executeAction(action2);

      // Should have set and cleared thunk contexts for both actions
      expect(thunkManager.setCurrentThunkAction).toHaveBeenCalledWith('parent-thunk');
      expect(thunkManager.setCurrentThunkAction).toHaveBeenCalledWith('child-thunk');
      expect(thunkManager.setCurrentThunkAction).toHaveBeenCalledWith(undefined);
    });
  });
});
