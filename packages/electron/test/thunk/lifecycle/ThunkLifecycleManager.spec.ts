import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Action } from '@zubridge/types';
import { ThunkPriority } from '../../../src/constants.js';
import {
  ThunkLifecycleManager,
  ThunkManagerEvent,
} from '../../../src/thunk/lifecycle/ThunkLifecycleManager.js';
import { Thunk, ThunkState } from '../../../src/thunk/Thunk.js';
import type { ThunkAction, ThunkTask } from '../../../src/types/thunk.js';
import type { ThunkScheduler } from '../../../src/thunk/scheduling/ThunkScheduler.js';
import type { ActionProcessor } from '../../../src/thunk/processing/ActionProcessor.js';
import type { StateUpdateTracker } from '../../../src/thunk/tracking/StateUpdateTracker.js';

// Mock dependencies
const createMockScheduler = () => ({
  processQueue: vi.fn(),
  getQueueStatus: vi.fn(() => ({ isIdle: true })),
  enqueue: vi.fn(),
  getRunningTasks: vi.fn(() => []),
  removeTasks: vi.fn(),
});

const createMockActionProcessor = () => {
  const mockOn = vi.fn();
  return {
    handleActionComplete: vi.fn(() => []),
    cleanupThunkActions: vi.fn(),
    getPendingActions: vi.fn(() => new Set()),
    clear: vi.fn(),
    on: mockOn,
    // Store the on method for easy access in tests
    _mockOn: mockOn,
  };
};

const createMockStateUpdateTracker = () => ({
  hasPendingStateUpdates: vi.fn(() => false),
});

