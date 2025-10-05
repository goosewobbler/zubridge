import { EventEmitter } from 'node:events';
import type { Action } from '@zubridge/types';
import { debug } from '@zubridge/utils';
import { ThunkPriority } from '../../constants.js';
import type { ThunkAction, ThunkTask } from '../../types/thunk.js';
import type { ActionProcessor } from '../processing/ActionProcessor.js';
import type { ThunkScheduler } from '../scheduling/ThunkScheduler.js';
import type { ThunkOptions } from '../Thunk.js';
import { Thunk, ThunkState } from '../Thunk.js';
import type { StateUpdateTracker } from '../tracking/StateUpdateTracker.js';

/**
 * Thunk action type enum
 */
export enum ThunkActionType {
  START = 'THUNK_START',
  ACTION = 'THUNK_ACTION',
  END = 'THUNK_END',
}

/**
 * Events emitted by ThunkLifecycleManager
 */
export enum ThunkManagerEvent {
  THUNK_REGISTERED = 'thunk:registered',
  THUNK_STARTED = 'thunk:started',
  THUNK_COMPLETED = 'thunk:completed',
  THUNK_FAILED = 'thunk:failed',
  ROOT_THUNK_CHANGED = 'thunk:root:changed',
  ROOT_THUNK_COMPLETED = 'thunk:root:completed',
}

/**
 * Handle for a registered thunk
 */
export interface ThunkHandle {
  /**
   * Unique ID of the thunk
   */
  id: string;
}

/**
 * Manages thunk lifecycle: registration, execution, and completion
 */
export class ThunkLifecycleManager extends EventEmitter {
  /**
   * Map of registered thunks by ID
   */
  private thunks = new Map<string, Thunk>();

  /**
   * Current active root thunk ID
   */
  private rootThunkId?: string;

  /**
   * Tracked tasks for each thunk
   */
  private thunkTasks: Map<string, { canRunConcurrently: boolean }> = new Map();

  /**
   * Thunk results by ID
   */
  private thunkResults = new Map<string, unknown>();

  /**
   * Thunk errors by ID
   */
  private thunkErrors = new Map<string, Error>();

  constructor(
    private scheduler: ThunkScheduler,
    private actionProcessor: ActionProcessor,
    private stateUpdateTracker: StateUpdateTracker,
  ) {
    super();

    // Listen to action completion events
    this.actionProcessor.on('actionComplete', (actionId: string) => {
      const completedThunkIds = this.actionProcessor.handleActionComplete(actionId, this.thunks);
      for (const thunkId of completedThunkIds) {
        this.completeThunk(thunkId);
      }
    });
  }

  /**
   * Register a thunk for future execution
   */
  registerThunk(
    thunkAction: ThunkAction,
    task?: ThunkTask,
    _priority: ThunkPriority = ThunkPriority.NORMAL,
  ): ThunkHandle {
    const thunkOptions: ThunkOptions = {
      id: thunkAction.__id, // Action uses __id property for the action ID
      sourceWindowId: 0, // Will be set by caller
      source: 'main',
      parentId: thunkAction.parentId,
    };
    const thunk = new Thunk(thunkOptions);
    this.thunks.set(thunk.id, thunk);
    this.emit(ThunkManagerEvent.THUNK_REGISTERED, thunk);

    if (task) {
      this.thunkTasks.set(thunk.id, { canRunConcurrently: task.canRunConcurrently ?? false });
    }

    return { id: thunk.id };
  }

  /**
   * Mark a thunk as executing
   */
  executeThunk(thunkId: string): void {
    const thunk = this.thunks.get(thunkId);
    if (!thunk) {
      debug('thunk', `Thunk ${thunkId} not found`);
      return;
    }

    // Set as root thunk if none is currently active
    if (!this.rootThunkId) {
      this.rootThunkId = thunkId;
      this.emit(ThunkManagerEvent.ROOT_THUNK_CHANGED, thunkId);
      debug('thunk', `Root thunk changed to: ${thunkId}`);
    }

    thunk.activate();
    this.emit(ThunkManagerEvent.THUNK_STARTED, thunk);
    debug('thunk', `Thunk ${thunkId} started executing`);
  }

