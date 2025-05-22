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
        // this.completeThunk(thunkId); // Original completeThunk logic is now effectively part of this handler

        // New logic: Check if the completed/failed thunk was the one we were locking to
        if (this.currentProcessingRootThunkId && thunkTracker.isThunkTreeComplete(this.currentProcessingRootThunkId)) {
          debug('queue', `Root thunk tree for ${this.currentProcessingRootThunkId} is now complete. Unlocking queue.`);
          this.currentProcessingRootThunkId = undefined;
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
   * Determine if an action should be processed now or queued
   */
  private shouldDeferAction(action: Action, sourceWindowId: number): boolean {
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
        // This is a non-thunk action. Defer it if ANY thunk is active or pending, to prioritize thunk work.
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
    if (!this.currentProcessingRootThunkId) {
      const actionThunkParentId = queuedAction.action.__thunkParentId;
      if (actionThunkParentId) {
        let rootId = thunkTracker.getUltimateRootParent(actionThunkParentId);
        if (!rootId && thunkTracker.getThunkRecord(actionThunkParentId)) {
          rootId = actionThunkParentId; // Treat direct parent as root if no further parent found
        }
        if (rootId) {
          this.currentProcessingRootThunkId = rootId;
          debug(
            'queue',
            `Locked processing to root thunk: ${this.currentProcessingRootThunkId} for action ${queuedAction.action.type}`,
          );
        }
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

    // If the current root thunk tree is now complete, unlock and immediately reprocess for next root thunk.
    if (this.currentProcessingRootThunkId && thunkTracker.isThunkTreeComplete(this.currentProcessingRootThunkId)) {
      debug(
        'queue',
        `Root thunk tree for ${this.currentProcessingRootThunkId} completed after action. Unlocking queue for next potential root.`,
      );
      this.currentProcessingRootThunkId = undefined;
      // No need to call processQueue() here, it will be called by the onStateChange listener or the loop below
    }

    if (this.actionQueue.length > 0) {
      // Add a microtask delay to allow other events (like thunk completion state changes) to be processed
      // before potentially starting the next action from the same thunk tree or a new one.
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
}

export const actionQueue = new ActionQueueManager();
