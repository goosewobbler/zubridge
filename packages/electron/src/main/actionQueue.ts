import type { Action as BaseAction } from '@zubridge/types';
import { getThunkTracker, ThunkState } from '../lib/thunkTracker.js';
import { debug } from '@zubridge/core';

// Get the global ThunkTracker for action queueing decisions
const thunkTracker = getThunkTracker();

// Extend the base Action type with our additional fields
interface Action extends BaseAction {
  __sourceWindowId?: number; // ID of the window that dispatched this action
  __thunkParentId?: string; // Parent thunk ID if this action is part of a thunk
}

/**
 * Information about a pending action in the main process queue
 */
interface QueuedAction {
  /** The action to process */
  action: Action;
  /** The window ID that sent this action */
  sourceWindowId: number;
  /** Parent thunk ID if this action is part of a thunk */
  parentThunkId?: string;
  /** Time the action was received */
  receivedTime: number;
  /** Optional callback when action is completed */
  onComplete?: () => void;
}

/**
 * Information about an active thunk
 */
interface ActiveThunk {
  /** Thunk ID */
  id: string;
  /** Window ID that initiated the thunk */
  windowId: number;
  /** Parent thunk ID if this is a nested thunk */
  parentId?: string;
  /** When the thunk started executing */
  startTime: number;
  /** Child thunk IDs */
  childThunkIds: Set<string>;
}

/**
 * Manages a central action queue in the main process
 * This ensures proper ordering of actions across windows
 */
export class ActionQueueManager {
  // Queue of actions waiting to be processed
  private actionQueue: QueuedAction[] = [];

  // Action processor function (set externally)
  private actionProcessor?: (action: Action) => Promise<any>;

  // Function to broadcast thunk state (set externally)
  private thunkStateBroadcaster?: (
    version: number,
    thunks: Array<{ id: string; windowId: number; parentId?: string }>,
  ) => void;

  constructor() {
    debug('queue', 'Main action queue manager initialized');

    // Subscribe to thunk state changes to process queue when any thunk completes
    thunkTracker.onStateChange((thunkId, state, _info) => {
      if (state === ThunkState.COMPLETED) {
        debug('queue', `Detected thunk ${thunkId} completion via state change, reprocessing queue`);
        this.completeThunk(thunkId);
      }
    });
  }

  /**
   * Set the action processor function
   */
  public setActionProcessor(processor: (action: Action) => Promise<any>): void {
    debug('queue', 'Setting action processor');
    this.actionProcessor = processor;
  }

  /**
   * Set the function to broadcast thunk state to renderers
   */
  public setThunkStateBroadcaster(
    broadcaster: (version: number, thunks: Array<{ id: string; windowId: number; parentId?: string }>) => void,
  ): void {
    debug('queue', 'Setting thunk state broadcaster');
    this.thunkStateBroadcaster = broadcaster;
  }

  /**
   * Get the current thunk state
   */
  public getThunkState(): { version: number; thunks: Array<{ id: string; windowId: number; parentId?: string }> } {
    // Get thunk state from ThunkTracker instead of managing it ourselves
    return thunkTracker.getActiveThunksSummary();
  }

  /**
   * Register a new thunk from a renderer process
   */
  public registerThunk(thunkId: string, windowId: number, parentId?: string): void {
    debug('queue', `Registering thunk ${thunkId} from window ${windowId}${parentId ? ` with parent ${parentId}` : ''}`);

    // No need to maintain our own tracking anymore - ThunkTracker handles this

    // Process the queue in case there are pending actions
    this.processQueue();
  }

  /**
   * Complete a thunk from a renderer process
   */
  public completeThunk(thunkId: string): void {
    debug('queue', `Completing thunk ${thunkId}`);

    // No need to maintain our own tracking anymore - ThunkTracker handles this

    // Force deferred action re-evaluation
    if (this.actionQueue.length > 0) {
      debug('queue', `Found ${this.actionQueue.length} actions in queue after thunk ${thunkId} completed`);

      // Log the currently queued actions for debugging
      this.actionQueue.forEach((queuedAction, index) => {
        debug(
          'queue',
          `Queued action ${index}: ${queuedAction.action.type} from window ${queuedAction.sourceWindowId}`,
        );
      });
    }

    // Process the queue now that a thunk has completed
    debug('queue', `Thunk ${thunkId} completed, reprocessing queue to handle previously deferred actions`);
    this.processQueue();
  }

  /**
   * Determine if an action should be processed now or queued
   */
  private shouldDeferAction(action: Action, sourceWindowId: number): boolean {
    // Use ThunkTracker to check if there are any active thunks
    const hasActiveThunks = thunkTracker.hasActiveThunks();
    if (!hasActiveThunks) {
      debug('queue', `Not deferring action ${action.type} - no active thunks`);
      return false;
    }

    // If action has thunk parent, check if it's an active thunk
    if (action.__thunkParentId) {
      // Check if this thunk is in the active thunks list
      const activeThunkRecords = thunkTracker.getActiveThunks();
      const isChildOfActiveThunk = activeThunkRecords.some((thunk) => thunk.id === action.__thunkParentId);
      if (isChildOfActiveThunk) {
        debug('queue', `Not deferring action ${action.type} - child of active thunk ${action.__thunkParentId}`);
        return false;
      }
    }

    // If a window has active thunks, we should defer all non-thunk actions from that window
    // This ensures proper sequencing of actions
    const windowHasActiveThunks = thunkTracker.hasActiveThunksForWindow(sourceWindowId);
    if (windowHasActiveThunks) {
      // Only allow actions that are explicitly part of a thunk
      if (action.__thunkParentId) {
        debug('queue', `Not deferring action ${action.type} - has thunk parent ${action.__thunkParentId}`);
        return false;
      } else {
        debug(
          'queue',
          `Deferring action ${action.type} - from window ${sourceWindowId} with active thunks but not part of a thunk`,
        );
        return true;
      }
    }

    // Get active thunks for logging
    const activeThunks = thunkTracker.getActiveThunks();
    const activeWindowIds = activeThunks.map((thunk) => thunk.sourceWindowId).filter(Boolean);

    // If any other window has active thunks, defer this action to maintain cross-window ordering
    debug(
      'queue',
      `Deferring action ${action.type} from window ${sourceWindowId} - windows ${activeWindowIds.join(', ')} have active thunks`,
    );
    return true;
  }

