import { debug } from '@zubridge/core';
import type { Action } from '@zubridge/types';
import { EventEmitter } from 'node:events';
import { v4 as uuid } from 'uuid';
import { ResourceManagementError } from '../errors/index.js';
import type { ThunkManager } from '../thunk/ThunkManager.js';
import type { ThunkScheduler } from '../thunk/scheduling/ThunkScheduler.js';

/**
 * Prioritized action in the queue
 */
interface QueuedAction {
  /** The action to process */
  action: Action;
  /** The window ID that sent this action */
  sourceWindowId: number;
  /** Time the action was received */
  receivedTime: number;
  /** Priority of the action (higher = more important) */
  priority: number;
  /** Optional callback when action is completed or failed */
  onComplete?: (error: Error | null) => void;
}

/**
 * Events emitted by ActionScheduler
 */
export enum ActionSchedulerEvents {
  ACTION_ENQUEUED = 'action:enqueued',
  ACTION_STARTED = 'action:started',
  ACTION_COMPLETED = 'action:completed',
  ACTION_FAILED = 'action:failed',
}

/**
 * ActionScheduler is responsible for scheduling action execution with proper concurrency control.
 * It works with ThunkManager to determine when actions can be executed.
 */
export class ActionScheduler extends EventEmitter {
  /**
   * Queue of actions waiting to be processed
   */
  private queue: QueuedAction[] = [];

  /**
   * Maximum queue size before overflow handling
   */
  private maxQueueSize = 1000;

  /**
   * Number of actions dropped due to overflow
   */
  private droppedActionsCount = 0;

  /**
   * Set of action IDs currently being processed
   */
  private runningActions = new Set<string>();

  /**
   * Flag to prevent recursive queue processing
   */
  private processing = false;

  /**
   * ThunkManager reference for concurrency decisions
   */
  private thunkManager: ThunkManager;

  /**
   * Function to process actions
   */
  private actionProcessor?: (action: Action) => Promise<unknown>;

  /**
   * Create a new ActionScheduler
   */
  constructor(thunkManager: ThunkManager) {
    super();
    this.thunkManager = thunkManager;
    debug('scheduler', 'ActionScheduler initialized');

    // Listen for thunk completion events to process queued actions
    this.thunkManager.on('thunk:completed', () => {
      this.processQueue();
    });
  }

  /**
   * Set the action processor function
   */
  public setActionProcessor(processor: (action: Action) => Promise<unknown>): void {
    debug('scheduler', 'Setting action processor');
    this.actionProcessor = processor;
  }

  /**
   * Enqueue an action for execution
   * Returns true if the action was executed immediately, false if it was queued
   */
  public enqueueAction(
    action: Action,
    options: {
      sourceWindowId: number;
      onComplete?: (error: Error | null) => void;
    },
  ): boolean {
    const { sourceWindowId, onComplete } = options;

    // Ensure action has an ID
    if (!action.__id) {
      action.__id = uuid();
    }

    debug(
      'scheduler',
      `Enqueueing action: ${action.type} (id: ${action.__id}) from window ${sourceWindowId}${
        action.__thunkParentId ? `, parent thunk: ${action.__thunkParentId}` : ''
      }`,
    );

    // Record the source window ID on the action
    action.__sourceWindowId = sourceWindowId;

    // Check if we can execute immediately based on concurrency rules
    if (this.canExecuteImmediately(action)) {
      debug('scheduler', `Action ${action.type} (${action.__id}) can execute immediately`);
      this.executeAction(action, sourceWindowId, onComplete);
      return true;
    }

    // Check for queue overflow before adding
    if (this.queue.length >= this.maxQueueSize) {
      if (!this.handleQueueOverflow(action)) {
        // Action was rejected due to overflow
        debug('scheduler', `Action ${action.type} (${action.__id}) rejected due to queue overflow`);
        onComplete?.(
          new ResourceManagementError('Action queue overflow', 'action_queue', 'enqueue', {
            queueSize: this.queue.length,
            maxSize: this.maxQueueSize,
            actionType: action.type,
          }),
        );
        return false;
      }
    }

    // Add to queue for later execution
    debug('scheduler', `Action ${action.type} (${action.__id}) queued for later execution`);
    this.queue.push({
      action,
      sourceWindowId,
      receivedTime: Date.now(),
      priority: this.getPriorityForAction(action),
      onComplete,
    });

    // Sort queue by priority (highest first) and then by received time (earliest first)
    this.sortQueue();

    // Emit event
    this.emit(ActionSchedulerEvents.ACTION_ENQUEUED, action);

    // Return false to indicate the action was queued
    return false;
  }

