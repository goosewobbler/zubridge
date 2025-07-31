import { EventEmitter } from 'node:events';
import { debug } from '@zubridge/core';
import { type Action } from '@zubridge/types';
import { Thunk, ThunkState } from './Thunk.js';
import { ThunkPriority } from '../constants.js';
import { ThunkScheduler } from './ThunkScheduler.js';
import { ThunkAction, ThunkTask } from '../types/thunk.js';

/**
 * Thunk action type enum
 */
export enum ThunkActionType {
  START = 'THUNK_START',
  ACTION = 'THUNK_ACTION',
  END = 'THUNK_END',
}

/**
 * Events emitted by ThunkManager
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
 * Manager for thunk registration and execution
 */
export class ThunkManager extends EventEmitter {
  /**
   * Map of registered thunks by ID
   */
  private thunks = new Map<string, Thunk>();

  /**
   * Current active root thunk ID
   */
  private rootThunkId?: string;

  /**
   * Task scheduler for execution control
   */
  private scheduler: ThunkScheduler;

  /**
   * Tracked actions for each thunk
   */
  private thunkActions: Map<string, Set<string>> = new Map();

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

  private stateManager?: { processAction: (action: Action) => any };

  constructor(scheduler: ThunkScheduler) {
    super();
    this.scheduler = scheduler;
  }

  /**
   * Register a thunk for future execution
   */
  registerThunk(
    thunkId: string,
    thunk: Thunk,
    options?: { parentId?: string; windowId?: number; bypassThunkLock?: boolean },
  ): void {
    debug('thunk', `Registering thunk: id=${thunkId}, bypassThunkLock=${options?.bypassThunkLock}`);

    // Add to registry
    this.thunks.set(thunkId, thunk);

    // Add task tracking for this thunk
    this.thunkTasks.set(thunkId, { canRunConcurrently: !!options?.bypassThunkLock });

    // Emit registration event
    this.emit(ThunkManagerEvent.THUNK_REGISTERED, thunk);
  }

  /**
   * Mark a thunk as executing
   */
  markThunkExecuting(thunkId: string, windowId?: number): void {
    debug('thunk', `Marking thunk as executing: id=${thunkId}`);

    const thunk = this.thunks.get(thunkId);
    if (!thunk) {
      debug('thunk-debug', `Cannot execute thunk ${thunkId} - not found`);
      return;
    }

    // Add debug logs to track thunk state
    debug('thunk-debug', `Thunk ${thunkId} state before activation: ${thunk.state}`);
    debug('thunk-debug', `Thunk ${thunkId} has ${this.thunkActions.get(thunkId)?.size || 0} registered actions`);

    // Update thunk state
    thunk.activate();
    debug('thunk-debug', `Thunk ${thunkId} state after activation: ${thunk.state}`);

    // Update root thunk if needed
    if (!this.rootThunkId) {
      this.rootThunkId = thunkId;
      debug('thunk-debug', `Set root thunk to ${thunkId}`);
      this.emit(ThunkManagerEvent.ROOT_THUNK_CHANGED, thunk);
    }

    // Emit started event
    this.emit(ThunkManagerEvent.THUNK_STARTED, thunk);
  }
  /**
   * Directly complete a thunk when all actions are finished
   */
  completeThunk(thunkId: string, result?: unknown): void {
    debug('thunk', `Completing thunk: id=${thunkId}`);

    const thunk = this.thunks.get(thunkId);
    if (!thunk) {
      debug('thunk-debug', `Cannot complete thunk ${thunkId} - not found`);
      return;
    }

    // Add debug logs to track thunk state
    debug('thunk-debug', `Thunk ${thunkId} state before completion: ${thunk.state}`);
    debug('thunk-debug', `Thunk ${thunkId} has ${this.thunkActions.get(thunkId)?.size || 0} registered actions`);
    debug('thunk-debug', `Root thunk is currently: ${this.rootThunkId || 'none'}`);

    // Check if the thunk is already completed
    if (thunk.state === ThunkState.COMPLETED) {
      debug('thunk-debug', `Thunk ${thunkId} already completed, ignoring completion request`);
      return;
    }

    // Store the result if provided
    if (result !== undefined) {
      this.thunkResults.set(thunkId, result);
    }

    // Check if there are any pending actions for this thunk
    const pendingActions = this.thunkActions.get(thunkId);
    if (!pendingActions || pendingActions.size === 0) {
      debug('thunk-debug', `Thunk ${thunkId} has no pending actions, finalizing completion now`);
      this.finalizeThunkCompletion(thunkId);
    } else {
      debug('thunk-debug', `Thunk ${thunkId} has ${pendingActions.size} pending actions, deferring completion`);
    }
  }

