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

  // ID of the root thunk currently being processed. Undefined if no thunk is exclusively processing.
  private currentProcessingRootThunkId: string | undefined = undefined;

  constructor() {
    debug('queue', 'Main action queue manager initialized');

    // Subscribe to thunk state changes
    thunkTracker.onStateChange((thunkId, state, _info) => {
      // Original logic for any thunk completion
      if (state === ThunkState.COMPLETED || state === ThunkState.FAILED) {
        debug('queue', `Detected thunk ${thunkId} final state (${state}) via state change, reprocessing queue`);

        // New logic: Check if the completed/failed thunk was the one we were locking to
        if (this.currentProcessingRootThunkId && thunkTracker.isThunkTreeComplete(this.currentProcessingRootThunkId)) {
          // Check if there are any actions still in the queue for this root thunk tree
          const remainingActionsForThisRootTree = this.actionQueue.some((queuedAction) => {
            // Check if action has a parent thunk
            if (queuedAction.action.__thunkParentId) {
              // Get the ultimate root of the action's thunk parent
              const actionUltimateRootId = thunkTracker.getUltimateRootParent(queuedAction.action.__thunkParentId);
              // If this action belongs to the currently processing root thunk, it counts as remaining
              return actionUltimateRootId === this.currentProcessingRootThunkId;
            }
            // If action has no thunk parent, it doesn't belong to the current root thunk tree in this context
            return false;
          });

          if (!remainingActionsForThisRootTree) {
            debug(
              'queue',
              `Root thunk tree for ${this.currentProcessingRootThunkId} is complete AND no pending actions for it in queue. Unlocking.`,
            );
            this.currentProcessingRootThunkId = undefined;

            // Clear the processing scheduled flag to allow immediate reprocessing
            this.processingScheduled = false;
          } else {
            debug(
              'queue',
              `Root thunk tree for ${this.currentProcessingRootThunkId} is complete BUT actions still pending in queue. Lock remains for ${this.currentProcessingRootThunkId}.`,
            );
          }
        }
        this.processQueue(); // Always reprocess queue on any thunk completion/failure
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
    return thunkTracker.getActiveThunksSummary();
  }

  /**
   * Register a new thunk from a renderer process
   */
  public registerThunk(thunkId: string, windowId: number, parentId?: string): void {
    debug('queue', `Registering thunk ${thunkId} from window ${windowId}${parentId ? ` with parent ${parentId}` : ''}`);
    this.processQueue();
  }

  /**
   * Complete a thunk from a renderer process (deprecated in favor of direct onStateChange handling)
   * Kept for now if other parts of the system rely on it, but its core responsibility moved.
   */
  public completeThunk(thunkId: string): void {
    debug('queue', `Thunk ${thunkId} completion reported (may be redundant due to onStateChange)`);
    // The actual check for currentProcessingRootThunkId and reprocessing is now in onStateChange.
    // We might still call processQueue here to be safe if there are edge cases not caught by onStateChange.
    this.processQueue();
  }

  /**
   * Determine if an action should be deferred
   */
  private shouldDeferAction(action: Action, sourceWindowId: number): boolean {
    // Check for force option to bypass queue ordering
    if (action.__force === true) {
      debug('queue', `Action ${action.type} is forced and will bypass queue ordering checks`);
      return false;
    }

    const actionThunkParentId = action.__thunkParentId;
    let actionUltimateRootId: string | undefined = undefined;

    if (actionThunkParentId) {
      actionUltimateRootId = thunkTracker.getUltimateRootParent(actionThunkParentId);
      // If getUltimateRootParent returns undefined but the direct parentId exists on the action,
      // it implies actionThunkParentId was intended to be a root, or it's an orphaned thunk action.
      // We should treat actionThunkParentId as its own root if no deeper root is found by getUltimateRootParent.
      if (!actionUltimateRootId && thunkTracker.getThunkRecord(actionThunkParentId)) {
        actionUltimateRootId = actionThunkParentId;
      }
    }

    if (this.currentProcessingRootThunkId) {
      // A root thunk is currently "locked in" for processing.
      if (actionUltimateRootId === this.currentProcessingRootThunkId) {
        // Action belongs to the actively processing root thunk tree. Do not defer.
        debug(
          'queue',
          `Not deferring action ${action.type} - belongs to current root ${this.currentProcessingRootThunkId}`,
        );
        return false;
      } else {
        // Check if this action is a thunk or part of a thunk that has reached the COMPLETED or FAILED state
        if (actionThunkParentId) {
          const parentThunkRecord = thunkTracker.getThunkRecord(actionThunkParentId);
          if (
            parentThunkRecord &&
            (parentThunkRecord.state === ThunkState.COMPLETED || parentThunkRecord.state === ThunkState.FAILED)
          ) {
            // If the parent thunk is already completed or failed, we should process the action
            debug(
              'queue',
              `Not deferring action ${action.type} - its parent thunk ${actionThunkParentId} is in final state (${parentThunkRecord.state})`,
            );
            return false;
          }
        }

        // Action belongs to a different thunk tree or is a non-thunk action. Defer.
        debug(
          'queue',
          `Deferring action ${action.type} - currentProcessingRootThunkId is ${this.currentProcessingRootThunkId}, action root is ${actionUltimateRootId || 'none'}`,
        );
        return true;
      }
    } else {
      // No root thunk is currently "locked in".
      if (actionUltimateRootId) {
        // This action is part of a thunk tree. It can proceed and potentially "lock in" its root.
        // The actual locking happens when this action is chosen by processNextAction.
        debug(
          'queue',
          `Not deferring action ${action.type} - part of potential new root ${actionUltimateRootId}, no current lock.`,
        );
        return false;
      } else {
        // This is a non-thunk action. Let's check if there are any pending/active thunks.
        const allThunks = thunkTracker.getAllThunks();
        const hasPendingOrActiveThunks = allThunks.some(
          (t) => t.state === ThunkState.PENDING || t.state === ThunkState.EXECUTING,
        );

        if (hasPendingOrActiveThunks) {
          debug('queue', `Deferring non-thunk action ${action.type} - thunks are active or pending.`);
          return true;
        }

        // No thunks active or pending, non-thunk action can proceed.
        debug('queue', `Not deferring non-thunk action ${action.type} - no active/pending thunks.`);
        return false;
      }
    }
  }

  /**
   * Find the index of the next action that can be processed
   * Returns -1 if all actions are deferred
   */
  private findProcessableActionIndex(): number {
    // If we have a currently processing root thunk, prioritize actions from that thunk tree first
    if (this.currentProcessingRootThunkId) {
      // First pass: Look for actions that belong to the current root thunk
      for (let i = 0; i < this.actionQueue.length; i++) {
        const queuedAction = this.actionQueue[i];
        if (queuedAction.action.__thunkParentId) {
          const actionRootId = thunkTracker.getUltimateRootParent(queuedAction.action.__thunkParentId);
          if (actionRootId === this.currentProcessingRootThunkId) {
            debug(
              'queue',
              `Found action ${queuedAction.action.type} at index ${i} belonging to current root thunk ${this.currentProcessingRootThunkId}`,
            );
            return i;
          }
        }
      }

      // If we didn't find any actions belonging to the current root thunk but the thunk is complete, release the lock
      if (thunkTracker.isThunkTreeComplete(this.currentProcessingRootThunkId)) {
        // Double-check there are no pending actions for this thunk tree in the queue
        const pendingActionsForThisThunk = this.actionQueue.some((queuedAction) => {
          if (queuedAction.action.__thunkParentId) {
            const actionRootId = thunkTracker.getUltimateRootParent(queuedAction.action.__thunkParentId);
            return actionRootId === this.currentProcessingRootThunkId;
          }
          return false;
        });

        if (!pendingActionsForThisThunk) {
          debug(
            'queue',
            `Root thunk ${this.currentProcessingRootThunkId} is complete and has no more actions in queue. Releasing lock.`,
          );
          this.currentProcessingRootThunkId = undefined;
          // Now fall through to check for the next action without a lock
        } else {
          debug(
            'queue',
            `Root thunk ${this.currentProcessingRootThunkId} is complete but still has pending actions in queue. Keeping lock.`,
          );
          // Keep the lock until all actions for this thunk are processed
          return -1;
        }
      } else {
        // If the thunk is not complete but has no actions in the queue, all actions are deferred
        debug(
          'queue',
          `Root thunk ${this.currentProcessingRootThunkId} is still running but has no actions in queue. All actions deferred.`,
        );
        return -1;
      }
    }

    // No current lock or we just released it - standard processing order
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

    const actionIndex = this.findProcessableActionIndex();
    if (actionIndex === -1) {
      return;
    }

    const queuedAction = this.actionQueue[actionIndex];

    // Lock to this action's root thunk if no lock is currently active
    if (!this.currentProcessingRootThunkId && queuedAction.action.__thunkParentId) {
      let rootId = thunkTracker.getUltimateRootParent(queuedAction.action.__thunkParentId);
      if (!rootId && thunkTracker.getThunkRecord(queuedAction.action.__thunkParentId)) {
        rootId = queuedAction.action.__thunkParentId; // Treat direct parent as root if no further parent found
      }
      if (rootId) {
        this.currentProcessingRootThunkId = rootId;
        debug(
          'queue',
          `Locked processing to root thunk: ${this.currentProcessingRootThunkId} for action ${queuedAction.action.type}`,
        );
      }
    }

    // Now that locking is potentially set, remove from queue and process
    this.actionQueue.splice(actionIndex, 1);
    debug(
      'queue',
      `Processing action: ${queuedAction.action.type} (id: ${queuedAction.action.id}) from window ${queuedAction.sourceWindowId}`,
    );

    try {
      await this.actionProcessor(queuedAction.action);
      debug('queue', `Action ${queuedAction.action.type} processed successfully`);
      queuedAction.onComplete?.();
    } catch (error) {
      debug('queue:error', `Error processing action ${queuedAction.action.type}: ${error as string}`);
    }

    // Check if this root thunk is now complete after processing this action
    if (this.currentProcessingRootThunkId && thunkTracker.isThunkTreeComplete(this.currentProcessingRootThunkId)) {
      // Double-check there are no pending actions for this thunk in the queue
      const pendingActionsForThisThunk = this.actionQueue.some((qAction) => {
        if (qAction.action.__thunkParentId) {
          const actionRootId = thunkTracker.getUltimateRootParent(qAction.action.__thunkParentId);
          return actionRootId === this.currentProcessingRootThunkId;
        }
        return false;
      });

      if (!pendingActionsForThisThunk) {
        debug(
          'queue',
          `Root thunk tree for ${this.currentProcessingRootThunkId} completed after action. Unlocking queue for next potential root.`,
        );
        this.currentProcessingRootThunkId = undefined;

        // Explicitly call processQueue to ensure immediate processing of next root's actions
        this.processingScheduled = false; // Reset the flag to allow immediate reprocessing
        this.processQueue();
        return; // Return early since we're already processing the queue
      }
    }

    // If we have more actions to process, continue
    if (this.actionQueue.length > 0) {
      // Add a microtask delay to allow other events (like thunk completion state changes) to be processed
      Promise.resolve()
        .then(() => this.processNextAction())
        .catch((err) => {
          debug('queue:error', `Error in microtask continuation of processNextAction: ${err as string}`);
        });
    } else if (this.currentProcessingRootThunkId) {
      // Queue is empty, but we might still be locked to a root thunk that is finishing up (e.g. no more actions but children still running)
      // The onStateChange handler will eventually unlock if this is the case.
      debug(
        'queue',
        `Queue empty, but still locked to root thunk ${this.currentProcessingRootThunkId}. Waiting for its completion.`,
      );
    }
  }

  /**
   * Enqueue an action for processing
   */
  public enqueueAction(action: Action, sourceWindowId: number, parentThunkId?: string): void {
    if (parentThunkId) {
      action.__thunkParentId = parentThunkId;
    }
    action.__sourceWindowId = sourceWindowId; // Ensure sourceWindowId is on the action itself for shouldDeferAction

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
    if (this.actionQueue.length === 0 && !this.currentProcessingRootThunkId) {
      // If queue is empty AND we are not waiting for a root thunk to complete, nothing to do.
      // If currentProcessingRootThunkId is set, even with an empty queue, it means we are waiting for that thunk tree to fully complete.
      debug('queue', 'Action queue is empty and no root thunk is locked, nothing to process');
      return;
    }
    debug(
      'queue',
      `Processing queue. Actions: ${this.actionQueue.length}, Locked Root: ${this.currentProcessingRootThunkId || 'none'}`,
    );
    this.actionQueue.forEach((queuedAction, index) => {
      debug(
        'queue',
        `Queue position ${index}: ${queuedAction.action.type} (id: ${queuedAction.action.id}) from window ${queuedAction.sourceWindowId}`,
      );
    });

    // Avoid re-entrant calls if already processing or about to process via microtask
    // Basic re-entrancy guard, could be more sophisticated if needed.
    if (this.processingScheduled) return;
    this.processingScheduled = true;

    Promise.resolve()
      .then(async () => {
        await this.processNextAction();
      })
      .catch((error) => {
        debug('queue:error', `Error in processQueue's call to processNextAction: ${error as string}`);
      })
      .finally(() => {
        this.processingScheduled = false;
      });
  }
  private processingScheduled = false; // Re-entrancy guard for processQueue

  /**
   * Add an action to the queue and process it
   */
  public queueAction(action: Action, sourceWindowId: number, onComplete?: () => void): void {
    if (!this.actionProcessor) {
      debug('queue:error', 'No action processor available, action will be dropped');
      return;
    }

    // Check if this is a force action that should bypass the queue
    if (action.__force === true) {
      debug('queue', `Processing forced action ${action.type} immediately, bypassing queue`);
      this.actionProcessor(action)
        .then(() => {
          onComplete?.();
        })
        .catch((err) => {
          debug('queue:error', `Error processing forced action ${action.type}: ${err as string}`);
        });
      return;
    }

    // Regular (non-forced) action processing through queue
    debug('queue', `Queueing action: ${action.type} (id: ${action.id}) from window ${sourceWindowId}`);

    const queuedAction: QueuedAction = {
      action,
      sourceWindowId,
      receivedTime: Date.now(),
      onComplete,
    };

    this.actionQueue.push(queuedAction);

    // Trigger queue processing
    this.processQueue();
  }
}

export const actionQueue = new ActionQueueManager();