  /**
   * Find the index of the next action that can be processed
   * Returns -1 if all actions are deferred
   */
  private findProcessableActionIndex(): number {
    for (let i = 0; i < this.actionQueue.length; i++) {
      const queuedAction = this.actionQueue[i];

      if (!this.shouldDeferAction(queuedAction.action, queuedAction.sourceWindowId)) {
        return i;
      }

      debug(
        'queue',
        `Action ${queuedAction.action.type} from window ${queuedAction.sourceWindowId} is deferred - checking next`,
      );
    }

    // No processable actions found
    debug('queue', `All ${this.actionQueue.length} actions in queue are deferred - will retry later`);
    return -1;
  }

  /**
   * Process the next action in the queue
   */
  private async processNextAction(): Promise<void> {
    if (!this.actionProcessor || this.actionQueue.length === 0) {
      return;
    }

    // Find the next action that can be processed
    const actionIndex = this.findProcessableActionIndex();

    // If no processable actions, return and wait for thunks to complete
    if (actionIndex === -1) {
      return;
    }

    // Get the action and remove it from the queue
    const queuedAction = this.actionQueue[actionIndex];
    this.actionQueue.splice(actionIndex, 1);

    // Process the action
    debug('queue', `Processing action: ${queuedAction.action.type} from window ${queuedAction.sourceWindowId}`);

    try {
      await this.actionProcessor(queuedAction.action);
      debug('queue', `Action ${queuedAction.action.type} processed successfully`);
      queuedAction.onComplete?.();
    } catch (error) {
      debug('queue:error', `Error processing action ${queuedAction.action.type}: ${error as string}`);
    }

    // Continue processing queue
    if (this.actionQueue.length > 0) {
      await this.processNextAction();
    }
  }

  /**
   * Enqueue an action for processing
   */
  public enqueueAction(action: Action, sourceWindowId: number, parentThunkId?: string): void {
    // Set the thunk parentId on the action
    if (parentThunkId) {
      debug('queue', `Action ${action.type} (${action.id}) is child of thunk ${parentThunkId}`);
      action.__thunkParentId = parentThunkId;
    }

    // Add to queue
    debug(
      'queue',
      `Enqueueing action: ${action.type} (id: ${action.id}) from window ${sourceWindowId}${parentThunkId ? `, parent thunk: ${parentThunkId}` : ''}`,
    );
    this.actionQueue.push({
      action,
      sourceWindowId,
      parentThunkId,
      receivedTime: Date.now(),
    });

    // Check if we should defer processing this action
    const shouldDefer = this.shouldDeferAction(action, sourceWindowId);

    if (shouldDefer) {
      debug('queue', `🔄 DEFERRED action ${action.type} (${action.id}) - will process when thunks complete`);
      debug('queue', `Current queue length: ${this.actionQueue.length}`);

      // Log active thunks for debugging
      const activeThunks = thunkTracker.getActiveThunks();
      debug(
        'queue',
        `Active thunks preventing immediate execution: ${activeThunks.map((t) => `${t.id} (window ${t.sourceWindowId})`).join(', ')}`,
      );
      return;
    }

    debug('queue', `✅ IMMEDIATE processing of action ${action.type} (${action.id}) - no blocking thunks`);

    // Process the queue
    this.processQueue();
  }

  /**
   * Process the entire queue
   */
  public processQueue(): void {
    if (!this.actionProcessor) {
      debug('queue', 'No action processor set, cannot process queue');
      return;
    }

    if (this.actionQueue.length === 0) {
      debug('queue', 'Action queue is empty, nothing to process');
      return;
    }

    debug('queue', `Processing queue with ${this.actionQueue.length} actions`);

    // Log the currently queued actions for debugging
    this.actionQueue.forEach((queuedAction, index) => {
      debug('queue', `Queue position ${index}: ${queuedAction.action.type} from window ${queuedAction.sourceWindowId}`);
    });

    // Recheck the active thunk state for debugging
    const activeThunks = thunkTracker.getActiveThunks();
    if (activeThunks.length > 0) {
      debug('queue', `Active thunks during queue processing: ${activeThunks.map((t) => t.id).join(', ')}`);
      debug(
        'queue',
        `Active thunk windows: ${activeThunks
          .map((t) => t.sourceWindowId)
          .filter(Boolean)
          .join(', ')}`,
      );
    } else {
      debug('queue', 'No active thunks during queue processing');
    }

    // Process the first action in the queue
    this.processNextAction().catch((error) => {
      debug('queue:error', `Error in processQueue: ${error as string}`);
    });
  }
}

// Create a singleton instance
export const actionQueue = new ActionQueueManager();