  /**
   * Actually complete the thunk after all its actions are done
   */
  private finalizeThunkCompletion(thunkId: string): void {
    debug('thunk', `Finalizing thunk completion: id=${thunkId}`);

    const thunk = this.thunks.get(thunkId);
    if (!thunk) {
      debug('thunk-debug', `Cannot finalize thunk ${thunkId} - not found`);
      return;
    }

    // Double check if there are any pending actions for this thunk
    const pendingActions = this.thunkActions.get(thunkId);
    if (pendingActions && pendingActions.size > 0) {
      debug('thunk-debug', `Thunk ${thunkId} still has ${pendingActions.size} pending actions, deferring completion`);
      return;
    }

    // Now set the state to COMPLETED
    thunk.complete();

    // Clean up thunk tracking
    this.thunkActions.delete(thunkId);
    this.thunkTasks.delete(thunkId);

    // Remove the task from scheduler
    this.scheduler.removeTasks(thunkId);

    // Emit completed event
    this.emit(ThunkManagerEvent.THUNK_COMPLETED, thunk);

    // Update root thunk if needed
    if (this.rootThunkId === thunkId) {
      this.rootThunkId = undefined;
      this.emit(ThunkManagerEvent.ROOT_THUNK_COMPLETED, thunk);
    }

    // Schedule queue processing to make sure any pending tasks are handled
    this.scheduler.processQueue();
  }

  /**
   * Mark a thunk as failed
   */
  markThunkFailed(thunkId: string, error: Error): void {
    debug('thunk', `Marking thunk as failed: id=${thunkId}, error=${error.message}`);

    const thunk = this.thunks.get(thunkId);
    if (!thunk) {
      debug('thunk-debug', `Cannot fail thunk ${thunkId} - not found`);
      return;
    }

    // Update thunk state
    thunk.fail();

    // Store the error
    this.thunkErrors.set(thunkId, error);

    // Clean up thunk tracking
    this.thunkActions.delete(thunkId);
    this.thunkTasks.delete(thunkId);

    // Emit failed event
    this.emit(ThunkManagerEvent.THUNK_FAILED, thunk);

    // Update root thunk if needed
    if (this.rootThunkId === thunkId) {
      this.rootThunkId = undefined;
      this.emit(ThunkManagerEvent.ROOT_THUNK_COMPLETED, thunk);
    }
  }

  /**
   * Get all active thunks for broadcasting
   */
  getActiveThunksSummary(): { version: number; thunks: Array<{ id: string; windowId: number; parentId?: string }> } {
    // Get all running tasks from the scheduler
    const runningTasks = this.scheduler.getRunningTasks();

    // Convert tasks to thunk summaries
    const activeThunks = runningTasks.map((task) => {
      const thunk = this.thunks.get(task.thunkId);
      return {
        id: task.thunkId,
        windowId: thunk?.sourceWindowId || 0,
        parentId: thunk?.parentId,
      };
    });

    return {
      version: Date.now(),
      thunks: activeThunks,
    };
  }

  /**
   * Check if we can process an action immediately or need to queue it
   */
  canProcessAction(action: Action): boolean {
    // Actions with bypassThunkLock can always be processed immediately
    if (action.__bypassThunkLock) {
      debug('thunk-debug', `Action ${action.type} (${action.__id}) has bypassThunkLock, allowing immediate processing`);
      return true;
    }

    // Check scheduler status
    const status = this.scheduler.getQueueStatus();
    const isIdle = status.isIdle;

    if (isIdle) {
      debug('thunk-debug', `Scheduler is idle, allowing action ${action.type} (${action.__id}) to process immediately`);
      return true;
    }

    debug('thunk-debug', `Scheduler is not idle, queueing action ${action.type} (${action.__id})`);
    return false;
  }

  /**
   * Set the state manager for processing actions
   */
  setStateManager(stateManager: { processAction: (action: Action) => any }) {
    this.stateManager = stateManager;
  }

