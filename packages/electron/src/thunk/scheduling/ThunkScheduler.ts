import { EventEmitter } from 'node:events';
import { debug } from '@zubridge/utils';
import { ThunkSchedulerEvents } from '../../constants.js';
import type {
  ThunkScheduler as IThunkScheduler,
  ThunkQueueStatus,
  ThunkTask,
} from '../../types/thunk.js';

/**
 * Priority queue-based implementation of ThunkScheduler
 */
export class ThunkScheduler extends EventEmitter implements IThunkScheduler {
  /**
   * Queue of tasks waiting to be executed
   * Sorted by priority (highest first) and then by start time (earliest first)
   */
  private queue: ThunkTask[] = [];

  /**
   * Tasks currently executing
   */
  private runningTasks: Map<string, ThunkTask> = new Map();

  /**
   * Whether the scheduler is actively processing the queue
   */
  private isProcessing = false;

  constructor() {
    super();
    debug('scheduler', 'ThunkScheduler initialized');
  }

  /**
   * Enqueue a task for execution
   * Task will be executed when it reaches the front of the queue and has no conflicts
   */
  enqueue(task: ThunkTask): void {
    debug(
      'scheduler',
      `Enqueuing task ${task.id} for thunk ${task.thunkId} (priority: ${task.priority}, canRunConcurrently: ${task.canRunConcurrently})`,
    );
    debug('scheduler', 'Task details:', task);
    debug(
      'scheduler',
      'Current running tasks:',
      Array.from(this.runningTasks.values()).map(
        (t) => `${t.id} (thunk: ${t.thunkId}, canRunConcurrently: ${t.canRunConcurrently})`,
      ),
    );

    // Add task to queue
    this.queue.push(task);

    // Sort queue by priority (highest first) and then by start time (earliest first)
    this.sortQueue();

    // Try to process the queue
    this.processQueue();

    // Log the updated queue state
    debug(
      'scheduler-debug',
      `Queue state after enqueueing task ${task.id}: ${JSON.stringify(this.getQueueStatus())}`,
    );
    debug(
      'scheduler-debug',
      `Queue items: ${this.queue.length}, Running tasks: ${this.runningTasks.size}`,
    );
  }

  /**
   * Get all tasks currently running
   */
  getRunningTasks(): ThunkTask[] {
    return Array.from(this.runningTasks.values());
  }

  /**
   * Get the status of the task queue
   */
  getQueueStatus(): ThunkQueueStatus {
    const queuedTasks = this.queue.length;
    const runningTasks = this.runningTasks.size;
    const highestPriorityQueued = queuedTasks > 0 ? this.queue[0].priority : -1;
    const isIdle = queuedTasks === 0 && runningTasks === 0;

    return {
      queuedTasks,
      runningTasks,
      highestPriorityQueued,
      isIdle,
    };
  }

  /**
   * Process the task queue
   * This will execute any tasks that have no conflicts
   */
  processQueue(): void {
    // If already processing, return to prevent recursion
    if (this.isProcessing) {
      debug('scheduler-debug', 'Already processing queue, returning');
      return;
    }

    // Set processing flag
    this.isProcessing = true;

    try {
      debug('scheduler-debug', `Processing queue with ${this.queue.length} tasks`);

      // Process queue until we can't execute any more tasks
      let tasksStarted = 0;
      let i = 0;

      while (i < this.queue.length) {
        const task = this.queue[i];

        debug(
          'scheduler-debug',
          `Checking task ${task.id} (thunk: ${task.thunkId}, canRunConcurrently: ${task.canRunConcurrently})`,
        );

        // Check if this task has conflicts with any running tasks
        if (this.hasConflicts(task)) {
          debug('scheduler-debug', `Task ${task.id} has conflicts with running tasks, skipping`);
          i++; // Move to next task
          continue;
        }

        // No conflicts, execute this task
        debug('scheduler', `Starting task ${task.id} for thunk ${task.thunkId}`);

        // Remove from queue
        this.queue.splice(i, 1);

        // Add to running tasks
        this.runningTasks.set(task.id, task);

        // Increment counter
        tasksStarted++;

        // Emit event
        this.emit(ThunkSchedulerEvents.TASK_STARTED, task);

        // Execute task
        this.executeTask(task);

        // Don't increment i since we removed an element
        // This ensures we check the new task at this position
      }

      debug('scheduler-debug', `Queue processing complete, started ${tasksStarted} tasks`);
      debug(
        'scheduler-debug',
        `Queue state after processing: ${JSON.stringify(this.getQueueStatus())}`,
      );

      if (tasksStarted > 0) {
        debug('scheduler-debug', 'Running tasks:');
        for (const [id, task] of this.runningTasks.entries()) {
          debug(
            'scheduler-debug',
            `  ${id}: thunk=${task.thunkId}, canRunConcurrently=${task.canRunConcurrently}`,
          );
        }
      }
    } finally {
      // Clear processing flag
      this.isProcessing = false;
    }
  }

