/**
 * Zubridge thunk types
 */
import type { Action } from '@zubridge/types';

/**
 * Status information about the task queue
 */
export interface ThunkQueueStatus {
  /**
   * Number of tasks waiting in queue
   */
  queuedTasks: number;

  /**
   * Number of tasks currently executing
   */
  runningTasks: number;

  /**
   * Highest priority of any queued task
   * -1 if queue is empty
   */
  highestPriorityQueued: number;

  /**
   * Whether the scheduler is idle (no queued or running tasks)
   */
  isIdle: boolean;
}

/**
 * Represents a task in the thunk scheduler queue
 * A task is a unit of work that will be executed according to its priority
 */
export interface ThunkTask {
  /**
   * Unique identifier for the task
   */
  id: string;

  /**
   * ID of the thunk this task belongs to
   */
  thunkId: string;

  /**
   * Handler function to execute this task
   */
  handler: () => Promise<void>;

  /**
   * Priority of this task (higher priority tasks execute first)
   */
  priority: number;

  /**
   * Whether this task can run concurrently with other tasks
   */
  canRunConcurrently: boolean;

  /**
   * Timestamp when the task was created (ms since epoch)
   */
  createdAt: number;

  /**
   * Timestamp when the task was started (ms since epoch)
   * Undefined if not started yet
   */
  startedAt?: number;
}

/**
 * Interface for a scheduler that manages task execution
 */
export interface ThunkScheduler {
  /**
   * Add a task to the queue
   */
  enqueue(task: ThunkTask): void;

  /**
   * Get status information about the task queue
   */
  getQueueStatus(): ThunkQueueStatus;

  /**
   * Get all tasks currently executing
   */
  getRunningTasks(): ThunkTask[];

  /**
   * Process the task queue
   * Begins execution of queued tasks if possible
   */
  processQueue(): void;

  /**
   * Remove all tasks for a specific thunk
   */
  removeTasks(thunkId: string): void;
}

/**
 * Extended Action type that includes thunk-related properties
 */
export interface ThunkAction extends Action {
  /**
   * ID of the parent thunk this action belongs to
   */
  parentId?: string;
}

/**
 * Options for thunk processor configuration
 */
export interface ThunkProcessorOptions {
  /**
   * Maximum number of pending actions allowed in the queue (default: 100)
   * When this limit is exceeded, new actions will throw a QueueOverflowError
   */
  maxQueueSize?: number;
  /**
   * Timeout for action completion in milliseconds
   * Platform-specific defaults: Linux=60000ms, others=30000ms
   */
  actionCompletionTimeoutMs?: number;
}