  /**
   * Process a thunk action
   */
  processThunkAction(action: Action): boolean {
    const thunkId = (action as ThunkAction).parentId || action.__thunkParentId;
    if (!thunkId) {
      debug('thunk-debug', `Action ${action.type} has no parentId or __thunkParentId, not a thunk action`);
      return false;
    }

    // Check if action has an ID
    if (!action.__id) {
      debug('thunk-debug', `Action ${action.type} has no __id, cannot process it as a task`);
      return false;
    }

    // Check if thunk exists
    const thunk = this.thunks.get(thunkId);
    if (!thunk) {
      debug('thunk-debug', `Thunk ${thunkId} not found for action ${action.type}`);
      return false;
    }

    // Make sure thunk is in EXECUTING state, not COMPLETED
    if (thunk.state === ThunkState.COMPLETED || thunk.state === ThunkState.FAILED) {
      debug(
        'thunk-debug',
        `Thunk ${thunkId} is already in terminal state (${thunk.state}), ignoring action ${action.type}`,
      );
      return false;
    }

    // Make sure we have a state manager
    if (!this.stateManager) {
      debug('thunk-error', 'No state manager set, cannot process action');
      return false;
    }

    // Add action to list of thunk actions
    let thunkActionSet = this.thunkActions.get(thunkId);
    if (!thunkActionSet) {
      thunkActionSet = new Set<string>();
      this.thunkActions.set(thunkId, thunkActionSet);
    }

    debug('thunk-debug', `Adding action ${action.__id} (${action.type}) to thunk ${thunkId} tracking`);
    thunkActionSet.add(action.__id);

    // Create a ThunkTask for this action
    const taskId = `${thunkId}-${action.__id}`;
    const canRunConcurrently = !!action.__bypassThunkLock; // Use the bypassThunkLock flag

    // Log the scheduling details
    debug(
      'thunk-scheduler',
      `Creating task ${taskId} for action ${action.type} (canRunConcurrently: ${canRunConcurrently})`,
    );

    // Create the task
    const task: ThunkTask = {
      id: taskId,
      thunkId: thunkId,
      priority: ThunkPriority.NORMAL, // Default priority
      canRunConcurrently: canRunConcurrently,
      createdAt: Date.now(),
      handler: async () => {
        debug('thunk-task', `Executing task ${taskId} for action ${action.type}`);
        try {
          // Check if action is still part of thunk's tracked actions
          const actionSet = this.thunkActions.get(thunkId);
          if (!actionSet || !actionSet.has(action.__id!)) {
            debug('thunk-debug', `Action ${action.__id} no longer tracked for thunk ${thunkId}, skipping execution`);
            return null;
          }

          // Process the action using the state manager
          const result = this.stateManager!.processAction(action);

          // If the action returns a promise, await it
          if (result && result.completion && typeof result.completion.then === 'function') {
            await result.completion;
          }

          debug('thunk-task', `Task ${taskId} completed successfully`);
          // Mark action as complete
          if (action.__id) {
            this.handleActionComplete(action.__id);
          }
          return result;
        } catch (error) {
          debug('thunk-task', `Task ${taskId} failed: ${error}`);
          throw error;
        }
      },
    };

    // Enqueue the task in the scheduler
    this.scheduler.enqueue(task);

    // Return true to indicate we've handled this action
    return true;
  }

  /**
   * Handle a completed action
   * This helps track when all actions for a thunk have completed
   */
  handleActionComplete(actionId: string): void {
    // Find which thunk this action belongs to
    for (const [thunkId, actions] of this.thunkActions.entries()) {
      if (actions.has(actionId)) {
        // Remove this action from the tracked actions
        actions.delete(actionId);
        debug(
          'thunk-debug',
          `Action ${actionId} completed and removed from thunk ${thunkId}, ${actions.size} actions remaining`,
        );

        // If actions set is now empty AND this thunk has a pending completion request, finalize it
        if (actions.size === 0 && this.thunkResults.has(`${thunkId}:pendingCompletion`)) {
          debug(
            'thunk-debug',
            `Thunk ${thunkId} has no more pending actions and has a pending completion request, finalizing now`,
          );
          // Remove the pending completion marker
          this.thunkResults.delete(`${thunkId}:pendingCompletion`);
          this.finalizeThunkCompletion(thunkId);
        }

        break;
      }
    }
  }

  /**
   * Check if an action requires queue or can run immediately
   */
  shouldQueueAction(action: Action): boolean {
    return !this.canProcessAction(action);
  }

  /**
   * Get the current root thunk ID
   */
  getRootThunkId(): string | undefined {
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
    return !!thunk && thunk.state !== ThunkState.COMPLETED && thunk.state !== ThunkState.FAILED;
  }

  /**
   * Get the task scheduler instance
   */
  getScheduler(): ThunkScheduler {
    return this.scheduler;
  }
}

// Single global instance of ThunkManager
let thunkManager: ThunkManager | undefined;

/**
 * Get the global ThunkManager instance
 */
export function getThunkManager(): ThunkManager {
  if (!thunkManager) {
    debug('thunk', 'ThunkManager not initialized, creating default instance');
    const scheduler = new ThunkScheduler();
    thunkManager = new ThunkManager(scheduler);
  }
  return thunkManager;
}

/**
 * Initialize the global ThunkManager
 */
export function initThunkManager(scheduler: ThunkScheduler): ThunkManager {
  thunkManager = new ThunkManager(scheduler);
  return thunkManager;
}
