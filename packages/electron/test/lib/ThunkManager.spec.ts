import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ThunkState } from '../../src/lib/Thunk.js';
import { ThunkManager, ThunkManagerEvent } from '../../src/lib/ThunkManager.js';
import type { ThunkScheduler as IThunkScheduler, ThunkTask } from '../../src/types/thunk';

// Minimal mock Thunk class
class MockThunk {
  id: string;
  state: ThunkState = ThunkState.PENDING;
  parentId?: string;
  sourceWindowId: number = 1;
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

// Minimal mock ThunkScheduler
class MockScheduler implements IThunkScheduler {
  getRunningTasks = vi.fn(() => [] as ThunkTask[]);
  getQueueStatus = vi.fn(() => ({ isIdle: true, queuedTasks: 0, runningTasks: 0, highestPriorityQueued: -1 }));
  removeTasks = vi.fn();
  processQueue = vi.fn();
  enqueue = vi.fn();
}

describe('ThunkManager', () => {
  let thunkManager: ThunkManager;
  let mockScheduler: MockScheduler;
  let mockStateManager: any;

  beforeEach(() => {
    mockScheduler = new MockScheduler();
    mockStateManager = {
      processAction: vi.fn().mockReturnValue({ counter: 0 }),
    };

    thunkManager = new ThunkManager(mockScheduler as any);
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
      thunkManager.registerThunk(thunkId, thunk as any);
      expect(thunkManager.hasThunk(thunkId)).toBe(true);
    });

    it('should register a thunk with a specific ID', () => {
      const customId = 'custom-thunk-id';
      const thunk = new MockThunk(customId);
      thunkManager.registerThunk(customId, thunk as any);
      expect(thunkManager.hasThunk(customId)).toBe(true);
    });

    it('should register a thunk with a parent', () => {
      const parentId = 'parent-thunk';
      const childId = 'child-thunk';
      const parentThunk = new MockThunk(parentId);
      const childThunk = new MockThunk(childId, parentId);

      thunkManager.registerThunk(parentId, parentThunk as any);
      thunkManager.registerThunk(childId, childThunk as any, { parentId });

      // The parent-child relationship is tracked in the Thunk objects
      expect(thunkManager.hasThunk(parentId)).toBe(true);
      expect(thunkManager.hasThunk(childId)).toBe(true);
    });
  });

  describe('thunk state management', () => {
    it('should mark a thunk as executing', () => {
      const thunkId = 'test-thunk-2';
      const thunk = new MockThunk(thunkId);
      thunkManager.registerThunk(thunkId, thunk as any);

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
      thunkManager.registerThunk(thunkId, thunk as any);
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
      thunkManager.registerThunk(thunkId, thunk as any);
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

      thunkManager.registerThunk(thunkId, thunk as any);

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
      thunkManager.registerThunk(thunkId, thunk as any);
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
      thunkManager.registerThunk(thunkId, thunk as any);
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
      thunkManager.registerThunk(thunkId, thunk as any);
      thunkManager.markThunkExecuting(thunkId);

      // The root thunk ID should be set
      expect(thunkManager.getRootThunkId()).toBe(thunkId);
    });

    it('should emit an event when the root thunk changes', () => {
      const rootChangedSpy = vi.fn();
      thunkManager.on(ThunkManagerEvent.ROOT_THUNK_CHANGED, rootChangedSpy);

      const thunkId = 'new-root-thunk';
      const thunk = new MockThunk(thunkId);
      thunkManager.registerThunk(thunkId, thunk as any);
      thunkManager.markThunkExecuting(thunkId);

      expect(rootChangedSpy).toHaveBeenCalled();
    });

    it('should emit an event when the root thunk completes', () => {
      const rootCompletedSpy = vi.fn();
      thunkManager.on(ThunkManagerEvent.ROOT_THUNK_COMPLETED, rootCompletedSpy);

      const thunkId = 'root-thunk-to-complete';
      const thunk = new MockThunk(thunkId);
      thunkManager.registerThunk(thunkId, thunk as any);
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

      thunkManager.registerThunk(thunkId, thunk as any);
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
    thunkManager.registerThunk('t5', thunk as any);
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
    thunkManager.registerThunk(thunkId, thunk as any);
    thunkManager.markThunkExecuting(thunkId);

    expect(thunkManager.isThunkActive(thunkId)).toBe(true);
    expect(thunkManager.isThunkActive('non-existent-thunk')).toBe(false);

    // Complete the thunk and check again
    thunkManager.completeThunk(thunkId);
    expect(thunkManager.isThunkActive(thunkId)).toBe(false);
  });
});
