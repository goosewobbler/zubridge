import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ThunkPriority, ThunkSchedulerEvents } from '../../../src/constants.js';
import { ThunkScheduler } from '../../../src/thunk/scheduling/ThunkScheduler.js';
import type { ThunkTask } from '../../../src/types/thunk.js';

describe('ThunkScheduler', () => {
  let scheduler: ThunkScheduler;

  beforeEach(() => {
    scheduler = new ThunkScheduler();
    vi.clearAllMocks();
  });

  const createMockTask = (overrides: Partial<ThunkTask> = {}): ThunkTask => ({
    id: 'task-1',
    thunkId: 'thunk-1',
    handler: vi.fn().mockResolvedValue(undefined),
    priority: ThunkPriority.NORMAL,
    canRunConcurrently: false,
    createdAt: Date.now(),
    ...overrides,
  });

  describe('enqueue', () => {
    it('should enqueue a task', async () => {
      const task = createMockTask({
        handler: vi
          .fn()
          .mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 50))),
      });

      scheduler.enqueue(task);

      // Check status immediately after enqueue (task should be running, not queued)
      const statusDuringExecution = scheduler.getQueueStatus();
      expect(statusDuringExecution.isIdle).toBe(false);

      // Wait for task completion
      await new Promise((resolve) => setTimeout(resolve, 70));

      const statusAfterCompletion = scheduler.getQueueStatus();
      expect(statusAfterCompletion.isIdle).toBe(true);
    });

    it('should enqueue multiple tasks in priority order', async () => {
      // Create tasks that block to allow queuing
      const lowPriorityTask = createMockTask({
        id: 'low-task',
        priority: ThunkPriority.LOW,
        canRunConcurrently: false,
        handler: vi
          .fn()
          .mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 100))),
      });
      const highPriorityTask = createMockTask({
        id: 'high-task',
        thunkId: 'thunk-2',
        priority: ThunkPriority.HIGH,
        canRunConcurrently: false,
        handler: vi.fn().mockResolvedValue(undefined),
      });
      const normalPriorityTask = createMockTask({
        id: 'normal-task',
        thunkId: 'thunk-3',
        priority: ThunkPriority.NORMAL,
        canRunConcurrently: false,
        handler: vi.fn().mockResolvedValue(undefined),
      });

      // Enqueue in random order - first task will start running, others will queue
      scheduler.enqueue(lowPriorityTask); // This will start running
      scheduler.enqueue(normalPriorityTask);
      scheduler.enqueue(highPriorityTask);

      // Check that tasks are queued with correct priority
      const status = scheduler.getQueueStatus();
      expect(status.runningTasks).toBe(1); // low priority task is running
      expect(status.queuedTasks).toBe(2); // other tasks are queued
      expect(status.highestPriorityQueued).toBe(ThunkPriority.HIGH);
    });

    it('should trigger queue processing when task is enqueued', () => {
      const task = createMockTask();
      const processQueueSpy = vi.spyOn(scheduler, 'processQueue');

      scheduler.enqueue(task);

      expect(processQueueSpy).toHaveBeenCalled();
    });
  });

  describe('getQueueStatus', () => {
    it('should return idle status when no tasks', () => {
      const status = scheduler.getQueueStatus();

      expect(status.isIdle).toBe(true);
      expect(status.queuedTasks).toBe(0);
      expect(status.runningTasks).toBe(0);
      expect(status.highestPriorityQueued).toBe(-1);
    });

    it('should return correct status with queued tasks', async () => {
      // Create a blocking task to allow queuing
      const blockingTask = createMockTask({
        id: 'blocking-task',
        priority: ThunkPriority.NORMAL,
        canRunConcurrently: false,
        handler: vi
          .fn()
          .mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 100))),
      });

      const highPriorityTask = createMockTask({
        id: 'high-priority-task',
        thunkId: 'thunk-2',
        priority: ThunkPriority.HIGH,
        canRunConcurrently: false,
      });

      // First task starts running, second gets queued
      scheduler.enqueue(blockingTask);
      scheduler.enqueue(highPriorityTask);

      const status = scheduler.getQueueStatus();

      expect(status.isIdle).toBe(false);
      expect(status.runningTasks).toBe(1); // blocking task is running
      expect(status.queuedTasks).toBe(1); // high priority task is queued
      expect(status.highestPriorityQueued).toBe(ThunkPriority.HIGH);
    });

    it('should return correct status with running tasks', async () => {
      const task = createMockTask({
        handler: vi
          .fn()
          .mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 100))),
      });

      scheduler.enqueue(task);

      // Let the task start running
      await new Promise((resolve) => setTimeout(resolve, 10));

      const status = scheduler.getQueueStatus();

      expect(status.runningTasks).toBe(1);
      expect(status.queuedTasks).toBe(0);
    });
  });

  describe('processQueue', () => {
    it('should process a single task', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      const task = createMockTask({ handler });

      scheduler.enqueue(task);

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(handler).toHaveBeenCalled();
    });

    it('should process tasks in priority order', async () => {
      const executionOrder: string[] = [];

      // Create a blocking task to prevent immediate execution
      const blockingTask = createMockTask({
        id: 'blocking-task',
        priority: ThunkPriority.NORMAL,
        canRunConcurrently: false,
        handler: vi.fn().mockImplementation(async () => {
          executionOrder.push('blocking-task');
          await new Promise((resolve) => setTimeout(resolve, 20));
        }),
      });

      const lowPriorityTask = createMockTask({
        id: 'low-task',
        thunkId: 'thunk-2',
        priority: ThunkPriority.LOW,
        canRunConcurrently: false,
        handler: vi.fn().mockImplementation(async () => {
          executionOrder.push('low-task');
        }),
      });

      const highPriorityTask = createMockTask({
        id: 'high-task',
        thunkId: 'thunk-3',
        priority: ThunkPriority.HIGH,
        canRunConcurrently: false,
        handler: vi.fn().mockImplementation(async () => {
          executionOrder.push('high-task');
        }),
      });

      // Start blocking task, then enqueue others
      scheduler.enqueue(blockingTask);
      scheduler.enqueue(lowPriorityTask);
      scheduler.enqueue(highPriorityTask);

      // Wait for all tasks to complete
      await new Promise((resolve) => setTimeout(resolve, 100));

      // High priority should execute before low priority after blocking task
      expect(executionOrder).toEqual(['blocking-task', 'high-task', 'low-task']);
    });

    it('should handle concurrent tasks', async () => {
      const executionOrder: string[] = [];

      const task1 = createMockTask({
        id: 'concurrent-task-1',
        canRunConcurrently: true,
        handler: vi.fn().mockImplementation(async () => {
          executionOrder.push('start-task-1');
          await new Promise((resolve) => setTimeout(resolve, 20));
          executionOrder.push('end-task-1');
        }),
      });

      const task2 = createMockTask({
        id: 'concurrent-task-2',
        thunkId: 'thunk-2',
        canRunConcurrently: true,
        handler: vi.fn().mockImplementation(async () => {
          executionOrder.push('start-task-2');
          await new Promise((resolve) => setTimeout(resolve, 10));
          executionOrder.push('end-task-2');
        }),
      });

      scheduler.enqueue(task1);
      scheduler.enqueue(task2);

      await new Promise((resolve) => setTimeout(resolve, 50));

      // Both tasks should start before either finishes
      expect(executionOrder).toContain('start-task-1');
      expect(executionOrder).toContain('start-task-2');
      expect(executionOrder.indexOf('start-task-2')).toBeLessThan(
        executionOrder.indexOf('end-task-1'),
      );
    });

    it('should not run conflicting non-concurrent tasks simultaneously', async () => {
      const executionOrder: string[] = [];

      const task1 = createMockTask({
        id: 'non-concurrent-task-1',
        canRunConcurrently: false,
        handler: vi.fn().mockImplementation(async () => {
          executionOrder.push('start-task-1');
          await new Promise((resolve) => setTimeout(resolve, 20));
          executionOrder.push('end-task-1');
        }),
      });

      const task2 = createMockTask({
        id: 'non-concurrent-task-2',
        thunkId: 'thunk-2',
        canRunConcurrently: false,
        handler: vi.fn().mockImplementation(async () => {
          executionOrder.push('start-task-2');
          await new Promise((resolve) => setTimeout(resolve, 10));
          executionOrder.push('end-task-2');
        }),
      });

      scheduler.enqueue(task1);
      scheduler.enqueue(task2);

      await new Promise((resolve) => setTimeout(resolve, 50));

      // Task 2 should not start until task 1 finishes
      expect(executionOrder.indexOf('end-task-1')).toBeLessThan(
        executionOrder.indexOf('start-task-2'),
      );
    });
  });

  describe('getRunningTasks', () => {
    it('should return empty array when no tasks are running', () => {
      const runningTasks = scheduler.getRunningTasks();
      expect(runningTasks).toEqual([]);
    });

    it('should return running tasks', async () => {
      const task = createMockTask({
        handler: vi
          .fn()
          .mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 100))),
      });

      scheduler.enqueue(task);

      // Let the task start running
      await new Promise((resolve) => setTimeout(resolve, 10));

      const runningTasks = scheduler.getRunningTasks();
      expect(runningTasks).toHaveLength(1);
      expect(runningTasks[0].id).toBe(task.id);
    });
  });

  describe('removeTasks', () => {
    it('should remove queued tasks for a thunk', async () => {
      // Create a blocking task to allow other tasks to queue
      const blockingTask = createMockTask({
        id: 'blocking-task',
        thunkId: 'thunk-blocking',
        canRunConcurrently: false,
        handler: vi
          .fn()
          .mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 100))),
      });

      const task1 = createMockTask({
        id: 'task-1',
        thunkId: 'thunk-1',
        canRunConcurrently: false,
      });
      const task2 = createMockTask({
        id: 'task-2',
        thunkId: 'thunk-2',
        canRunConcurrently: false,
      });

      // Start blocking task, then queue others
      scheduler.enqueue(blockingTask);
      scheduler.enqueue(task1);
      scheduler.enqueue(task2);

      expect(scheduler.getQueueStatus().queuedTasks).toBe(2); // task1 and task2 are queued

      scheduler.removeTasks('thunk-1');

      expect(scheduler.getQueueStatus().queuedTasks).toBe(1); // only task2 remains
    });

    it('should handle removal of non-existent thunk tasks', async () => {
      // Create a blocking task to allow the test task to queue
      const blockingTask = createMockTask({
        id: 'blocking-task',
        thunkId: 'thunk-blocking',
        canRunConcurrently: false,
        handler: vi
          .fn()
          .mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 100))),
      });

      const task = createMockTask({
        canRunConcurrently: false,
      });

      scheduler.enqueue(blockingTask);
      scheduler.enqueue(task);

      expect(() => scheduler.removeTasks('non-existent-thunk')).not.toThrow();
      expect(scheduler.getQueueStatus().queuedTasks).toBe(1); // original task should remain
    });
  });

  describe('error handling', () => {
    it('should handle task execution errors', async () => {
      const error = new Error('Task execution failed');
      const handler = vi.fn().mockRejectedValue(error);
      const task = createMockTask({ handler });

      const errorSpy = vi.fn();
      scheduler.on(ThunkSchedulerEvents.TASK_FAILED, errorSpy);

      scheduler.enqueue(task);

      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(handler).toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalledWith(task, error);
    });

    it('should continue processing queue after task failure', async () => {
      const failingHandler = vi.fn().mockRejectedValue(new Error('Task 1 failed'));
      const successHandler = vi.fn().mockResolvedValue(undefined);

      const failingTask = createMockTask({
        id: 'failing-task',
        handler: failingHandler,
      });
      const successTask = createMockTask({
        id: 'success-task',
        thunkId: 'thunk-2',
        handler: successHandler,
      });

      scheduler.enqueue(failingTask);
      scheduler.enqueue(successTask);

      await new Promise((resolve) => setTimeout(resolve, 30));

      expect(failingHandler).toHaveBeenCalled();
      expect(successHandler).toHaveBeenCalled();
    });
  });

  describe('events', () => {
    it('should emit TASK_STARTED when task begins execution', async () => {
      const task = createMockTask({
        handler: vi
          .fn()
          .mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 10))),
      });

      const startedSpy = vi.fn();
      scheduler.on(ThunkSchedulerEvents.TASK_STARTED, startedSpy);

      scheduler.enqueue(task);

      await new Promise((resolve) => setTimeout(resolve, 5));

      expect(startedSpy).toHaveBeenCalledWith(task);
    });

    it('should emit TASK_COMPLETED when task finishes successfully', async () => {
      const task = createMockTask();

      const completedSpy = vi.fn();
      scheduler.on(ThunkSchedulerEvents.TASK_COMPLETED, completedSpy);

      scheduler.enqueue(task);

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(completedSpy).toHaveBeenCalledWith(task);
    });

    it('should emit TASK_FAILED when task throws error', async () => {
      const error = new Error('Task failed');
      const task = createMockTask({
        handler: vi.fn().mockRejectedValue(error),
      });

      const failedSpy = vi.fn();
      scheduler.on(ThunkSchedulerEvents.TASK_FAILED, failedSpy);

      scheduler.enqueue(task);

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(failedSpy).toHaveBeenCalledWith(task, error);
    });

    // Note: QUEUE_EMPTY event is not implemented in the current scheduler
  });

  describe('edge cases', () => {
    it('should handle empty queue processing', () => {
      expect(() => scheduler.processQueue()).not.toThrow();
    });

    it('should handle task with invalid handler gracefully', async () => {
      // Create a task with rejecting handler
      const task = createMockTask({
        handler: vi.fn().mockRejectedValue(new Error('Handler execution failed')),
      });

      const errorSpy = vi.fn();
      scheduler.on(ThunkSchedulerEvents.TASK_FAILED, errorSpy);

      scheduler.enqueue(task);

      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(errorSpy).toHaveBeenCalledWith(task, expect.any(Error));
    });

    it('should handle concurrent processing calls', async () => {
      const task1 = createMockTask({ id: 'task-1' });
      const task2 = createMockTask({ id: 'task-2', thunkId: 'thunk-2' });

      scheduler.enqueue(task1);
      scheduler.enqueue(task2);

      // Call processQueue multiple times concurrently
      scheduler.processQueue();
      scheduler.processQueue();
      scheduler.processQueue();

      await new Promise((resolve) => setTimeout(resolve, 20));

      // Both tasks should execute exactly once
      expect(task1.handler).toHaveBeenCalledTimes(1);
      expect(task2.handler).toHaveBeenCalledTimes(1);
    });
  });
});
