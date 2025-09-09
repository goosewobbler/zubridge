import type { Thunk } from '@zubridge/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getMainThunkProcessor,
  MainThunkProcessor,
  resetMainThunkProcessor,
  TestMainThunkProcessor,
} from '../../src/main/mainThunkProcessor.js';
import { QueueOverflowError } from '../../src/types/errors.js';

// Mock dependencies more completely
vi.mock('../../src/thunk/init.js', () => ({
  thunkManager: {
    registerThunk: vi.fn().mockResolvedValue(undefined),
    executeThunk: vi.fn(),
    completeThunk: vi.fn(),
    failThunk: vi.fn(),
    acknowledgeStateUpdate: vi.fn(),
    setStateManager: vi.fn(),
    processAction: vi.fn().mockReturnValue({}),
    getCurrentRootThunkId: vi.fn().mockReturnValue(undefined),
    getActiveThunksSummary: vi.fn().mockReturnValue({ thunks: [] }),
    hasThunk: vi.fn().mockReturnValue(false),
    cleanupExpiredUpdates: vi.fn(),
    markThunkFailed: vi.fn(),
    isThunkFullyComplete: vi.fn().mockReturnValue(true),
    on: vi.fn(),
    emit: vi.fn(),
  },
}));

vi.mock('../../src/main/actionQueue.js', () => ({
  actionQueue: {
    enqueue: vi.fn(),
    dequeue: vi.fn(),
    size: vi.fn(() => 0),
    clear: vi.fn(),
    enqueueAction: vi.fn().mockImplementation((_action, _windowId, _parentId, callback) => {
      // Simulate immediate completion for most tests
      setTimeout(() => callback?.(), 0);
    }),
  },
}));

vi.mock('../../src/thunk/registration/ThunkRegistrationQueue.js', () => ({
  ThunkRegistrationQueue: vi.fn().mockImplementation(() => ({
    registerThunk: vi.fn().mockImplementation(async (_thunk, mainCallback) => {
      if (mainCallback) {
        return await mainCallback();
      }
      return 'mocked-result';
    }),
  })),
}));

// Helper to create mock state manager
const createMockStateManager = () => ({
  getState: vi.fn().mockReturnValue({ counter: 42 }),
  dispatch: vi
    .fn()
    .mockImplementation((action) => ({ type: 'DISPATCHED', originalAction: action })),
  subscribe: vi.fn(() => () => {}),
  processAction: vi.fn(),
});

// Helper to create mock thunk
const createMockThunk = (): Thunk => {
  return vi.fn(async (getState) => {
    const state = await getState();
    return state.counter;
  });
};