  /**
   * Directly complete a thunk when all actions are finished
   */
  completeThunk(thunkId: string, result?: unknown): void {
    const thunk = this.thunks.get(thunkId);
    if (!thunk) {
      debug('thunk', `Thunk ${thunkId} not found for completion`);
      return;
    }

    if (thunk.state === ThunkState.COMPLETED) {
      debug('thunk', `Thunk ${thunkId} is already completed`);
      return;
    }

    if (result !== undefined) {
      this.thunkResults.set(thunkId, result);
    }

    const pendingActions = this.actionProcessor.getPendingActions(thunkId);
    if (!pendingActions || pendingActions.size === 0) {
      debug('thunk', `Thunk ${thunkId} has no pending actions, completing immediately`);
      this.finalizeThunkCompletion(thunkId);
    } else {
      debug('thunk', `Thunk ${thunkId} still has ${pendingActions.size} pending actions`);
      // Store a marker that this thunk is ready to complete when actions finish
      this.thunkResults.set(`${thunkId}:pendingCompletion`, true);
    }
  }

  /**
   * Actually complete the thunk after all its actions are done
   */
  private finalizeThunkCompletion(thunkId: string): void {
    debug('thunk', `Finalizing completion for thunk ${thunkId}`);

    const thunk = this.thunks.get(thunkId);
    if (!thunk) {
      debug('thunk', `Thunk ${thunkId} not found during finalization`);
      return;
    }

    const pendingActions = this.actionProcessor.getPendingActions(thunkId);
    if (pendingActions && pendingActions.size > 0) {
      debug(
        'thunk',
        `Thunk ${thunkId} still has ${pendingActions.size} pending actions, deferring completion`,
      );
      return;
    }

    // Mark thunk as completed
    thunk.complete();
    this.emit(ThunkManagerEvent.THUNK_COMPLETED, thunk);

    // Clean up the pending completion marker
    this.thunkResults.delete(`${thunkId}:pendingCompletion`);

    // Clean up action tracking
    this.actionProcessor.cleanupThunkActions(thunkId);

    // Check if this was the root thunk
    if (this.rootThunkId === thunkId) {
      debug('thunk', `Root thunk ${thunkId} completed`);
      this.emit(ThunkManagerEvent.ROOT_THUNK_COMPLETED, thunk);
      this.rootThunkId = undefined;
      this.emit(ThunkManagerEvent.ROOT_THUNK_CHANGED, undefined);
    }

    // Trigger scheduler to process next items in queue
    this.scheduler.processQueue();

    // Try final cleanup (will only clean up if no pending state updates)
    this.tryFinalCleanup(thunkId);
  }

  /**
   * Try to do final cleanup of a completed thunk if it has no pending state updates
   */
  private tryFinalCleanup(thunkId: string): void {
    const thunk = this.thunks.get(thunkId);
    if (!thunk || thunk.state !== ThunkState.COMPLETED) {
      return;
    }

    // Check if the thunk has pending state updates
    const hasPendingUpdates = this.stateUpdateTracker.hasPendingStateUpdates(thunkId);

    if (!hasPendingUpdates) {
      // Defer cleanup to next tick to allow any immediate state update tracking
      // This handles the case where completeThunk() is called immediately before trackStateUpdateForThunk()
      setImmediate(() => {
        // Double-check that there are still no pending state updates
        const stillNoPendingUpdates = this.stateUpdateTracker.hasPendingStateUpdates(thunkId);
        if (!stillNoPendingUpdates) {
          debug(
            'thunk',
            `Final cleanup for thunk ${thunkId} - no pending state updates after defer`,
          );
          this.cleanupThunk(thunkId);
        } else {
          debug('thunk', `Thunk ${thunkId} now has pending state updates, cleanup canceled`);
        }
      });
    } else {
      debug('thunk', `Thunk ${thunkId} still has pending state updates, deferring cleanup`);
    }
  }

  /**
   * Mark a thunk as failed
   */
  failThunk(thunkId: string, error?: Error): void {
    const errorMsg = error?.message || 'Unknown error';
    debug('thunk', `Failing thunk ${thunkId}: ${errorMsg}`);

    const thunk = this.thunks.get(thunkId);
    if (!thunk) {
      debug('thunk', `Thunk ${thunkId} not found`);
      return;
    }

    thunk.fail();
    if (error) {
      this.thunkErrors.set(thunkId, error);
      this.emit(ThunkManagerEvent.THUNK_FAILED, thunk, error);
    } else {
      this.emit(ThunkManagerEvent.THUNK_FAILED, thunk);
    }

    // Clean up action tracking
    this.actionProcessor.cleanupThunkActions(thunkId);

    // Check if this was the root thunk
    if (this.rootThunkId === thunkId) {
      debug('thunk', `Root thunk ${thunkId} failed`);
      this.emit(ThunkManagerEvent.ROOT_THUNK_COMPLETED, thunk);
      this.rootThunkId = undefined;
      this.emit(ThunkManagerEvent.ROOT_THUNK_CHANGED, undefined);
    }
  }

