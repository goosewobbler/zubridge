import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ThunkPriority } from '../../src/constants.js';
import type { ThunkScheduler } from '../../src/thunk/scheduling/ThunkScheduler.js';
import { ThunkManager, ThunkManagerEvent } from '../../src/thunk/ThunkManager.js';
import type { ThunkAction, ThunkTask } from '../../src/types/thunk';

// Mock scheduler that provides the minimum required interface
const createMockScheduler = () => ({
  queue: [],
  runningTasks: new Map(),
  isProcessing: false,
  hasConflicts: vi.fn(() => false),
  canTaskRun: vi.fn(() => true),
  startTask: vi.fn(),
  completeTask: vi.fn(),
  failTask: vi.fn(),
  addTimestamp: vi.fn(),
  removeFromQueue: vi.fn(),
  insertInQueue: vi.fn(),
  findQueuePosition: vi.fn(),
  getHighestPriorityQueuedTask: vi.fn(),
  getPendingTasks: vi.fn(() => []),
  cleanup: vi.fn(),
  getRunningTasks: vi.fn(() => []),
  getQueueStatus: vi.fn(() => ({
    isIdle: true,
    queuedTasks: 0,
    runningTasks: 0,
    highestPriorityQueued: -1,
  })),
  removeTasks: vi.fn(),
  processQueue: vi.fn(),
  enqueue: vi.fn(() => true),
  isIdle: vi.fn(() => true),
  emit: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
});