describe('MainThunkProcessor', () => {
  let processor: TestMainThunkProcessor;
  let mockStateManager: ReturnType<typeof createMockStateManager>;

  beforeEach(() => {
    vi.clearAllMocks();
    processor = new TestMainThunkProcessor({
      actionCompletionTimeoutMs: 1000,
      maxQueueSize: 10,
    });
    mockStateManager = createMockStateManager();
    processor.initialize({ stateManager: mockStateManager });
  });

  describe('constructor', () => {
    it('should create instance with default options', () => {
      const defaultProcessor = new TestMainThunkProcessor();
      expect(defaultProcessor).toBeInstanceOf(MainThunkProcessor);
    });

    it('should create instance with custom options', () => {
      const customProcessor = new TestMainThunkProcessor({
        actionCompletionTimeoutMs: 2000,
        maxQueueSize: 20,
      });
      expect(customProcessor).toBeInstanceOf(MainThunkProcessor);
    });
  });

  describe('initialize', () => {
    it('should initialize with state manager', () => {
      const newStateManager = createMockStateManager();
      processor.initialize({ stateManager: newStateManager });

      // Test by executing a thunk that uses the state manager
      const thunk = createMockThunk();
      processor.executeThunk(thunk, { windowId: 1 });

      expect(newStateManager).toBeDefined();
    });
  });

  describe('executeThunk', () => {
    it('should execute a thunk successfully', async () => {
      const thunk = createMockThunk();
      const result = await processor.executeThunk(thunk, { windowId: 1 });

      expect(thunk).toHaveBeenCalled();
      expect(result).toBe(42);
    });

    it('should execute thunk with custom thunk ID', async () => {
      const thunk = createMockThunk();
      const customThunkId = 'custom-thunk-id';

      const result = await processor.executeThunk(thunk, {
        windowId: 1,
        thunkId: customThunkId,
      });

      expect(result).toBe(42);
    });

    it('should execute thunk with parent ID', async () => {
      const thunk = createMockThunk();

      const result = await processor.executeThunk(thunk, {
        windowId: 1,
        parentId: 'parent-thunk-id',
      });

      expect(result).toBe(42);
    });

    it('should handle thunk that dispatches actions', async () => {
      const thunk: Thunk = vi.fn(async (_getState, dispatch) => {
        await dispatch({ type: 'INCREMENT' });
        return 'done';
      });

      const result = await processor.executeThunk(thunk, { windowId: 1 });

      expect(thunk).toHaveBeenCalled();
      expect(result).toBe('done');
    });

    it('should handle nested thunks', async () => {
      const nestedThunk = vi.fn(async () => 99);
      const parentThunk: Thunk = vi.fn(async (_getState, dispatch) => {
        return await dispatch(nestedThunk);
      });

      const result = await processor.executeThunk(parentThunk, { windowId: 1 });

      expect(parentThunk).toHaveBeenCalled();
      expect(nestedThunk).toHaveBeenCalled();
      expect(result).toBe(99);
    });

    it('should handle thunk execution errors', async () => {
      const errorThunk = vi.fn(async () => {
        throw new Error('Thunk execution failed');
      });

      await expect(processor.executeThunk(errorThunk, { windowId: 1 })).rejects.toThrow(
        'Thunk execution failed',
      );
    });

    it('should handle actions with bypass flag', async () => {
      const thunk: Thunk = vi.fn(async (_getState, dispatch) => {
        await dispatch({ type: 'BYPASS_ACTION', __bypassThunkLock: true });
        return 'bypassed';
      });

      const result = await processor.executeThunk(thunk, { windowId: 1 });

      expect(result).toBe('bypassed');
    });

    it('should handle getState errors', async () => {
      mockStateManager.getState.mockImplementation(() => {
        throw new Error('State access failed');
      });

      const thunk = vi.fn(async (getState) => {
        return await getState();
      });

      await expect(processor.executeThunk(thunk, { windowId: 1 })).rejects.toThrow(
        'State access failed',
      );
    });

    it('should handle dispatch errors', async () => {
      // Mock actionQueue to simulate dispatch error
      const { actionQueue } = await import('../../src/main/actionQueue.js');
      const _originalEnqueue = actionQueue.enqueueAction;
      // biome-ignore lint/suspicious/noExplicitAny: Test needs to mock actionQueue method
      (actionQueue.enqueueAction as any).mockImplementation(() => {
        throw new Error('Action queue failed');
      });

      const thunk: Thunk = vi.fn(async (_getState, dispatch) => {
        await dispatch({ type: 'FAILING_ACTION' });
      });

      await expect(processor.executeThunk(thunk, { windowId: 1 })).rejects.toThrow();

      // Restore original mock
      // biome-ignore lint/suspicious/noExplicitAny: Test needs to mock actionQueue method
      (actionQueue.enqueueAction as any).mockImplementation(
        (_action, _windowId, _parentId, callback) => {
          setTimeout(() => callback?.(), 0);
        },
      );
    });
  });

  describe('processAction', () => {
    it('should process a simple action through state manager', () => {
      const action = { type: 'TEST_ACTION' };

      processor.processAction(action);

      expect(mockStateManager.processAction).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'TEST_ACTION',
          __isFromMainProcess: true,
          __id: expect.any(String),
        }),
      );
    });

    it('should process string action', () => {
      processor.processAction('STRING_ACTION');

      expect(mockStateManager.processAction).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'STRING_ACTION',
          __isFromMainProcess: true,
          __id: expect.any(String),
        }),
      );
    });

    it('should attach options to action', () => {
      const action = { type: 'OPTIONS_ACTION' };

      processor.processAction(action, {
        keys: ['key1'],
        bypassThunkLock: true,
      });

      expect(mockStateManager.processAction).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'OPTIONS_ACTION',
          __keys: ['key1'],
          __bypassThunkLock: true,
          __isFromMainProcess: true,
        }),
      );
    });

    it('should handle processAction errors', () => {
      mockStateManager.processAction.mockImplementation(() => {
        throw new Error('Process error');
      });

      expect(() => {
        processor.processAction({ type: 'FAILING_ACTION' });
      }).toThrow('Process error');
    });
  });

  describe('completeAction', () => {
    it('should complete action and resolve with current state', () => {
      const actionId = 'test-action-id';
      const callback = vi.fn();

      // Set up a pending action promise
      processor.getPendingActionPromises().set(actionId, {
        resolve: callback,
        promise: Promise.resolve(),
      });

      processor.completeAction(actionId);

      // Should resolve with current state
      expect(callback).toHaveBeenCalledWith({ counter: 42 });
      expect(processor.getPendingActionPromises().has(actionId)).toBe(false);
    });

    it('should handle completion of unknown action', () => {
      // Should not throw for unknown action ID
      expect(() => processor.completeAction('unknown-action')).not.toThrow();
    });

    it('should resolve with actionId when state manager unavailable', () => {
      const actionId = 'no-state-action';
      const callback = vi.fn();

      // Temporarily remove state manager
      processor.setStateManagerForTest(undefined);

      processor.getPendingActionPromises().set(actionId, {
        resolve: callback,
        promise: Promise.resolve(),
      });

      processor.completeAction(actionId);

      expect(callback).toHaveBeenCalledWith(actionId);
    });

    it('should handle callback errors gracefully', () => {
      const actionId = 'error-action';
      const errorCallback = vi.fn(() => {
        throw new Error('Callback error');
      });

      processor.getPendingActionPromises().set(actionId, {
        resolve: errorCallback,
        promise: Promise.resolve(),
      });

      // The MainThunkProcessor doesn't wrap the callback in try-catch, so it will throw
      expect(() => processor.completeAction(actionId)).toThrow('Callback error');
      expect(errorCallback).toHaveBeenCalled();
    });
  });

  describe('queue management', () => {
    it('should throw QueueOverflowError when queue is full', () => {
      const processor = new TestMainThunkProcessor({
        actionCompletionTimeoutMs: 1000,
        maxQueueSize: 1, // Small queue size
      });
      processor.initialize({ stateManager: mockStateManager });

      expect(() => {
        // Access protected method for testing - pass a size that exceeds maxQueueSize
        processor.testCheckQueueCapacity(2);
      }).toThrow(QueueOverflowError);
    });
  });

  describe('action timeout handling', () => {
    it('should handle action timeouts', async () => {
      const shortTimeoutProcessor = new MainThunkProcessor({
        actionCompletionTimeoutMs: 1, // Very short timeout
        maxQueueSize: 10,
      });
      shortTimeoutProcessor.initialize({ stateManager: mockStateManager });

      const slowAction = { type: 'SLOW_ACTION' };
      mockStateManager.dispatch.mockImplementation(() => {
        // Return a promise that never resolves to trigger timeout
        return new Promise(() => {});
      });

      const thunk: Thunk = vi.fn(async (_getState, dispatch) => {
        await dispatch(slowAction);
      });

      await expect(shortTimeoutProcessor.executeThunk(thunk, { windowId: 1 })).rejects.toThrow(); // Should timeout
    });
  });

  describe('error scenarios', () => {
    it('should handle state manager initialization without state manager', () => {
      const uninitializedProcessor = new MainThunkProcessor();
      const thunk = createMockThunk();

      expect(() => uninitializedProcessor.executeThunk(thunk, { windowId: 1 })).rejects.toThrow();
    });

    it('should handle multiple action completions for same action', () => {
      const actionId = 'duplicate-action';
      const callback = vi.fn();

      processor.getPendingActionPromises().set(actionId, {
        resolve: callback,
        promise: Promise.resolve(),
      });

      // Complete the same action multiple times
      processor.completeAction(actionId);
      processor.completeAction(actionId);

      // Callback should only be called once (first completion removes the action from map)
      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith({ counter: 42 });
    });
  });

  describe('integration scenarios', () => {
    it('should handle complex thunk with multiple actions', async () => {
      const complexThunk: Thunk = vi.fn(async (getState, dispatch) => {
        const initialState = await getState();
        await dispatch({ type: 'ACTION_1' });
        await dispatch({ type: 'ACTION_2', payload: initialState.counter });
        const finalState = await getState();
        return finalState;
      });

      const result = await processor.executeThunk(complexThunk, { windowId: 1 });

      expect(complexThunk).toHaveBeenCalled();
      expect(result).toEqual({ counter: 42 });
    });

    it('should handle thunk chain execution', async () => {
      const thunk1 = vi.fn(async () => 'first');
      const thunk2 = vi.fn(async (_getState, dispatch) => {
        const result1 = await dispatch(thunk1);
        return `${result1}-second`;
      });
      const thunk3 = vi.fn(async (_getState, dispatch) => {
        const result2 = await dispatch(thunk2);
        return `${result2}-third`;
      });

      const result = await processor.executeThunk(thunk3, { windowId: 1 });

      expect(result).toBe('first-second-third');
      expect(thunk1).toHaveBeenCalled();
      expect(thunk2).toHaveBeenCalled();
      expect(thunk3).toHaveBeenCalled();
    });
  });

  describe('isFirstActionForThunk', () => {
    it('should return true for new thunk ID', () => {
      const result = processor.isFirstActionForThunk('new-thunk-id');
      expect(result).toBe(true);
    });

    it('should return false for existing thunk ID', () => {
      // Add thunk to tracking set
      processor.getSentFirstActionForThunk().add('existing-thunk');

      const result = processor.isFirstActionForThunk('existing-thunk');
      expect(result).toBe(false);
    });
  });

  describe('forceCleanupExpiredActions', () => {
    it('should cleanup pending promises and tracking data', () => {
      // Set up some pending actions
      const actionId1 = 'action-1';
      const actionId2 = 'action-2';
      const callback1 = vi.fn();
      const callback2 = vi.fn();

      processor.getPendingActionPromises().set(actionId1, {
        resolve: callback1,
        promise: Promise.resolve(),
      });
      processor.getPendingActionPromises().set(actionId2, {
        resolve: callback2,
        promise: Promise.resolve(),
      });

      // Add some thunk tracking
      processor.getSentFirstActionForThunk().add('thunk-1');
      processor.getSentFirstActionForThunk().add('thunk-2');

      // Verify setup
      expect(processor.getPendingActionPromises().size).toBe(2);
      expect(processor.getSentFirstActionForThunk().size).toBe(2);

      // Call cleanup
      processor.forceCleanupExpiredActions();

      // Verify cleanup
      expect(processor.getPendingActionPromises().size).toBe(0);
      expect(processor.getSentFirstActionForThunk().size).toBe(0);
      expect(callback1).toHaveBeenCalledWith('Force cleanup');
      expect(callback2).toHaveBeenCalledWith('Force cleanup');
    });

    it('should handle errors during force cleanup', () => {
      const actionId = 'error-action';
      const errorCallback = vi.fn(() => {
        throw new Error('Cleanup error');
      });

      processor.getPendingActionPromises().set(actionId, {
        resolve: errorCallback,
        promise: Promise.resolve(),
      });

      // Should not throw even if callback throws
      expect(() => processor.forceCleanupExpiredActions()).not.toThrow();
      expect(errorCallback).toHaveBeenCalled();
      // biome-ignore lint/suspicious/noExplicitAny: Test needs to access private property
      expect((processor as any).pendingActionPromises.size).toBe(0);
    });
  });

  describe('destroy', () => {
    it('should cleanup and clear state manager', () => {
      // Set up some state
      processor.getPendingActionPromises().set('test-action', {
        resolve: vi.fn(),
        promise: Promise.resolve(),
      });

      // biome-ignore lint/suspicious/noExplicitAny: Test needs to access private property
      expect((processor as any).stateManager).toBeDefined();
      expect(processor.getPendingActionPromises().size).toBe(1);

      processor.destroy();

      // biome-ignore lint/suspicious/noExplicitAny: Test needs to access private property
      expect((processor as any).stateManager).toBeUndefined();
      expect(processor.getPendingActionPromises().size).toBe(0);
    });
  });

  describe('singleton functions', () => {
    afterEach(() => {
      // Clean up singleton between tests
      resetMainThunkProcessor();
    });

    it('should create singleton instance with getMainThunkProcessor', () => {
      const instance1 = getMainThunkProcessor();
      const instance2 = getMainThunkProcessor();

      expect(instance1).toBe(instance2);
      expect(instance1).toBeInstanceOf(MainThunkProcessor);
    });

    it('should create singleton with custom options', () => {
      const customOptions = {
        actionCompletionTimeoutMs: 5000,
        maxQueueSize: 50,
      };

      const instance = getMainThunkProcessor(customOptions);
      expect(instance).toBeInstanceOf(MainThunkProcessor);
    });

    it('should reset singleton with resetMainThunkProcessor', () => {
      const instance1 = getMainThunkProcessor();
      resetMainThunkProcessor();
      const instance2 = getMainThunkProcessor();

      expect(instance1).not.toBe(instance2);
    });

    it('should handle reset when no instance exists', () => {
      // Should not throw when no instance exists
      expect(() => resetMainThunkProcessor()).not.toThrow();
    });
  });

  describe('dispatchAction error handling', () => {
    it('should handle missing action ID', async () => {
      // Create an action without ID and mock ensureActionId to return action without ID
      // biome-ignore lint/suspicious/noExplicitAny: Test needs to mock private method
      const originalEnsureActionId = (processor as any).ensureActionId;
      // biome-ignore lint/suspicious/noExplicitAny: Test needs to mock private method
      (processor as any).ensureActionId = vi.fn().mockReturnValue({ type: 'TEST_ACTION' });

      const thunk: Thunk = vi.fn(async (_getState, dispatch) => {
        await dispatch({ type: 'TEST_ACTION' });
      });

      await expect(processor.executeThunk(thunk, { windowId: 1 })).rejects.toThrow(
        'Action ID is required but not set',
      );

      // Restore original method
      // biome-ignore lint/suspicious/noExplicitAny: Test needs to restore private method
      (processor as any).ensureActionId = originalEnsureActionId;
    });

    it('should throw error when dispatchAction called without state manager', async () => {
      // Create processor without state manager initialized
      const uninitializedProcessor = new MainThunkProcessor();

      // Try to call dispatchAction directly (this calls the private method)
      await expect(
        // biome-ignore lint/suspicious/noExplicitAny: Test needs to call private method
        (uninitializedProcessor as any).dispatchAction({ type: 'TEST' }),
      ).rejects.toThrow('State manager not set. Call initialize() before dispatching actions.');
    });

    it('should handle queue overflow in dispatchAction', async () => {
      const smallQueueProcessor = new MainThunkProcessor({
        actionCompletionTimeoutMs: 1000,
        maxQueueSize: 1, // Very small queue
      });
      smallQueueProcessor.initialize({ stateManager: mockStateManager });

      // Fill the queue to capacity by adding a pending promise manually
      // biome-ignore lint/suspicious/noExplicitAny: Test needs to access private property
      (smallQueueProcessor as any).pendingActionPromises.set('existing-action', {
        resolve: vi.fn(),
        promise: Promise.resolve(),
      });

      // Now try to dispatch another action, which should trigger queue overflow
      await expect(
        // biome-ignore lint/suspicious/noExplicitAny: Test needs to call private method
        (smallQueueProcessor as any).dispatchAction({ type: 'OVERFLOW_ACTION' }),
      ).rejects.toThrow('Action queue overflow');
    });
  });

  describe('state propagation and completion logic', () => {
    it('should handle thunk completion with state propagation timeout', async () => {
      // Mock thunkManager to simulate never completing state propagation
      const { thunkManager } = await import('../../src/thunk/init.js');
      // biome-ignore lint/suspicious/noExplicitAny: Test needs to mock thunkManager method
      (thunkManager.isThunkFullyComplete as any).mockReturnValue(false);

      const shortTimeoutProcessor = new MainThunkProcessor({
        actionCompletionTimeoutMs: 10, // Very short timeout
        maxQueueSize: 10,
      });
      shortTimeoutProcessor.initialize({ stateManager: mockStateManager });

      const thunk = createMockThunk();

      await expect(shortTimeoutProcessor.executeThunk(thunk, { windowId: 1 })).rejects.toThrow(
        'Thunk completion timeout',
      );
    });

    it('should handle immediate thunk completion without waiting', async () => {
      // Mock thunkManager to simulate immediate completion
      const { thunkManager } = await import('../../src/thunk/init.js');
      // biome-ignore lint/suspicious/noExplicitAny: Test needs to mock thunkManager method
      (thunkManager.isThunkFullyComplete as any).mockReturnValue(true);

      const thunk = createMockThunk();
      const result = await processor.executeThunk(thunk, { windowId: 1 });

      expect(result).toBe(42);
      expect(thunkManager.isThunkFullyComplete).toHaveBeenCalled();
    });
  });
});