  /**
   * Check if an action can be executed immediately based on concurrency rules
   */
  public canExecuteImmediately(action: Action): boolean {
    // Log the current action being evaluated
    debug(
      'scheduler-debug',
      `[DECISION] Evaluating if action ${action.type} (${action.__id}) can execute immediately`,
    );
    debug(
      'scheduler-debug',
      `[DECISION] Action details: parentThunkId=${action.__thunkParentId}, bypassThunkLock=${action.__bypassThunkLock}`,
    );

    // Actions with bypassThunkLock can always execute immediately
    if (action.__bypassThunkLock) {
      debug(
        'scheduler',
        `Action ${action.type} (${action.__id}) has bypassThunkLock, can execute immediately`,
      );
      return true;
    }

    // Check if there are any active thunks
    const rootThunkId = this.thunkManager.getRootThunkId();
    const hasActiveThunk = rootThunkId && this.thunkManager.isThunkActive(rootThunkId);

    debug(
      'scheduler-debug',
      `[DECISION] Root thunk: ${rootThunkId || 'none'}, active: ${hasActiveThunk}`,
    );

    // If there's an active thunk and this is not a thunk action, it must wait
    if (hasActiveThunk && !action.__thunkParentId) {
      debug(
        'scheduler',
        `Active thunk ${rootThunkId} exists and ${action.type} (${action.__id}) is not a thunk action, must wait`,
      );
      return false;
    }

    // If this is a thunk action, check if it belongs to the active root thunk
    if (action.__thunkParentId && hasActiveThunk) {
      const belongsToRootThunk = action.__thunkParentId === rootThunkId;
      debug('scheduler-debug', `[DECISION] Action belongs to root thunk: ${belongsToRootThunk}`);

      if (!belongsToRootThunk) {
        debug(
          'scheduler',
          `Thunk action ${action.type} (${action.__id}) belongs to thunk ${action.__thunkParentId}, not root thunk ${rootThunkId}, must wait`,
        );
        return false;
      }
    }

    // Get running tasks from scheduler
    const runningTasks = this.getScheduler().getRunningTasks();
    debug('scheduler-debug', `[DECISION] Running tasks: ${runningTasks.length}`);

    // If there are no running tasks, the action can execute immediately
    if (runningTasks.length === 0) {
      debug(
        'scheduler',
        `No running tasks, action ${action.type} (${action.__id}) can execute immediately`,
      );
      return true;
    }

    // Check if any running tasks are non-concurrent (blocking tasks)
    const hasBlockingTask = runningTasks.some((task) => !task.canRunConcurrently);
    debug('scheduler-debug', `[DECISION] Has blocking tasks: ${hasBlockingTask}`);

    if (!hasBlockingTask) {
      debug(
        'scheduler',
        `No blocking tasks running, action ${action.type} (${action.__id}) can execute immediately`,
      );
      return true;
    }

    // If this is a thunk action, check if it belongs to the same thunk as running tasks
    if (action.__thunkParentId) {
      const belongsToRunningThunk = runningTasks.some(
        (task) => task.thunkId === action.__thunkParentId,
      );
      debug(
        'scheduler-debug',
        `[DECISION] Action belongs to running thunk: ${belongsToRunningThunk}`,
      );

      if (belongsToRunningThunk) {
        debug(
          'scheduler',
          `Action ${action.type} (${action.__id}) belongs to running thunk ${action.__thunkParentId}, can execute immediately`,
        );
        return true;
      }

      debug(
        'scheduler',
        `Thunk action ${action.type} (${action.__id}) must wait for current thunk to complete`,
      );
      return false;
    }

    // Default to blocking for safety
    debug(
      'scheduler',
      `Action ${action.type} (${action.__id}) must wait due to blocking tasks running`,
    );
    return false;
  }

