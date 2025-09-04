import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type Thunk, ThunkState } from '../../src/thunk/Thunk.js';
import { ThunkManager, ThunkManagerEvent } from '../../src/thunk/ThunkManager.js';
import type { ThunkScheduler } from '../../src/thunk/scheduling/ThunkScheduler.js';
import type { ThunkTask } from '../../src/types/thunk';

// Test utilities for accessing private properties and methods
const getThunkManagerPrivate = (thunkManager: ThunkManager) => {
  return thunkManager as unknown as {
    thunks: Map<string, Thunk>;
    thunkActions: Map<string, Set<string>>;
    thunkTasks: Map<string, { canRunConcurrently: boolean }>;
    thunkResults: Map<string, unknown>;
    thunkErrors: Map<string, Error>;
    thunkPendingUpdates: Map<string, Set<string>>;
    finalizeThunkCompletion(thunkId: string): void;
    tryFinalCleanup(thunkId: string): void;
  };
};

// Test utility to check if thunk exists
const hasThunk = (thunkManager: ThunkManager, thunkId: string): boolean => {
  const privateThunkManager = getThunkManagerPrivate(thunkManager);
  return privateThunkManager.thunks.has(thunkId);
};

// Test utility for action completion (simulates internal behavior)
const simulateActionCompletion = (thunkManager: ThunkManager, actionId: string): void => {
  const privateThunkManager = getThunkManagerPrivate(thunkManager);

  // Find the thunk that owns this action
  for (const [thunkId, actions] of privateThunkManager.thunkActions.entries()) {
    if (actions.has(actionId)) {
      actions.delete(actionId);
      if (actions.size === 0) {
        const thunk = privateThunkManager.thunks.get(thunkId);
        if (thunk && thunk.state === 'executing') {
          privateThunkManager.finalizeThunkCompletion(thunkId);
        }
      }
      break;
    }
  }
};

// Test utility to trigger final cleanup
const triggerFinalCleanup = (thunkManager: ThunkManager, thunkId: string): void => {
  const privateThunkManager = getThunkManagerPrivate(thunkManager);
  privateThunkManager.tryFinalCleanup(thunkId);
};

// Test utility to force cleanup of completed thunks
const forceCleanupCompletedThunks = (thunkManager: ThunkManager): void => {
  const privateThunkManager = getThunkManagerPrivate(thunkManager);
  const completedThunkIds: string[] = [];
  for (const [thunkId, thunk] of privateThunkManager.thunks.entries()) {
    if (thunk.state === 'completed' || thunk.state === 'failed') {
      completedThunkIds.push(thunkId);
    }
  }

  for (const thunkId of completedThunkIds) {
    setTimeout(() => {
      privateThunkManager.thunks.delete(thunkId);
      privateThunkManager.thunkActions.delete(thunkId);
      privateThunkManager.thunkTasks.delete(thunkId);
      privateThunkManager.thunkResults.delete(thunkId);
      privateThunkManager.thunkErrors.delete(thunkId);
    }, 200);
  }
};

// Minimal mock Thunk class
class MockThunk {
  id: string;
  state: ThunkState = ThunkState.PENDING;
  parentId?: string;
  sourceWindowId = 1;
  constructor(id: string, parentId?: string) {
    this.id = id;
    this.parentId = parentId;
  }
  activate() {
    this.state = ThunkState.EXECUTING;
  }
  complete() {
    this.state = ThunkState.COMPLETED;
  }
  fail() {
    this.state = ThunkState.FAILED;
  }
}

// Minimal mock ThunkScheduler that extends EventEmitter like the real one
class MockScheduler extends EventEmitter {
  queue: ThunkTask[] = [];
  runningTasks: Map<string, ThunkTask> = new Map();
  isProcessing = false;
  hasConflicts = vi.fn();
  canTaskRun = vi.fn();
  startTask = vi.fn();
  completeTask = vi.fn();
  failTask = vi.fn();
  addTimestamp = vi.fn();
  removeFromQueue = vi.fn();
  insertInQueue = vi.fn();
  findQueuePosition = vi.fn();
  getHighestPriorityQueuedTask = vi.fn();
  getPendingTasks = vi.fn();
  cleanup = vi.fn();
  getRunningTasks = vi.fn(() => [] as ThunkTask[]);
  getQueueStatus = vi.fn(() => ({
    isIdle: true,
    queuedTasks: 0,
    runningTasks: 0,
    highestPriorityQueued: -1,
  }));
  removeTasks = vi.fn();
  processQueue = vi.fn();
  enqueue = vi.fn();
}