  /**
   * Check if a task has conflicts with any running tasks
   * A task has conflicts if it can't run concurrently and any running task
   * affects the same keys
   */
  hasConflicts(task: ThunkTask): boolean {
    debug(
      'scheduler-debug',
      `Checking conflicts for task ${task.id} (canRunConcurrently: ${task.canRunConcurrently})`,
    );
    debug(
      'scheduler-debug',
      `Currently running tasks: [${Array.from(this.runningTasks.values())
        .map((t) => `${t.id} (thunk: ${t.thunkId}, canRunConcurrently: ${t.canRunConcurrently})`)
        .join(', ')}]`,
    );
    // If no tasks are running, there are no conflicts
    if (this.runningTasks.size === 0) {
      debug('scheduler-debug', `No running tasks, task ${task.id} has no conflicts`);
      return false;
    }

    // If this task can run concurrently, no conflicts
    if (task.canRunConcurrently) {
      debug('scheduler-debug', `Task ${task.id} can run concurrently, no conflicts`);
      return false;
    }

    // Check each running task for conflicts
    for (const runningTask of this.runningTasks.values()) {
      // If running task can run concurrently, no conflict
      if (runningTask.canRunConcurrently) {
        continue;
      }

      debug(
        'scheduler-debug',
        `Checking for conflicts between task ${task.id} and running task ${runningTask.id}`,
      );

      // Always consider non-concurrent tasks to conflict (simplified approach)
      debug(
        'scheduler-debug',
        `Conflict: task ${task.id} cannot run concurrently with task ${runningTask.id}`,
      );
      return true;
    }

    // No conflicts found
    debug('scheduler-debug', `Task ${task.id} has no conflicts with running tasks`);
    return false;
  }

  /**
   * Execute a task asynchronously
   */
  private executeTask(task: ThunkTask): void {
    debug(
      'scheduler',
      `Starting execution of task ${task.id} (thunk: ${task.thunkId}, canRunConcurrently: ${task.canRunConcurrently})`,
    );
    // Execute the task
    task
      .handler()
      .then(() => {
        debug(
          'scheduler',
          `Task ${task.id} completed successfully (thunk: ${task.thunkId}, canRunConcurrently: ${task.canRunConcurrently})`,
        );

        // Remove from running tasks
        this.runningTasks.delete(task.id);

        // Emit event
        this.emit(ThunkSchedulerEvents.TASK_COMPLETED, task);

        // Process queue again in case any waiting tasks can now be executed
        this.processQueue();

        debug(
          'scheduler-debug',
          `Queue state after task ${task.id} completed: ${JSON.stringify(this.getQueueStatus())}`,
        );
      })
      .catch((error: Error) => {
        debug('scheduler', `Task ${task.id} failed with error: ${error}`);

        // Remove from running tasks
        this.runningTasks.delete(task.id);

        // Emit event
        this.emit(ThunkSchedulerEvents.TASK_FAILED, task, error);

        // Process queue again in case any waiting tasks can now be executed
        this.processQueue();

        debug(
          'scheduler-debug',
          `Queue state after task ${task.id} failed: ${JSON.stringify(this.getQueueStatus())}`,
        );
      });
  }

  /**
   * Sort queue by priority (highest first) and then by creation time (earliest first)
   */
  private sortQueue(): void {
    this.queue.sort((a, b) => {
      // Higher priority comes first
      if (a.priority !== b.priority) {
        return b.priority - a.priority;
      }

      // Earlier creation time comes first
      return a.createdAt - b.createdAt;
    });
  }

  /**
   * Remove all tasks for a specific thunk
   */
  removeTasks(thunkId: string): void {
    debug('scheduler', `Removing all tasks for thunk ${thunkId}`);

    // Remove from queue
    this.queue = this.queue.filter((task) => task.thunkId !== thunkId);

    // Don't attempt to stop running tasks, just remove them from tracking
    // when they complete they'll naturally be removed
    const runningTaskIds: string[] = [];
    for (const [taskId, task] of this.runningTasks.entries()) {
      if (task.thunkId === thunkId) {
        runningTaskIds.push(taskId);
      }
    }

    debug('scheduler', `Removed ${runningTaskIds.length} running tasks for thunk ${thunkId}`);
  }
}