  /**
   * Process the queue, attempting to execute any pending actions
   * that can now be executed based on concurrency rules
   */
  public processQueue(): void {
    // Prevent recursive processing
    if (this.processing || !this.actionProcessor) {
      return;
    }

    this.processing = true;

    try {
      debug('scheduler', `Processing queue with ${this.queue.length} actions`);

      // Find all actions that can be executed now
      const executableActions: QueuedAction[] = [];
      const remainingActions: QueuedAction[] = [];

      // Check each action in order
      for (const queuedAction of this.queue) {
        if (this.canExecuteImmediately(queuedAction.action)) {
          executableActions.push(queuedAction);
        } else {
          remainingActions.push(queuedAction);
        }
      }

      // Update the queue
      this.queue = remainingActions;

      // Execute all executable actions
      for (const queuedAction of executableActions) {
        this.executeAction(
          queuedAction.action,
          queuedAction.sourceWindowId,
          queuedAction.onComplete,
        );
      }

      debug(
        'scheduler',
        `Executed ${executableActions.length} actions, ${this.queue.length} remaining in queue`,
      );
    } finally {
      this.processing = false;
    }
  }

  /**
   * Execute a single action with the action processor
   */
  private async executeAction(
    action: Action,
    sourceWindowId: number,
    onComplete?: (error: Error | null) => void,
  ): Promise<void> {
    if (!this.actionProcessor) {
      debug('scheduler', 'No action processor set, cannot execute action');
      onComplete?.(new Error('No action processor set'));
      return;
    }

    // Mark action as running
    const actionId = action.__id as string;
    this.runningActions.add(actionId);

    // Emit event
    this.emit(ActionSchedulerEvents.ACTION_STARTED, action);

    debug(
      'scheduler',
      `Executing action ${action.type} (${actionId}) from window ${sourceWindowId}`,
    );

    try {
      // Process the action
      const result = await this.actionProcessor(action);
      debug('scheduler', `Action ${action.type} (${actionId}) completed successfully`);

      // Mark action as completed
      this.runningActions.delete(actionId);

      // Notify ThunkManager of action completion
      if (action.__thunkParentId) {
        this.thunkManager.handleActionComplete(actionId);
      }

      // Call completion callback
      onComplete?.(null);

      // Emit event
      this.emit(ActionSchedulerEvents.ACTION_COMPLETED, action, result);

      // Process queue again in case any waiting actions can now be executed
      this.processQueue();
    } catch (error) {
      debug('scheduler', `Action ${action.type} (${actionId}) failed: ${error}`);

      // Mark action as completed (even though it failed)
      this.runningActions.delete(actionId);

      // Call completion callback with error
      onComplete?.(error instanceof Error ? error : new Error(String(error)));

      // Emit event
      this.emit(ActionSchedulerEvents.ACTION_FAILED, action, error);

      // Process queue again in case any waiting actions can now be executed
      this.processQueue();
    }
  }

  /**
   * Sort the queue by priority (highest first) and then by received time (earliest first)
   */
  private sortQueue(): void {
    this.queue.sort((a, b) => {
      // Higher priority first
      if (a.priority !== b.priority) {
        return b.priority - a.priority;
      }

      // Earlier received time first
      return a.receivedTime - b.receivedTime;
    });
  }

  /**
   * Notify the scheduler that a thunk has completed
   * This may allow queued actions to be processed
   */
  public onThunkCompleted(thunkId: string): void {
    debug('scheduler', `Thunk ${thunkId} completed, processing queue`);
    this.processQueue();
  }

  /**
   * Notify the scheduler that an action has completed
   * This may allow dependent actions to be processed
   */
  public onActionCompleted(actionId: string): void {
    debug('scheduler', `Action ${actionId} completed, processing queue`);

    // Remove from running actions
    this.runningActions.delete(actionId);

    // Process queue
    this.processQueue();
  }

  /**
   * Get the priority for an action
   * Higher priority actions are executed first
   */
  private getPriorityForAction(action: Action): number {
    // Priority levels (higher is more important):
    // 100: System actions (bypass thunk lock)
    // 80: Root thunk actions
    // 60: Child thunk actions that can run concurrently
    // 50: Child thunk actions (normal)
    // 30: Regular actions with bypassThunkLock
    // 0: Regular actions

    // Bypass thunk lock actions get highest priority
    if (action.__bypassThunkLock) {
      // Extra priority for thunk actions with bypass
      if (action.__thunkParentId) {
        return 100; // System-level thunk action with bypass
      }
      return 80; // Regular action with bypass
    }

    // Actions belonging to the active root thunk get high priority
    const rootThunkId = this.thunkManager.getRootThunkId();
    if (rootThunkId && action.__thunkParentId === rootThunkId) {
      return 70; // Actions in active root thunk
    }

    // Actions with thunk parents get medium priority
    if (action.__thunkParentId) {
      return 50; // Regular thunk actions
    }

    // Default priority for regular actions
    return 0;
  }