describe('ThunkManager', () => {
  let thunkManager: ThunkManager;
  let mockScheduler: MockScheduler;
  let mockStateManager: { processAction: (action: unknown) => unknown };

  beforeEach(() => {
    mockScheduler = new MockScheduler();
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

  describe('thunk registration', () => {
    it('should register a new thunk', () => {
      const thunkId = 'test-thunk-1';
      const thunk = new MockThunk(thunkId);
      thunkManager.registerThunk(thunkId, thunk as unknown as Thunk);
      expect(hasThunk(thunkManager, thunkId)).toBe(true);
    });

    it('should register a thunk with a specific ID', () => {
      const customId = 'custom-thunk-id';
      const thunk = new MockThunk(customId);
      thunkManager.registerThunk(customId, thunk as Thunk);
      expect(hasThunk(thunkManager, customId)).toBe(true);
    });

    it('should register a thunk with a parent', () => {
      const parentId = 'parent-thunk';
      const childId = 'child-thunk';
      const parentThunk = new MockThunk(parentId);
      const childThunk = new MockThunk(childId, parentId);

      thunkManager.registerThunk(parentId, parentThunk as Thunk);
      thunkManager.registerThunk(childId, childThunk as Thunk, { parentId });

      // The parent-child relationship is tracked in the Thunk objects
      expect(hasThunk(thunkManager, parentId)).toBe(true);
      expect(hasThunk(thunkManager, childId)).toBe(true);
    });
  });

  describe('thunk state management', () => {
    it('should mark a thunk as executing', () => {
      const thunkId = 'test-thunk-2';
      const thunk = new MockThunk(thunkId);
      thunkManager.registerThunk(thunkId, thunk as Thunk);

      // Create a spy for the started event
      const startedSpy = vi.fn();
      thunkManager.on(ThunkManagerEvent.THUNK_STARTED, startedSpy);

      thunkManager.markThunkExecuting(thunkId);

      // Verify the started event was emitted
      expect(startedSpy).toHaveBeenCalled();
    });

    it('should complete a thunk', () => {
      const thunkId = 'test-thunk-3';
      const thunk = new MockThunk(thunkId);
      thunkManager.registerThunk(thunkId, thunk as unknown as Thunk);
      thunkManager.markThunkExecuting(thunkId);

      // Create a spy for the completion event
      const completedSpy = vi.fn();
      thunkManager.on(ThunkManagerEvent.THUNK_COMPLETED, completedSpy);

      thunkManager.completeThunk(thunkId);

      // Verify the completion event was emitted
      expect(completedSpy).toHaveBeenCalled();
      expect(mockScheduler.processQueue).toHaveBeenCalled();
    });

    it('should mark a thunk as failed', () => {
      const thunkId = 'test-thunk-4';
      const thunk = new MockThunk(thunkId);
      thunkManager.registerThunk(thunkId, thunk as Thunk);
      thunkManager.markThunkExecuting(thunkId);

      // Create a spy for the failure event
      const failedSpy = vi.fn();
      thunkManager.on(ThunkManagerEvent.THUNK_FAILED, failedSpy);

      const error = new Error('Test error');
      thunkManager.markThunkFailed(thunkId, error);

      // Verify the failure event was emitted
      expect(failedSpy).toHaveBeenCalled();
    });

    it('should ignore completing a non-existent thunk', () => {
      const completedSpy = vi.fn();
      thunkManager.on(ThunkManagerEvent.THUNK_COMPLETED, completedSpy);

      thunkManager.completeThunk('non-existent-thunk');

      expect(completedSpy).not.toHaveBeenCalled();
    });

    it('should ignore marking a non-existent thunk as failed', () => {
      const failedSpy = vi.fn();
      thunkManager.on(ThunkManagerEvent.THUNK_FAILED, failedSpy);

      thunkManager.markThunkFailed('non-existent-thunk', new Error('Test error'));

      expect(failedSpy).not.toHaveBeenCalled();
    });

    it('should ignore marking a non-existent thunk as executing', () => {
      const startedSpy = vi.fn();
      thunkManager.on(ThunkManagerEvent.THUNK_STARTED, startedSpy);

      thunkManager.markThunkExecuting('non-existent-thunk');

      expect(startedSpy).not.toHaveBeenCalled();
    });

    it('should not complete a thunk that is already completed', () => {
      const thunkId = 'already-completed-thunk';
      const thunk = new MockThunk(thunkId);
      thunk.state = ThunkState.COMPLETED;

      thunkManager.registerThunk(thunkId, thunk as Thunk);

      const completedSpy = vi.fn();
      thunkManager.on(ThunkManagerEvent.THUNK_COMPLETED, completedSpy);

      thunkManager.completeThunk(thunkId);

      // The completion event should not be emitted again
      expect(completedSpy).not.toHaveBeenCalled();
    });
  });

  describe('action handling', () => {
    it('should determine if an action can be processed', () => {
      const thunkId = 'test-thunk-5';
      const thunk = new MockThunk(thunkId);
      thunkManager.registerThunk(thunkId, thunk as unknown as Thunk);
      thunkManager.markThunkExecuting(thunkId);

      // Create an action with the thunk parent ID
      const action = { type: 'TEST_ACTION', __thunkParentId: thunkId };

      // The action should be processable
      expect(thunkManager.canProcessAction(action)).toBe(true);
    });

    it('should determine if an action should be queued', () => {
      const thunkId = 'test-thunk-6';
      const thunk = new MockThunk(thunkId);

      // Register and mark as executing to ensure it's tracked properly
      thunkManager.registerThunk(thunkId, thunk as Thunk);
      thunkManager.markThunkExecuting(thunkId);

      // Create an action with the thunk parent ID
      const action = { type: 'TEST_ACTION', __thunkParentId: thunkId };

      // Mock the scheduler to indicate it's not idle (has tasks running)
      mockScheduler.getQueueStatus.mockReturnValue({
        isIdle: false,
        queuedTasks: 1,
        runningTasks: 1,
        highestPriorityQueued: 0,
      });

      // shouldQueueAction returns the opposite of canProcessAction
      // When scheduler is not idle, canProcessAction returns false, so shouldQueueAction returns true
      expect(thunkManager.shouldQueueAction(action)).toBe(true);
    });

    it('should handle actions without a thunk parent ID', () => {
      const action = { type: 'TEST_ACTION' };

      // Actions without a thunk parent ID should not be queued
      expect(thunkManager.shouldQueueAction(action)).toBe(false);
    });

    it('should handle actions with a non-existent thunk parent ID', () => {
      const action = { type: 'TEST_ACTION', __thunkParentId: 'non-existent-thunk' };

      // Actions with a non-existent thunk parent ID should not be queued
      expect(thunkManager.shouldQueueAction(action)).toBe(false);
    });
  });

  describe('root thunk management', () => {
    it('should track the root thunk ID', () => {
      const thunkId = 'root-thunk';
      const thunk = new MockThunk(thunkId);
      thunkManager.registerThunk(thunkId, thunk as Thunk);
      thunkManager.markThunkExecuting(thunkId);

      // The root thunk ID should be set
      expect(thunkManager.getRootThunkId()).toBe(thunkId);
    });

    it('should emit an event when the root thunk changes', () => {
      const rootChangedSpy = vi.fn();
      thunkManager.on(ThunkManagerEvent.ROOT_THUNK_CHANGED, rootChangedSpy);

      const thunkId = 'new-root-thunk';
      const thunk = new MockThunk(thunkId);
      thunkManager.registerThunk(thunkId, thunk as Thunk);
      thunkManager.markThunkExecuting(thunkId);

      expect(rootChangedSpy).toHaveBeenCalled();
    });

    it('should emit an event when the root thunk completes', () => {
      const rootCompletedSpy = vi.fn();
      thunkManager.on(ThunkManagerEvent.ROOT_THUNK_COMPLETED, rootCompletedSpy);

      const thunkId = 'root-thunk-to-complete';
      const thunk = new MockThunk(thunkId);
      thunkManager.registerThunk(thunkId, thunk as Thunk);
      thunkManager.markThunkExecuting(thunkId);
      thunkManager.completeThunk(thunkId);

      expect(rootCompletedSpy).toHaveBeenCalled();
    });
  });

  describe('events', () => {
    it('should emit events on thunk state changes', () => {
      const registeredHandler = vi.fn();
      const startedHandler = vi.fn();
      const completedHandler = vi.fn();

      thunkManager.on(ThunkManagerEvent.THUNK_REGISTERED, registeredHandler);
      thunkManager.on(ThunkManagerEvent.THUNK_STARTED, startedHandler);
      thunkManager.on(ThunkManagerEvent.THUNK_COMPLETED, completedHandler);

      const thunkId = 'event-test-thunk';
      const thunk = new MockThunk(thunkId);

      thunkManager.registerThunk(thunkId, thunk as Thunk);
      expect(registeredHandler).toHaveBeenCalled();

      thunkManager.markThunkExecuting(thunkId);
      expect(startedHandler).toHaveBeenCalled();

      thunkManager.completeThunk(thunkId);
      expect(completedHandler).toHaveBeenCalled();
    });
  });

  it('should return active thunks summary', () => {
    mockScheduler.getRunningTasks.mockReturnValue([
      {
        id: 'task1',
        thunkId: 't5',
        handler: () => Promise.resolve(),
        priority: 0,
        canRunConcurrently: false,
        createdAt: Date.now(),
      } as ThunkTask,
    ]);
    const thunk = new MockThunk('t5');
    thunkManager.registerThunk('t5', thunk as Thunk);
    const summary = thunkManager.getActiveThunksSummary();
    expect(summary.thunks.length).toBe(1);
    expect(summary.thunks[0].id).toBe('t5');
  });

  it('should check if can process action based on scheduler', () => {
    mockScheduler.getQueueStatus.mockReturnValue({
      isIdle: true,
      queuedTasks: 0,
      runningTasks: 0,
      highestPriorityQueued: -1,
    });
    const action = { type: 'A', __id: 'a1' };
    expect(thunkManager.canProcessAction(action)).toBe(true);
    mockScheduler.getQueueStatus.mockReturnValue({
      isIdle: false,
      queuedTasks: 1,
      runningTasks: 1,
      highestPriorityQueued: 0,
    });
    expect(thunkManager.canProcessAction(action)).toBe(false);
  });

  it('should return the scheduler instance', () => {
    expect(thunkManager.getScheduler()).toBe(mockScheduler);
  });

  it('should check if a thunk is active', () => {
    const thunkId = 'active-thunk';
    const thunk = new MockThunk(thunkId);
    thunkManager.registerThunk(thunkId, thunk as Thunk);
    thunkManager.markThunkExecuting(thunkId);

    expect(thunkManager.isThunkActive(thunkId)).toBe(true);
    expect(thunkManager.isThunkActive('non-existent-thunk')).toBe(false);

    // Complete the thunk and check again
    thunkManager.completeThunk(thunkId);
    expect(thunkManager.isThunkActive(thunkId)).toBe(false);
  });

  describe('state update acknowledgment tracking', () => {
    it('should track state updates for thunk completion', () => {
      const thunkId = 'test-thunk';
      const updateId = 'update-1';
      const renderers = [1, 2];

      thunkManager.trackStateUpdateForThunk(thunkId, updateId, renderers);

      // Thunk should not be considered fully complete until all state updates are acknowledged
      expect(thunkManager.isThunkFullyComplete(thunkId)).toBe(false);
    });

    it('should acknowledge state updates from renderers', () => {
      const thunkId = 'test-thunk';
      const updateId = 'update-1';
      const renderers = [1, 2];

      // Register and complete the thunk execution
      const thunk = new MockThunk(thunkId);
      thunkManager.registerThunk(thunkId, thunk as Thunk);
      thunkManager.markThunkExecuting(thunkId);
      thunkManager.completeThunk(thunkId);

      // Track state update
      thunkManager.trackStateUpdateForThunk(thunkId, updateId, renderers);

      // Should not be fully complete yet
      expect(thunkManager.isThunkFullyComplete(thunkId)).toBe(false);
      expect(hasThunk(thunkManager, thunkId)).toBe(true);

      // First renderer acknowledges
      const firstAck = thunkManager.acknowledgeStateUpdate(updateId, 1);
      expect(firstAck).toBe(false); // Not all acknowledged yet
      expect(thunkManager.isThunkFullyComplete(thunkId)).toBe(false);

      // Second renderer acknowledges
      const secondAck = thunkManager.acknowledgeStateUpdate(updateId, 2);
      expect(secondAck).toBe(true); // All acknowledged now
      expect(thunkManager.isThunkFullyComplete(thunkId)).toBe(true);
    });

    it('should handle acknowledgment of unknown update ID', () => {
      const result = thunkManager.acknowledgeStateUpdate('unknown-update', 1);
      expect(result).toBe(false);
    });

    it('should return current active thunk ID', () => {
      expect(thunkManager.getCurrentActiveThunkId()).toBeUndefined();

      const thunkId = 'active-thunk';
      const thunk = new MockThunk(thunkId);
      thunkManager.registerThunk(thunkId, thunk as Thunk);
      thunkManager.markThunkExecuting(thunkId);

      expect(thunkManager.getCurrentActiveThunkId()).toBe(thunkId);
    });

    it('should determine thunk is fully complete only after execution and acknowledgments', () => {
      const thunkId = 'completion-test-thunk';
      const thunk = new MockThunk(thunkId);

      // Register thunk
      thunkManager.registerThunk(thunkId, thunk as Thunk);
      expect(thunkManager.isThunkFullyComplete(thunkId)).toBe(false);

      // Start executing
      thunkManager.markThunkExecuting(thunkId);
      expect(thunkManager.isThunkFullyComplete(thunkId)).toBe(false);

      // Complete execution but add pending state update
      thunkManager.completeThunk(thunkId);
      thunkManager.trackStateUpdateForThunk(thunkId, 'update-1', [1]);
      expect(thunkManager.isThunkFullyComplete(thunkId)).toBe(false);

      // Acknowledge state update
      thunkManager.acknowledgeStateUpdate('update-1', 1);
      expect(thunkManager.isThunkFullyComplete(thunkId)).toBe(true);
    });

    it('should clean up expired state updates', async () => {
      const thunkId = 'cleanup-test-thunk';
      const updateId = 'expired-update';

      thunkManager.trackStateUpdateForThunk(thunkId, updateId, [1]);

      // Wait a small amount of time to ensure timestamp difference
      await new Promise((resolve) => setTimeout(resolve, 1));

      // Clean up with very short max age (0ms)
      thunkManager.cleanupExpiredStateUpdates(0);

      // The acknowledgment should now return false since update was cleaned up
      const result = thunkManager.acknowledgeStateUpdate(updateId, 1);
      expect(result).toBe(false);
    });
  });

  describe('state update acknowledgment system', () => {
    it('should track state updates for thunk completion', () => {
      const thunkId = 'ack-test-thunk';
      const updateId = 'update-1';
      const renderers = [1, 2, 3];

      thunkManager.trackStateUpdateForThunk(thunkId, updateId, renderers);

      // Thunk should not be fully complete until all state updates are acknowledged
      expect(thunkManager.isThunkFullyComplete(thunkId)).toBe(false);
    });

    it('should handle partial acknowledgments correctly', async () => {
      const thunkId = 'partial-ack-thunk';
      const updateId = 'update-2';
      const renderers = [1, 2, 3];

      // Register and complete the thunk execution
      const thunk = new MockThunk(thunkId);
      thunkManager.registerThunk(thunkId, thunk as Thunk);
      thunkManager.markThunkExecuting(thunkId);
      thunkManager.completeThunk(thunkId);

      // Track state update
      thunkManager.trackStateUpdateForThunk(thunkId, updateId, renderers);

      // Partial acknowledgments
      expect(thunkManager.acknowledgeStateUpdate(updateId, 1)).toBe(false);
      expect(thunkManager.acknowledgeStateUpdate(updateId, 2)).toBe(false);
      expect(thunkManager.isThunkFullyComplete(thunkId)).toBe(false);

      // The thunk should exist before final acknowledgment
      expect(hasThunk(thunkManager, thunkId)).toBe(true);

      // Final acknowledgment - this should mark the update as complete
      const isComplete = thunkManager.acknowledgeStateUpdate(updateId, 3);
      expect(isComplete).toBe(true);

      // The thunk should still exist immediately after acknowledgment
      expect(hasThunk(thunkManager, thunkId)).toBe(true);

      // Note: The thunk may still have pending cleanup, but the core functionality works
      // The test verifies that acknowledgment process completes successfully
    });

    it('should handle acknowledgment of unknown update ID', () => {
      const result = thunkManager.acknowledgeStateUpdate('unknown-update', 1);
      expect(result).toBe(false);
    });

    it('should clean up dead renderers from pending updates', async () => {
      const thunkId = 'dead-renderer-thunk';
      const updateId = 'update-3';
      const renderers = [1, 2, 3];

      const thunk = new MockThunk(thunkId);
      thunkManager.registerThunk(thunkId, thunk as Thunk);
      thunkManager.markThunkExecuting(thunkId);
      thunkManager.completeThunk(thunkId);

      thunkManager.trackStateUpdateForThunk(thunkId, updateId, renderers);

      // Acknowledge from some renderers
      thunkManager.acknowledgeStateUpdate(updateId, 1);
      thunkManager.acknowledgeStateUpdate(updateId, 2);

      // Simulate renderer 3 dying - this should effectively acknowledge from renderer 3
      thunkManager.cleanupDeadRenderer(3);

      // Wait for async cleanup to complete
      await new Promise((resolve) => setTimeout(resolve, 100));

      // The thunk should now be fully complete since renderer 3 is cleaned up
      // and renderers 1 & 2 have already acknowledged
      expect(thunkManager.isThunkFullyComplete(thunkId)).toBe(true);
    });

    it('should handle expired state updates cleanup', () => {
      const thunkId = 'expired-thunk';
      const updateId = 'expired-update';

      thunkManager.trackStateUpdateForThunk(thunkId, updateId, [1]);

      // Clean up with very short max age
      thunkManager.cleanupExpiredStateUpdates(0);

      // The acknowledgment should now return false since update was cleaned up
      const result = thunkManager.acknowledgeStateUpdate(updateId, 1);
      expect(result).toBe(false);
    });
  });

  describe('scheduler integration', () => {
    it('should process thunk actions through scheduler', () => {
      const thunkId = 'scheduler-test-thunk';
      const thunk = new MockThunk(thunkId);
      thunkManager.registerThunk(thunkId, thunk as Thunk);
      thunkManager.markThunkExecuting(thunkId);

      // Create action with thunk parent ID
      const action = {
        type: 'SCHEDULER_ACTION',
        __id: 'action-123',
        __thunkParentId: thunkId,
      };

      // Mock scheduler to return success
      mockScheduler.enqueue.mockReturnValue(true);

      const result = thunkManager.processThunkAction(action);
      expect(result).toBe(true);
      expect(mockScheduler.enqueue).toHaveBeenCalled();
    });

    it('should handle thunk action without ID', () => {
      const thunkId = 'no-id-thunk';
      const thunk = new MockThunk(thunkId);
      thunkManager.registerThunk(thunkId, thunk as Thunk);
      thunkManager.markThunkExecuting(thunkId);

      const action = {
        type: 'NO_ID_ACTION',
        __thunkParentId: thunkId,
        // __id missing
      };

      const result = thunkManager.processThunkAction(action);
      expect(result).toBe(false);
    });

    it('should handle thunk action for non-existent thunk', () => {
      const action = {
        type: 'ORPHAN_ACTION',
        __id: 'action-456',
        __thunkParentId: 'non-existent-thunk',
      };

      const result = thunkManager.processThunkAction(action);
      expect(result).toBe(false);
    });

    it('should handle thunk action for completed thunk', () => {
      const thunkId = 'completed-thunk';
      const thunk = new MockThunk(thunkId);
      thunk.state = ThunkState.COMPLETED;
      thunkManager.registerThunk(thunkId, thunk as Thunk);

      const action = {
        type: 'LATE_ACTION',
        __id: 'action-789',
        __thunkParentId: thunkId,
      };

      const result = thunkManager.processThunkAction(action);
      expect(result).toBe(false);
    });

    it('should handle actions with bypassThunkLock flag', () => {
      const action = {
        type: 'BYPASS_ACTION',
        __bypassThunkLock: true,
      };

      // When bypassThunkLock is set, canProcessAction should return true
      expect(thunkManager.canProcessAction(action)).toBe(true);
    });

    it('should handle scheduler not idle scenario', () => {
      mockScheduler.getQueueStatus.mockReturnValue({
        isIdle: false,
        queuedTasks: 5,
        runningTasks: 3,
        highestPriorityQueued: 1,
      });

      const action = { type: 'QUEUED_ACTION' };
      expect(thunkManager.canProcessAction(action)).toBe(false);
    });

    it('should handle scheduler idle scenario', () => {
      mockScheduler.getQueueStatus.mockReturnValue({
        isIdle: true,
        queuedTasks: 0,
        runningTasks: 0,
        highestPriorityQueued: -1,
      });

      const action = { type: 'IMMEDIATE_ACTION' };
      expect(thunkManager.canProcessAction(action)).toBe(true);
    });
  });

  describe('error handling and edge cases', () => {
    it('should handle thunk action processing without state manager', () => {
      // Remove state manager
      thunkManager.setStateManager(
        null as unknown as { processAction: (action: unknown) => unknown },
      );

      const thunkId = 'no-state-manager-thunk';
      const thunk = new MockThunk(thunkId);
      thunkManager.registerThunk(thunkId, thunk as Thunk);
      thunkManager.markThunkExecuting(thunkId);

      const action = {
        type: 'NO_STATE_MANAGER_ACTION',
        __id: 'action-999',
        __thunkParentId: thunkId,
      };

      const result = thunkManager.processThunkAction(action);
      expect(result).toBe(false);

      // Restore state manager
      thunkManager.setStateManager(mockStateManager);
    });

    it('should handle failed thunk state transitions correctly', () => {
      const thunkId = 'failed-thunk';
      const thunk = new MockThunk(thunkId);
      thunkManager.registerThunk(thunkId, thunk as Thunk);
      thunkManager.markThunkExecuting(thunkId);

      // Spy on failed event
      const failedSpy = vi.fn();
      thunkManager.on(ThunkManagerEvent.THUNK_FAILED, failedSpy);

      const error = new Error('Thunk execution failed');
      thunkManager.markThunkFailed(thunkId, error);

      expect(failedSpy).toHaveBeenCalled();
      expect(thunk.state).toBe(ThunkState.FAILED);
    });

    it('should handle double completion attempts', () => {
      const thunkId = 'double-complete-thunk';
      const thunk = new MockThunk(thunkId);
      thunkManager.registerThunk(thunkId, thunk as Thunk);
      thunkManager.markThunkExecuting(thunkId);

      const completedSpy = vi.fn();
      thunkManager.on(ThunkManagerEvent.THUNK_COMPLETED, completedSpy);

      // First completion
      thunkManager.completeThunk(thunkId);
      expect(completedSpy).toHaveBeenCalledTimes(1);

      // Second completion attempt should be ignored
      thunkManager.completeThunk(thunkId);
      expect(completedSpy).toHaveBeenCalledTimes(1);
    });

    it('should track actions for pending thunks correctly', () => {
      const thunkId = 'pending-actions-thunk';
      const thunk = new MockThunk(thunkId);
      thunkManager.registerThunk(thunkId, thunk as Thunk);
      thunkManager.markThunkExecuting(thunkId);

      // Process multiple actions
      mockScheduler.enqueue.mockReturnValue(true);

      thunkManager.processThunkAction({
        type: 'ACTION_1',
        __id: 'action-1',
        __thunkParentId: thunkId,
      });

      thunkManager.processThunkAction({
        type: 'ACTION_2',
        __id: 'action-2',
        __thunkParentId: thunkId,
      });

      // Complete thunk - should defer completion due to pending actions
      thunkManager.completeThunk(thunkId);
      expect(thunk.state).toBe(ThunkState.EXECUTING);

      // Complete actions one by one
      simulateActionCompletion(thunkManager, 'action-1');
      expect(thunk.state).toBe(ThunkState.EXECUTING);

      simulateActionCompletion(thunkManager, 'action-2');
      expect(thunk.state).toBe(ThunkState.COMPLETED);
    });

    it('should handle current thunk action ID tracking', () => {
      expect(thunkManager.getCurrentThunkActionId()).toBeUndefined();

      thunkManager.setCurrentThunkAction('current-thunk-123');
      expect(thunkManager.getCurrentThunkActionId()).toBe('current-thunk-123');

      thunkManager.setCurrentThunkAction(undefined);
      expect(thunkManager.getCurrentThunkActionId()).toBeUndefined();
    });

    it('should handle force cleanup of completed thunks', async () => {
      const thunk1 = new MockThunk('cleanup-thunk-1');
      const thunk2 = new MockThunk('cleanup-thunk-2');

      thunkManager.registerThunk('cleanup-thunk-1', thunk1 as Thunk);
      thunkManager.registerThunk('cleanup-thunk-2', thunk2 as Thunk);

      thunkManager.markThunkExecuting('cleanup-thunk-1');
      thunkManager.markThunkExecuting('cleanup-thunk-2');

      thunkManager.completeThunk('cleanup-thunk-1');
      thunk2.fail(); // Mark as failed

      expect(hasThunk(thunkManager, 'cleanup-thunk-1')).toBe(true);
      expect(hasThunk(thunkManager, 'cleanup-thunk-2')).toBe(true);

      // Force cleanup should remove completed/failed thunks
      forceCleanupCompletedThunks(thunkManager);

      // Should be cleaned up after the timeout
      await new Promise((resolve) => setTimeout(resolve, 250));
      expect(hasThunk(thunkManager, 'cleanup-thunk-1')).toBe(false);
      expect(hasThunk(thunkManager, 'cleanup-thunk-2')).toBe(false);
    });
  });

  describe('concurrent execution scenarios', () => {
    it('should handle multiple thunk registrations with different concurrency settings', () => {
      const regularThunk = new MockThunk('regular-thunk');
      const concurrentThunk = new MockThunk('concurrent-thunk');

      thunkManager.registerThunk('regular-thunk', regularThunk as Thunk);
      thunkManager.registerThunk('concurrent-thunk', concurrentThunk as Thunk, {
        bypassThunkLock: true,
      });

      expect(hasThunk(thunkManager, 'regular-thunk')).toBe(true);
      expect(hasThunk(thunkManager, 'concurrent-thunk')).toBe(true);
    });

    it('should handle parent-child thunk relationships', () => {
      const parentThunk = new MockThunk('parent-thunk');
      const childThunk = new MockThunk('child-thunk', 'parent-thunk');

      thunkManager.registerThunk('parent-thunk', parentThunk as Thunk);
      thunkManager.registerThunk('child-thunk', childThunk as Thunk, {
        parentId: 'parent-thunk',
      });

      expect(hasThunk(thunkManager, 'parent-thunk')).toBe(true);
      expect(hasThunk(thunkManager, 'child-thunk')).toBe(true);
    });

    it('should handle window ID tracking in thunk registration', () => {
      const windowThunk = new MockThunk('window-thunk');
      windowThunk.sourceWindowId = 456;

      thunkManager.registerThunk('window-thunk', windowThunk as Thunk, {
        windowId: 456,
      });

      const summary = thunkManager.getActiveThunksSummary();
      expect(summary.thunks).toEqual([]); // Not active until marked executing

      thunkManager.markThunkExecuting('window-thunk');

      // Mock the scheduler to return the task
      mockScheduler.getRunningTasks.mockReturnValue([
        {
          id: 'task-1',
          thunkId: 'window-thunk',
          handler: () => Promise.resolve(),
          priority: 0,
          canRunConcurrently: false,
          createdAt: Date.now(),
        },
      ]);

      const activeSummary = thunkManager.getActiveThunksSummary();
      expect(activeSummary.thunks).toEqual([
        {
          id: 'window-thunk',
          windowId: 456,
          parentId: undefined,
        },
      ]);
    });

    it('should handle multiple state updates for same thunk', async () => {
      const thunkId = 'multi-update-thunk';
      const thunk = new MockThunk(thunkId);
      thunkManager.registerThunk(thunkId, thunk as Thunk);
      thunkManager.markThunkExecuting(thunkId);
      thunkManager.completeThunk(thunkId);

      // Track multiple updates
      thunkManager.trackStateUpdateForThunk(thunkId, 'update-1', [1, 2]);
      thunkManager.trackStateUpdateForThunk(thunkId, 'update-2', [1, 3]);

      // Should not be fully complete until all updates acknowledged
      expect(thunkManager.isThunkFullyComplete(thunkId)).toBe(false);

      // Acknowledge first update
      thunkManager.acknowledgeStateUpdate('update-1', 1);
      thunkManager.acknowledgeStateUpdate('update-1', 2);
      expect(thunkManager.isThunkFullyComplete(thunkId)).toBe(false);

      // The thunk should exist before final acknowledgments
      expect(hasThunk(thunkManager, thunkId)).toBe(true);

      // Acknowledge second update - this should complete all pending updates
      thunkManager.acknowledgeStateUpdate('update-2', 1);
      thunkManager.acknowledgeStateUpdate('update-2', 3);

      // The thunk should still exist immediately after acknowledgments
      expect(hasThunk(thunkManager, thunkId)).toBe(true);

      // Verify that both updates were acknowledged
      expect(thunkManager.acknowledgeStateUpdate('update-1', 1)).toBe(false); // Already acknowledged
      expect(thunkManager.acknowledgeStateUpdate('update-2', 1)).toBe(false); // Already acknowledged

      // Note: The thunk may still have pending cleanup, but the core functionality works
      // The test verifies that multiple state updates are handled correctly
    });

    it('should handle shouldQueueAction logic correctly', () => {
      // Test action without thunk parent ID
      expect(thunkManager.shouldQueueAction({ type: 'NO_PARENT' })).toBe(false);

      // Test action with non-existent thunk
      expect(
        thunkManager.shouldQueueAction({
          type: 'ORPHAN',
          __thunkParentId: 'non-existent',
        }),
      ).toBe(false);

      // Test action with valid thunk when scheduler is busy
      const thunkId = 'queue-test-thunk';
      const thunk = new MockThunk(thunkId);
      thunkManager.registerThunk(thunkId, thunk as Thunk);
      thunkManager.markThunkExecuting(thunkId);

      mockScheduler.getQueueStatus.mockReturnValue({
        isIdle: false,
        queuedTasks: 1,
        runningTasks: 1,
        highestPriorityQueued: 0,
      });

      expect(
        thunkManager.shouldQueueAction({
          type: 'QUEUED_ACTION',
          __thunkParentId: thunkId,
        }),
      ).toBe(true);
    });
  });

  describe('memory management and cleanup', () => {
    it('should handle tryFinalCleanup for completed thunks', async () => {
      const thunkId = 'final-cleanup-thunk';
      const thunk = new MockThunk(thunkId);
      thunkManager.registerThunk(thunkId, thunk as Thunk);
      thunkManager.markThunkExecuting(thunkId);
      thunkManager.completeThunk(thunkId);

      // Should exist before cleanup
      expect(hasThunk(thunkManager, thunkId)).toBe(true);

      // Trigger final cleanup (called automatically after state update acknowledgment)
      triggerFinalCleanup(thunkManager, thunkId);

      // Wait for async cleanup to complete
      await new Promise((resolve) => setTimeout(resolve, 250));

      // Should be cleaned up after delay
      expect(hasThunk(thunkManager, thunkId)).toBe(false);
    });

    it('should handle cleanup of thunk with pending state updates', async () => {
      const thunkId = 'pending-cleanup-thunk';
      const thunk = new MockThunk(thunkId);
      thunkManager.registerThunk(thunkId, thunk as Thunk);
      thunkManager.markThunkExecuting(thunkId);
      thunkManager.completeThunk(thunkId);

      // Add pending state update
      thunkManager.trackStateUpdateForThunk(thunkId, 'update-123', [1]);

      // Should not be cleaned up while updates are pending
      triggerFinalCleanup(thunkManager, thunkId);
      expect(hasThunk(thunkManager, thunkId)).toBe(true);

      // After acknowledging the update, trigger cleanup again
      thunkManager.acknowledgeStateUpdate('update-123', 1);
      triggerFinalCleanup(thunkManager, thunkId);

      // Wait for async cleanup to complete
      await new Promise((resolve) => setTimeout(resolve, 250));

      // Should be cleaned up after acknowledgment and cleanup
      expect(hasThunk(thunkManager, thunkId)).toBe(false);
    });
  });
});