describe('ThunkLifecycleManager', () => {
  let lifecycleManager: ThunkLifecycleManager;
  let mockScheduler: ReturnType<typeof createMockScheduler>;
  let mockActionProcessor: ReturnType<typeof createMockActionProcessor>;
  let mockStateUpdateTracker: ReturnType<typeof createMockStateUpdateTracker>;

  beforeEach(() => {
    mockScheduler = createMockScheduler();
    mockActionProcessor = createMockActionProcessor();
    mockStateUpdateTracker = createMockStateUpdateTracker();

    lifecycleManager = new ThunkLifecycleManager(
      mockScheduler as unknown as ThunkScheduler,
      mockActionProcessor as unknown as ActionProcessor,
      mockStateUpdateTracker as unknown as StateUpdateTracker,
    );

    vi.clearAllMocks();
  });

  describe('registerThunk', () => {
    it('should register a thunk with minimal configuration', () => {
      const thunkAction: ThunkAction = {
        type: 'TEST_THUNK',
        __id: 'test-thunk-1',
      };

      const handle = lifecycleManager.registerThunk(thunkAction);

      expect(handle.id).toBe('test-thunk-1');
      expect(lifecycleManager.hasThunk('test-thunk-1')).toBe(true);
    });

    it('should register a thunk with task and priority', () => {
      const thunkAction: ThunkAction = {
        type: 'TEST_THUNK',
        __id: 'test-thunk-2',
      };

      const task: ThunkTask = {
        id: 'task-1',
        thunkId: 'test-thunk-2',
        handler: vi.fn(),
        priority: ThunkPriority.HIGH,
        canRunConcurrently: true,
        createdAt: Date.now(),
      };

      const handle = lifecycleManager.registerThunk(thunkAction, task, ThunkPriority.HIGH);

      expect(handle.id).toBe('test-thunk-2');
      expect(lifecycleManager.hasThunk('test-thunk-2')).toBe(true);
    });

    it('should emit THUNK_REGISTERED event', () => {
      const eventSpy = vi.fn();
      lifecycleManager.on(ThunkManagerEvent.THUNK_REGISTERED, eventSpy);

      const thunkAction: ThunkAction = {
        type: 'TEST_THUNK',
        __id: 'test-thunk-3',
      };

      lifecycleManager.registerThunk(thunkAction);

      expect(eventSpy).toHaveBeenCalledTimes(1);
      expect(eventSpy).toHaveBeenCalledWith(expect.any(Thunk));
    });

    it('should register thunk with parent ID', () => {
      const thunkAction: ThunkAction = {
        type: 'CHILD_THUNK',
        __id: 'child-thunk-1',
        parentId: 'parent-thunk',
      };

      const handle = lifecycleManager.registerThunk(thunkAction);
      const thunk = lifecycleManager.getThunk(handle.id);

      expect(thunk?.parentId).toBe('parent-thunk');
    });
  });

  describe('executeThunk', () => {
    it('should execute a registered thunk', () => {
      const thunkAction: ThunkAction = {
        type: 'TEST_THUNK',
        __id: 'test-thunk',
      };

      const handle = lifecycleManager.registerThunk(thunkAction);
      const eventSpy = vi.fn();
      lifecycleManager.on(ThunkManagerEvent.THUNK_STARTED, eventSpy);

      lifecycleManager.executeThunk(handle.id);

      const thunk = lifecycleManager.getThunk(handle.id);
      expect(thunk?.state).toBe(ThunkState.EXECUTING);
      expect(eventSpy).toHaveBeenCalledWith(thunk);
    });

    it('should set as root thunk if none is active', () => {
      const thunkAction: ThunkAction = {
        type: 'ROOT_THUNK',
        __id: 'root-thunk',
      };

      const handle = lifecycleManager.registerThunk(thunkAction);
      const eventSpy = vi.fn();
      lifecycleManager.on(ThunkManagerEvent.ROOT_THUNK_CHANGED, eventSpy);

      lifecycleManager.executeThunk(handle.id);

      expect(lifecycleManager.getCurrentRootThunkId()).toBe(handle.id);
      expect(eventSpy).toHaveBeenCalledWith(handle.id);
    });

    it('should not change root thunk if one is already active', () => {
      const rootAction: ThunkAction = {
        type: 'ROOT_THUNK',
        __id: 'root-thunk',
      };
      const childAction: ThunkAction = {
        type: 'CHILD_THUNK',
        __id: 'child-thunk',
      };

      const rootHandle = lifecycleManager.registerThunk(rootAction);
      const childHandle = lifecycleManager.registerThunk(childAction);

      lifecycleManager.executeThunk(rootHandle.id);
      lifecycleManager.executeThunk(childHandle.id);

      expect(lifecycleManager.getCurrentRootThunkId()).toBe(rootHandle.id);
    });

    it('should handle execution of non-existent thunk gracefully', () => {
      expect(() => lifecycleManager.executeThunk('non-existent')).not.toThrow();
    });
  });

  describe('completeThunk', () => {
    it('should complete a thunk when no actions are pending', () => {
      const thunkAction: ThunkAction = {
        type: 'TEST_THUNK',
        __id: 'test-thunk',
      };

      const handle = lifecycleManager.registerThunk(thunkAction);
      lifecycleManager.executeThunk(handle.id);

      const eventSpy = vi.fn();
      lifecycleManager.on(ThunkManagerEvent.THUNK_COMPLETED, eventSpy);

      // Mock no pending actions
      mockActionProcessor.getPendingActions.mockReturnValue(new Set());

      lifecycleManager.completeThunk(handle.id);

      const thunk = lifecycleManager.getThunk(handle.id);
      expect(thunk?.state).toBe(ThunkState.COMPLETED);
      expect(eventSpy).toHaveBeenCalledWith(thunk);
      expect(mockScheduler.processQueue).toHaveBeenCalled();
    });

    it('should defer completion when actions are still pending', () => {
      const thunkAction: ThunkAction = {
        type: 'TEST_THUNK',
        __id: 'test-thunk',
      };

      const handle = lifecycleManager.registerThunk(thunkAction);
      lifecycleManager.executeThunk(handle.id);

      const eventSpy = vi.fn();
      lifecycleManager.on(ThunkManagerEvent.THUNK_COMPLETED, eventSpy);

      // Mock pending actions
      mockActionProcessor.getPendingActions.mockReturnValue(new Set(['action-1']));

      lifecycleManager.completeThunk(handle.id);

      const thunk = lifecycleManager.getThunk(handle.id);
      expect(thunk?.state).toBe(ThunkState.EXECUTING); // Should still be executing
      expect(eventSpy).not.toHaveBeenCalled(); // Event not emitted yet
    });

    it('should store result when provided', () => {
      const thunkAction: ThunkAction = {
        type: 'TEST_THUNK',
        __id: 'test-thunk',
      };

      const handle = lifecycleManager.registerThunk(thunkAction);
      const result = { success: true, data: 'test' };

      mockActionProcessor.getPendingActions.mockReturnValue(new Set());

      lifecycleManager.completeThunk(handle.id, result);

      expect(lifecycleManager.getThunkResult(handle.id)).toBe(result);
    });

    it('should handle completion of already completed thunk', () => {
      const thunkAction: ThunkAction = {
        type: 'TEST_THUNK',
        __id: 'test-thunk',
      };

      const handle = lifecycleManager.registerThunk(thunkAction);
      lifecycleManager.executeThunk(handle.id);

      mockActionProcessor.getPendingActions.mockReturnValue(new Set());

      // Complete once
      lifecycleManager.completeThunk(handle.id);

      // Try to complete again
      expect(() => lifecycleManager.completeThunk(handle.id)).not.toThrow();

      const thunk = lifecycleManager.getThunk(handle.id);
      expect(thunk?.state).toBe(ThunkState.COMPLETED);
    });

    it('should emit ROOT_THUNK_COMPLETED when root thunk completes', () => {
      const thunkAction: ThunkAction = {
        type: 'ROOT_THUNK',
        __id: 'root-thunk',
      };

      const handle = lifecycleManager.registerThunk(thunkAction);
      lifecycleManager.executeThunk(handle.id);

      const eventSpy = vi.fn();
      lifecycleManager.on(ThunkManagerEvent.ROOT_THUNK_COMPLETED, eventSpy);

      mockActionProcessor.getPendingActions.mockReturnValue(new Set());

      lifecycleManager.completeThunk(handle.id);

      expect(eventSpy).toHaveBeenCalledTimes(1);
      expect(lifecycleManager.getCurrentRootThunkId()).toBeUndefined();
    });
  });

  describe('failThunk', () => {
    it('should fail a thunk', () => {
      const thunkAction: ThunkAction = {
        type: 'TEST_THUNK',
        __id: 'test-thunk',
      };

      const handle = lifecycleManager.registerThunk(thunkAction);
      lifecycleManager.executeThunk(handle.id);

      const error = new Error('Test failure');
      const eventSpy = vi.fn();
      lifecycleManager.on(ThunkManagerEvent.THUNK_FAILED, eventSpy);

      lifecycleManager.failThunk(handle.id, error);

      const thunk = lifecycleManager.getThunk(handle.id);
      expect(thunk?.state).toBe(ThunkState.FAILED);
      expect(lifecycleManager.getThunkError(handle.id)).toBe(error);
      expect(eventSpy).toHaveBeenCalledWith(thunk, error);
    });

    it('should handle failing root thunk', () => {
      const thunkAction: ThunkAction = {
        type: 'ROOT_THUNK',
        __id: 'root-thunk',
      };

      const handle = lifecycleManager.registerThunk(thunkAction);
      lifecycleManager.executeThunk(handle.id);

      const eventSpy = vi.fn();
      lifecycleManager.on(ThunkManagerEvent.ROOT_THUNK_COMPLETED, eventSpy);

      lifecycleManager.failThunk(handle.id, new Error('Root failure'));

      expect(eventSpy).toHaveBeenCalled();
      expect(lifecycleManager.getCurrentRootThunkId()).toBeUndefined();
    });

    it('should handle failing non-existent thunk gracefully', () => {
      expect(() => lifecycleManager.failThunk('non-existent', new Error('Test'))).not.toThrow();
    });
  });

  describe('getActiveThunksSummary', () => {
    it('should return empty array when no thunks are active', () => {
      const summary = lifecycleManager.getActiveThunksSummary();
      expect(summary).toEqual([]);
    });

    it('should return active thunks', () => {
      const thunkAction: ThunkAction = {
        type: 'ACTIVE_THUNK',
        __id: 'active-thunk',
      };

      const handle = lifecycleManager.registerThunk(thunkAction);
      lifecycleManager.executeThunk(handle.id);

      const summary = lifecycleManager.getActiveThunksSummary();

      expect(summary).toHaveLength(1);
      expect(summary[0].id).toBe('active-thunk');
      expect(summary[0].state).toBe(ThunkState.EXECUTING);
    });
  });

  describe('canProcessActionImmediately', () => {
    it('should return true for actions with bypass flag', () => {
      const action: Action = {
        type: 'TEST_ACTION',
        __bypassThunkLock: true,
      };

      expect(lifecycleManager.canProcessActionImmediately(action)).toBe(true);
    });

    it('should delegate to scheduler when no bypass flag', () => {
      const action: Action = {
        type: 'TEST_ACTION',
      };

      mockScheduler.getQueueStatus.mockReturnValue({ isIdle: false });

      expect(lifecycleManager.canProcessActionImmediately(action)).toBe(false);

      mockScheduler.getQueueStatus.mockReturnValue({ isIdle: true });

      expect(lifecycleManager.canProcessActionImmediately(action)).toBe(true);
    });
  });

  describe('isThunkFullyComplete', () => {
    it('should return false for non-existent thunk', () => {
      expect(lifecycleManager.isThunkFullyComplete('non-existent')).toBe(false);
    });

    it('should return false for non-completed thunk', () => {
      const thunkAction: ThunkAction = {
        type: 'TEST_THUNK',
        __id: 'test-thunk',
      };

      const handle = lifecycleManager.registerThunk(thunkAction);
      expect(lifecycleManager.isThunkFullyComplete(handle.id)).toBe(false);
    });

    it('should return false for completed thunk with pending state updates', () => {
      const thunkAction: ThunkAction = {
        type: 'TEST_THUNK',
        __id: 'test-thunk',
      };

      const handle = lifecycleManager.registerThunk(thunkAction);
      lifecycleManager.executeThunk(handle.id);

      mockActionProcessor.getPendingActions.mockReturnValue(new Set());
      mockStateUpdateTracker.hasPendingStateUpdates.mockReturnValue(true);

      lifecycleManager.completeThunk(handle.id);

      expect(lifecycleManager.isThunkFullyComplete(handle.id)).toBe(false);
    });

    it('should return true for completed thunk with no pending state updates', () => {
      const thunkAction: ThunkAction = {
        type: 'TEST_THUNK',
        __id: 'test-thunk',
      };

      const handle = lifecycleManager.registerThunk(thunkAction);
      lifecycleManager.executeThunk(handle.id);

      mockActionProcessor.getPendingActions.mockReturnValue(new Set());
      mockStateUpdateTracker.hasPendingStateUpdates.mockReturnValue(false);

      lifecycleManager.completeThunk(handle.id);

      expect(lifecycleManager.isThunkFullyComplete(handle.id)).toBe(true);
    });
  });

  describe('forceCleanupCompletedThunks', () => {
    it('should cleanup completed and failed thunks', () => {
      const completedAction: ThunkAction = {
        type: 'COMPLETED_THUNK',
        __id: 'completed-thunk',
      };
      const failedAction: ThunkAction = {
        type: 'FAILED_THUNK',
        __id: 'failed-thunk',
      };

      const completedHandle = lifecycleManager.registerThunk(completedAction);
      const failedHandle = lifecycleManager.registerThunk(failedAction);

      lifecycleManager.executeThunk(completedHandle.id);
      lifecycleManager.executeThunk(failedHandle.id);

      mockActionProcessor.getPendingActions.mockReturnValue(new Set());

      lifecycleManager.completeThunk(completedHandle.id);
      lifecycleManager.failThunk(failedHandle.id, new Error('Test'));

      // Both should exist before cleanup
      expect(lifecycleManager.hasThunk(completedHandle.id)).toBe(true);
      expect(lifecycleManager.hasThunk(failedHandle.id)).toBe(true);

      lifecycleManager.forceCleanupCompletedThunks();

      // Both should be cleaned up
      expect(lifecycleManager.hasThunk(completedHandle.id)).toBe(false);
      expect(lifecycleManager.hasThunk(failedHandle.id)).toBe(false);
    });
  });

  describe('clear', () => {
    it('should clear all data', () => {
      const thunkAction: ThunkAction = {
        type: 'TEST_THUNK',
        __id: 'test-thunk',
      };

      const handle = lifecycleManager.registerThunk(thunkAction);
      lifecycleManager.executeThunk(handle.id);

      expect(lifecycleManager.hasThunk(handle.id)).toBe(true);
      expect(lifecycleManager.getCurrentRootThunkId()).toBe(handle.id);

      lifecycleManager.clear();

      expect(lifecycleManager.hasThunk(handle.id)).toBe(false);
      expect(lifecycleManager.getCurrentRootThunkId()).toBeUndefined();
      expect(mockActionProcessor.clear).toHaveBeenCalled();
    });
  });

  // Note: Event handling is tested through integration with ActionProcessor
});