describe('ThunkManager', () => {
  let thunkManager: ThunkManager;
  let mockScheduler: ReturnType<typeof createMockScheduler>;
  let mockStateManager: { processAction: (action: unknown) => unknown };

  beforeEach(() => {
    mockScheduler = createMockScheduler();
    mockStateManager = {
      processAction: vi.fn().mockReturnValue({ counter: 0 }),
    };

    thunkManager = new ThunkManager(mockScheduler as unknown as ThunkScheduler);
    thunkManager.setStateManager(mockStateManager);

    vi.clearAllMocks();
  });

  it('should create a ThunkManager instance', () => {
    expect(thunkManager).toBeInstanceOf(ThunkManager);
  });

  describe('basic functionality', () => {
    it('should register a thunk with minimal configuration', () => {
      const thunkAction: ThunkAction = {
        type: 'TEST_THUNK',
        __id: 'test-thunk-1',
      };

      expect(() => thunkManager.registerThunk(thunkAction)).not.toThrow();
    });

    it('should register a thunk with task and priority', () => {
      const thunkAction: ThunkAction = {
        type: 'TEST_THUNK',
        __id: 'test-thunk-2',
      };

      const task: ThunkTask = {
        id: 'task-1',
        thunkId: 'test-thunk-2',
        handler: vi.fn(() => Promise.resolve()),
        priority: ThunkPriority.HIGH,
        canRunConcurrently: false,
        createdAt: Date.now(),
      };

      expect(() => thunkManager.registerThunk(thunkAction, task, ThunkPriority.HIGH)).not.toThrow();
    });
  });

  describe('action processing', () => {
    it('should determine if an action can be processed when scheduler is idle', () => {
      mockScheduler.getQueueStatus.mockReturnValue({
        isIdle: true,
        queuedTasks: 0,
        runningTasks: 0,
        highestPriorityQueued: -1,
      });

      const action = { type: 'TEST_ACTION' };
      expect(thunkManager.canProcessActionImmediately(action)).toBe(true);
    });

    it('should determine if an action cannot be processed when scheduler is busy', () => {
      mockScheduler.getQueueStatus.mockReturnValue({
        isIdle: false,
        queuedTasks: 2,
        runningTasks: 1,
        highestPriorityQueued: 1,
      });

      const action = { type: 'TEST_ACTION' };
      expect(thunkManager.canProcessActionImmediately(action)).toBe(false);
    });

    it('should handle actions with bypassThunkLock flag', () => {
      mockScheduler.getQueueStatus.mockReturnValue({
        isIdle: false,
        queuedTasks: 2,
        runningTasks: 1,
        highestPriorityQueued: 1,
      });

      const action = { type: 'BYPASS_ACTION', __bypassThunkLock: true };
      expect(thunkManager.canProcessActionImmediately(action)).toBe(true);
    });

    it('should determine if action requires queue', () => {
      mockScheduler.getQueueStatus.mockReturnValue({
        isIdle: false,
        queuedTasks: 2,
        runningTasks: 1,
        highestPriorityQueued: 1,
      });

      const action = { type: 'TEST_ACTION' };
      expect(thunkManager.requiresQueue(action)).toBe(true);

      mockScheduler.getQueueStatus.mockReturnValue({
        isIdle: true,
        queuedTasks: 0,
        runningTasks: 0,
        highestPriorityQueued: -1,
      });
      // The implementation returns true regardless of scheduler state unless bypass flag is set
      expect(thunkManager.requiresQueue(action)).toBe(true);
    });
  });

  describe('state management', () => {
    it('should allow setting a state manager', () => {
      const newStateManager = {
        processAction: vi.fn().mockReturnValue({ newCounter: 42 }),
      };

      expect(() => thunkManager.setStateManager(newStateManager)).not.toThrow();
    });

    it('should handle null state manager gracefully', () => {
      expect(() => thunkManager.setStateManager(null)).not.toThrow();
    });
  });

  describe('state update tracking', () => {
    it('should track state updates for thunk completion', () => {
      const thunkId = 'update-test-thunk';
      const updateId = 'update-1';
      const renderers = [1, 2];

      expect(() =>
        thunkManager.trackStateUpdateForThunk(thunkId, updateId, renderers),
      ).not.toThrow();
    });

    it('should acknowledge state updates from renderers', () => {
      const updateId = 'update-2';
      const renderers = [1, 2];

      thunkManager.trackStateUpdateForThunk('test-thunk', updateId, renderers);

      // Partial acknowledgments
      expect(thunkManager.acknowledgeStateUpdate(updateId, 1)).toBe(false);
      expect(thunkManager.acknowledgeStateUpdate(updateId, 2)).toBe(true);
    });

    it('should handle acknowledgment of unknown update ID', () => {
      const result = thunkManager.acknowledgeStateUpdate('unknown-update', 1);
      // The implementation returns true for unknown update IDs
      expect(result).toBe(true);
    });

    it('should cleanup dead renderers', () => {
      expect(() => thunkManager.cleanupDeadRenderer(999)).not.toThrow();
    });

    it('should cleanup expired state updates', () => {
      expect(() => thunkManager.cleanupExpiredUpdates(1000)).not.toThrow();
    });
  });

  describe('thunk action tracking', () => {
    it('should track current thunk action ID', () => {
      expect(thunkManager.getCurrentThunkActionId()).toBeUndefined();

      thunkManager.setCurrentThunkActionId('test-action-123');
      expect(thunkManager.getCurrentThunkActionId()).toBe('test-action-123');

      thunkManager.setCurrentThunkActionId(undefined);
      expect(thunkManager.getCurrentThunkActionId()).toBeUndefined();
    });
  });

  describe('scheduler integration', () => {
    it('should return the scheduler instance', () => {
      const scheduler = thunkManager.getTaskScheduler();
      expect(scheduler).toBe(mockScheduler);
    });
  });

  describe('cleanup and lifecycle', () => {
    it('should clear all thunk data', () => {
      expect(() => thunkManager.clear()).not.toThrow();
    });

    it('should force cleanup completed thunks', () => {
      expect(() => thunkManager.forceCleanupCompletedThunks()).not.toThrow();
    });
  });

  describe('event handling', () => {
    it('should support event listeners', () => {
      const handler = vi.fn();

      expect(() => {
        thunkManager.on(ThunkManagerEvent.THUNK_REGISTERED, handler);
        thunkManager.off(ThunkManagerEvent.THUNK_REGISTERED, handler);
      }).not.toThrow();
    });
  });

  describe('error handling', () => {
    it('should handle processing actions for non-existent thunk', async () => {
      const action = { type: 'TEST_ACTION' };
      await expect(thunkManager.processAction('non-existent', action)).rejects.toThrow();
    });

    it('should handle invalid method calls gracefully', () => {
      // These should not throw errors
      expect(() => thunkManager.executeThunk('non-existent')).not.toThrow();
      expect(() => thunkManager.completeThunk('non-existent')).not.toThrow();
      expect(() => thunkManager.failThunk('non-existent', new Error('test'))).not.toThrow();
    });
  });

  describe('data queries', () => {
    it('should return active thunks summary', () => {
      const summary = thunkManager.getActiveThunksSummary();
      expect(summary).toHaveProperty('thunks');
      expect(Array.isArray(summary.thunks)).toBe(true);
    });

    it('should check if thunk exists', () => {
      expect(thunkManager.hasThunk('non-existent')).toBe(false);
    });

    it('should check if thunk is active', () => {
      expect(thunkManager.isThunkActive('non-existent')).toBe(false);
    });

    it('should check if thunk is fully complete', () => {
      expect(thunkManager.isThunkFullyComplete('non-existent')).toBe(false);
    });

    it('should get current root thunk ID', () => {
      const rootThunkId = thunkManager.getCurrentRootThunkId();
      expect(rootThunkId).toBeUndefined();
    });

    it('should get thunk information', () => {
      expect(thunkManager.getThunk('non-existent')).toBeUndefined();
      expect(thunkManager.getThunkResult('non-existent')).toBeUndefined();
      expect(thunkManager.getThunkError('non-existent')).toBeUndefined();
    });
  });

  describe('compatibility methods', () => {
    it('should mark thunk executing via compatibility method', async () => {
      const thunkId = 'test-thunk';
      const thunkAction: ThunkAction = {
        type: 'TEST_THUNK',
        __id: thunkId,
      };
      thunkManager.registerThunk(thunkAction);

      thunkManager.markThunkExecuting(thunkId);

      expect(thunkManager.isThunkActive(thunkId)).toBe(true);
    });

    it('should mark thunk failed via compatibility method', async () => {
      const thunkId = 'test-thunk';
      const error = new Error('Test error');
      const thunkAction: ThunkAction = {
        type: 'TEST_THUNK',
        __id: thunkId,
      };
      thunkManager.registerThunk(thunkAction);
      thunkManager.executeThunk(thunkId);

      thunkManager.markThunkFailed(thunkId, error);

      expect(thunkManager.getThunkError(thunkId)).toBe(error);
    });

    it('should check if action should be queued', () => {
      const action = { type: 'TEST_ACTION', __id: 'test-id' };

      const result = thunkManager.shouldQueueAction(action);

      expect(result).toBe(true); // Default behavior without bypass flag
    });

    it('should check if action can be processed', () => {
      const action = { type: 'TEST_ACTION', __bypassThunkLock: true };

      const result = thunkManager.canProcessAction(action);

      expect(result).toBe(true);
    });

    it('should get scheduler via compatibility method', () => {
      const scheduler = thunkManager.getScheduler();

      expect(scheduler).toBeDefined();
      expect(scheduler).toBe(thunkManager.getTaskScheduler());
    });

    it('should process thunk action with valid parent', () => {
      const parentThunkId = 'parent-thunk';
      const thunkAction: ThunkAction = {
        type: 'TEST_THUNK',
        __id: parentThunkId,
      };
      thunkManager.registerThunk(thunkAction);

      const action = {
        type: 'TEST_ACTION',
        __id: 'test-id',
        __thunkParentId: parentThunkId,
        __bypassThunkLock: true,
      };

      const result = thunkManager.processThunkAction(action);

      expect(result).toBe(true);
    });

    it('should reject processing action without valid parent thunk', () => {
      const action = {
        type: 'TEST_ACTION',
        __id: 'test-id',
        __thunkParentId: 'non-existent-thunk',
      };

      const result = thunkManager.processThunkAction(action);

      expect(result).toBe(false);
    });

    it('should reject processing action without parent thunk ID', () => {
      const action = {
        type: 'TEST_ACTION',
        __id: 'test-id',
      };

      const result = thunkManager.processThunkAction(action);

      expect(result).toBe(false);
    });

    it('should set current thunk action via compatibility method', () => {
      const actionId = 'test-action-id';

      thunkManager.setCurrentThunkAction(actionId);

      // This method delegates to actionProcessor, so we just ensure it doesn't throw
      expect(() => thunkManager.setCurrentThunkAction(actionId)).not.toThrow();
    });

    it('should get current active thunk ID via compatibility method', () => {
      // Should delegate to getCurrentRootThunkId
      const result = thunkManager.getCurrentActiveThunkId();

      expect(result).toBeUndefined(); // No active thunk initially
    });

    it('should cleanup expired state updates via compatibility method', () => {
      const maxAge = 1000;

      // Should delegate to stateUpdateTracker
      expect(() => thunkManager.cleanupExpiredStateUpdates(maxAge)).not.toThrow();
    });
  });
});
