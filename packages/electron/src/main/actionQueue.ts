import type { Action, AnyState, StateManager } from '@zubridge/types';
import { debug } from '@zubridge/utils';
import { v4 as uuidv4 } from 'uuid';
import { ActionExecutor } from '../action/ActionExecutor.js';
import { ThunkSchedulerEvents } from '../constants.js';
import { actionScheduler, thunkManager } from '../thunk/init.js';
import { ThunkRegistrationQueue } from '../thunk/registration/ThunkRegistrationQueue.js';
import type { Thunk as ThunkClass } from '../thunk/Thunk.js';
import type { ThunkTask } from '../types/thunk.js';

/**
 * Manages a central action queue and scheduling in the main process
 * This ensures proper ordering of actions and concurrency control
 */
export class ActionQueueManager<S extends AnyState = AnyState> {
  /**
   * Action executor for final action processing
   */
  private actionExecutor: ActionExecutor<S>;

  // Thunk registration queue
  private thunkRegistrationQueue: ThunkRegistrationQueue;

  constructor(stateManager: StateManager<S>) {
    debug('queue', 'Main action queue manager initializing');

    // Create the executor with the state manager
    this.actionExecutor = new ActionExecutor<S>(stateManager);

    // Create the thunk registration queue using the pre-initialized thunkManager
    this.thunkRegistrationQueue = new ThunkRegistrationQueue(thunkManager);

    // Initialize the ActionScheduler with our processAction method
    actionScheduler.setActionProcessor(async (action: Action) => {
      return this.processAction(action);
    });

    debug('queue', 'Main action queue manager initialized');
  }

  /**
   * Central method to process an action with proper routing and concurrency control
   * This is the main entry point for action processing
   */
  private async processAction(action: Action): Promise<unknown> {
    debug('queue', `Processing action ${action.type} (ID: ${action.__id || 'unknown'})`);

    // Determine if this is a thunk-related action
    const isThunkAction = action.__thunkParentId;
    const hasBypassFlag = !!action.__bypassThunkLock;

    // Create a task for ThunkScheduler with proper concurrency settings if needed
    if (isThunkAction && !hasBypassFlag) {
      debug(
        'queue',
        `Action ${action.type} is part of thunk ${action.__thunkParentId}, scheduling task`,
      );
      return this.scheduleThunkAction(action);
    }

    // Process non-thunk actions or bypass actions directly through executor
    debug('queue', `Executing action ${action.type} directly (bypass: ${hasBypassFlag})`);
    return this.actionExecutor.executeAction(action);
  }

  /**
   * Schedule a thunk action as a task with proper concurrency control
   */
  private scheduleThunkAction(action: Action): Promise<unknown> {
    // Get thunk ID from the action
    const thunkId = action.__thunkParentId;
    if (!thunkId) {
      throw new Error('Thunk ID missing for thunk action');
    }

    // Ensure the thunk exists
    if (!thunkManager.hasThunk(thunkId)) {
      debug('queue:error', `Thunk ${thunkId} not found for action ${action.type}`);
      return Promise.reject(new Error(`Thunk ${thunkId} not found`));
    }

    // Create a task for the ThunkScheduler
    const task: ThunkTask = {
      id: uuidv4(),
      thunkId: thunkId,
      createdAt: Date.now(),
      priority: 0, // Default priority
      canRunConcurrently: !!action.__bypassThunkLock, // Map bypass flag to canRunConcurrently
      handler: async (): Promise<void> => {
        // Execute the action directly through the executor
        // This avoids recursion since we're not going through processAction again
        return this.actionExecutor.executeAction(action) as Promise<void>;
      },
    };

    debug('queue', `Scheduling thunk action ${action.type} as task ${task.id}`);

    // Submit the task to the ThunkScheduler
    return new Promise((resolve, reject) => {
      // Create task and submit to scheduler
      actionScheduler.getScheduler().enqueue(task);

      // Monitor task completion through events
      const onCompleted = (completedTask: ThunkTask) => {
        if (completedTask.id === task.id) {
          debug('queue', `Thunk task ${task.id} completed successfully`);
          actionScheduler
            .getScheduler()
            .removeListener(ThunkSchedulerEvents.TASK_COMPLETED, onCompleted);
          actionScheduler.getScheduler().removeListener(ThunkSchedulerEvents.TASK_FAILED, onFailed);
          resolve(null);
        }
      };

      const onFailed = (failedTask: ThunkTask, error: Error) => {
        if (failedTask.id === task.id) {
          debug('queue:error', `Thunk task ${task.id} failed: ${error.message}`);
          actionScheduler
            .getScheduler()
            .removeListener(ThunkSchedulerEvents.TASK_COMPLETED, onCompleted);
          actionScheduler.getScheduler().removeListener(ThunkSchedulerEvents.TASK_FAILED, onFailed);
          reject(error);
        }
      };

      // Register event listeners with correct event names
      actionScheduler.getScheduler().on(ThunkSchedulerEvents.TASK_COMPLETED, onCompleted);
      actionScheduler.getScheduler().on(ThunkSchedulerEvents.TASK_FAILED, onFailed);
    });
  }

  /**
   * Get the current thunk state
   */
  public getThunkState(): {
    version: number;
    thunks: Array<{ id: string; windowId: number; parentId?: string }>;
  } {
    return thunkManager.getActiveThunksSummary();
  }

  /**
   * Centralized thunk registration entry point for both main and renderer thunks
   * Returns a promise that resolves when the thunk is registered and started
   */
  public registerThunkQueued(
    thunk: InstanceType<typeof ThunkClass>,
    mainThunkCallback?: () => Promise<unknown>,
    rendererCallback?: () => void,
  ): Promise<unknown> {
    return this.thunkRegistrationQueue.registerThunk(thunk, mainThunkCallback, rendererCallback);
  }

  /**
   * Enqueue an action for processing
   */
  public enqueueAction(
    action: Action,
    sourceWindowId: number,
    parentThunkId?: string,
    onComplete?: (error: Error | null) => void,
  ): void {
    if (parentThunkId) {
      action.__thunkParentId = parentThunkId;
      debug(
        'queue',
        `Action ${action.type} from window ${sourceWindowId} belongs to thunk ${parentThunkId}`,
      );
    }

    action.__sourceWindowId = sourceWindowId; // Ensure sourceWindowId is on the action itself

    debug(
      'queue',
      `Enqueueing action: ${action.type} (id: ${action.__id}) from window ${sourceWindowId}${
        parentThunkId ? `, parent thunk: ${parentThunkId}` : ''
      }`,
    );

    // Use the ActionScheduler to handle the action with proper concurrency control
    actionScheduler.enqueueAction(action, {
      sourceWindowId,
      onComplete,
    });
  }
}

// Create and export a singleton instance
// Note: The ActionQueue now requires a StateManager, which will be injected when we initialize it
export let actionQueue: ActionQueueManager;

// Export a function to initialize the queue with the state manager
export function initActionQueue<S extends AnyState>(
  stateManager: StateManager<S>,
): ActionQueueManager<S> {
  actionQueue = new ActionQueueManager<S>(stateManager);
  return actionQueue as ActionQueueManager<S>;
}