  /**
   * Get all active thunks for broadcasting
   */
  getActiveThunksSummary(): Array<{ id: string; state: ThunkState; task?: ThunkTask }> {
    return Array.from(this.thunks.values())
      .filter((thunk) => thunk.state === ThunkState.EXECUTING)
      .map((thunk) => ({
        id: thunk.id,
        state: thunk.state,
        task: undefined, // Task information not stored in Thunk class
      }));
  }

  /**
   * Check if we can process an action immediately or need to queue it
   */
  canProcessActionImmediately(action: Action): boolean {
    if (action.__bypassThunkLock) {
      return true;
    }

    const isIdle = this.scheduler.getQueueStatus().isIdle;
    debug('thunk', `Checking if action can be processed immediately. Scheduler idle: ${isIdle}`);
    return isIdle;
  }

  /**
   * Get the current root thunk ID
   */
  getCurrentRootThunkId(): string | undefined {
    return this.rootThunkId;
  }

  /**
   * Check if a thunk exists with the given ID
   */
  hasThunk(thunkId: string): boolean {
    return this.thunks.has(thunkId);
  }

  /**
   * Check if a thunk is currently active
   */
  isThunkActive(thunkId: string): boolean {
    const thunk = this.thunks.get(thunkId);
    return thunk ? thunk.state === ThunkState.EXECUTING : false;
  }

  /**
   * Check if a thunk is fully complete (including all state updates acknowledged)
   */
  isThunkFullyComplete(thunkId: string): boolean {
    const thunk = this.thunks.get(thunkId);
    if (!thunk) {
      debug('thunk', `Thunk ${thunkId} not found`);
      return false;
    }

    if (thunk.state !== ThunkState.COMPLETED) {
      return false;
    }

    // Check if there are pending state updates
    const hasPendingUpdates = this.stateUpdateTracker.hasPendingStateUpdates(thunkId);
    if (hasPendingUpdates) {
      debug('thunk', `Thunk ${thunkId} has pending state updates, not fully complete`);
      return false;
    }

    return true;
  }

  /**
   * Get thunk by ID
   */
  getThunk(thunkId: string): Thunk | undefined {
    return this.thunks.get(thunkId);
  }

  /**
   * Get thunk result
   */
  getThunkResult(thunkId: string): unknown {
    return this.thunkResults.get(thunkId);
  }

  /**
   * Get thunk error
   */
  getThunkError(thunkId: string): Error | undefined {
    return this.thunkErrors.get(thunkId);
  }

  /**
   * Clean up a specific thunk
   */
  private cleanupThunk(thunkId: string): void {
    debug('thunk', `Cleaning up thunk ${thunkId}`);
    this.thunks.delete(thunkId);
    this.thunkTasks.delete(thunkId);
    this.thunkResults.delete(thunkId);
    this.thunkErrors.delete(thunkId);
    this.actionProcessor.cleanupThunkActions(thunkId);
  }

  /**
   * Force cleanup of completed thunks for memory management
   * This is a safety method to prevent unbounded growth
   */
  forceCleanupCompletedThunks(): void {
    debug('thunk', 'Forcing cleanup of all completed thunks');

    const completedThunkIds: string[] = [];
    for (const [thunkId, thunk] of this.thunks) {
      if (thunk.state === ThunkState.COMPLETED || thunk.state === ThunkState.FAILED) {
        completedThunkIds.push(thunkId);
      }
    }

    for (const thunkId of completedThunkIds) {
      this.cleanupThunk(thunkId);
    }

    debug('thunk', `Cleaned up ${completedThunkIds.length} completed thunks`);
  }

  /**
   * Clear all thunks and state
   */
  clear(): void {
    this.thunks.clear();
    this.thunkTasks.clear();
    this.thunkResults.clear();
    this.thunkErrors.clear();
    this.rootThunkId = undefined;
    this.actionProcessor.clear();
  }
}