  /**
   * Handle queue overflow by dropping low-priority actions
   * Returns true if the new action should be accepted, false if rejected
   */
  private handleQueueOverflow(newAction: Action): boolean {
    debug(
      'scheduler:overflow',
      `Queue overflow detected (${this.queue.length}/${this.maxQueueSize})`,
    );

    // Determine priority of new action
    const newPriority = this.getPriorityForAction(newAction);

    // Find low-priority actions that can be dropped (priority < 50)
    const droppableActions = this.queue
      .filter((queuedAction) => queuedAction.priority < 50)
      .sort((a, b) => a.priority - b.priority || a.receivedTime - b.receivedTime); // Lowest priority and oldest first

    if (droppableActions.length === 0) {
      // No low-priority actions to drop
      if (newPriority < 50) {
        // New action is also low priority, reject it
        debug(
          'scheduler:overflow',
          'No droppable actions found and new action is low priority, rejecting',
        );
        return false;
      }
      // New action is high priority but no space available
      debug(
        'scheduler:overflow',
        'No droppable actions found but new action is high priority, forcing acceptance',
      );
      // Drop the oldest action regardless of priority
      const oldestAction = this.queue.reduce((oldest, current) =>
        current.receivedTime < oldest.receivedTime ? current : oldest,
      );
      this.removeActionFromQueue(oldestAction);
      this.droppedActionsCount++;
      return true;
    }

    // Drop the lowest priority action
    const actionToDrop = droppableActions[0];
    this.removeActionFromQueue(actionToDrop);
    this.droppedActionsCount++;

    debug(
      'scheduler:overflow',
      `Dropped action ${actionToDrop.action.type} (priority ${actionToDrop.priority}) to make room`,
    );

    // Call the dropped action's completion callback with an error
    actionToDrop.onComplete?.(
      new ResourceManagementError(
        'Action dropped due to queue overflow',
        'action_queue',
        'overflow',
        {
          droppedActionType: actionToDrop.action.type,
          newActionType: newAction.type,
          queueSize: this.queue.length,
        },
      ),
    );

    return true;
  }

  /**
   * Remove an action from the queue
   */
  private removeActionFromQueue(actionToRemove: QueuedAction): void {
    const index = this.queue.indexOf(actionToRemove);
    if (index !== -1) {
      this.queue.splice(index, 1);
    }
  }

  /**
   * Get queue statistics
   */
  public getQueueStats(): {
    currentSize: number;
    maxSize: number;
    droppedActionsCount: number;
    priorityDistribution: Record<string, number>;
  } {
    const priorityDistribution: Record<string, number> = {};

    for (const queuedAction of this.queue) {
      const priority = queuedAction.priority;
      const priorityName = priority >= 80 ? 'High' : priority >= 50 ? 'Normal' : 'Low';
      priorityDistribution[priorityName] = (priorityDistribution[priorityName] || 0) + 1;
    }

    return {
      currentSize: this.queue.length,
      maxSize: this.maxQueueSize,
      droppedActionsCount: this.droppedActionsCount,
      priorityDistribution,
    };
  }

  /**
   * Get the ThunkScheduler instance
   */
  public getScheduler(): ThunkScheduler {
    return this.thunkManager.getScheduler();
  }
}

// Singleton instance
let actionSchedulerInstance: ActionScheduler | undefined;

/**
 * Initialize the global ActionScheduler
 */
export function initActionScheduler(thunkManager: ThunkManager): ActionScheduler {
  actionSchedulerInstance = new ActionScheduler(thunkManager);
  return actionSchedulerInstance;
}

/**
 * Get the global ActionScheduler instance
 */
export function getActionScheduler(): ActionScheduler {
  if (!actionSchedulerInstance) {
    throw new Error('ActionScheduler not initialized');
  }
  return actionSchedulerInstance;
}
