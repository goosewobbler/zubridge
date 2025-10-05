import { EventEmitter } from 'node:events';
import type { Action } from '@zubridge/types';
import { debug } from '@zubridge/utils';
import type { ThunkScheduler } from '../scheduling/ThunkScheduler.js';
import { type Thunk, ThunkState } from '../Thunk.js';

/**
 * Processes thunk actions and manages action lifecycle
 */
export class ActionProcessor extends EventEmitter {
  /**
   * Tracked actions for each thunk
   */
  private thunkActions: Map<string, Set<string>> = new Map();

  /**
   * Currently processing thunk action ID (for state update tracking)
   */
  private currentThunkActionId?: string;

  private stateManager?: { processAction: (action: Action) => unknown };

  constructor(private scheduler: ThunkScheduler) {
    super();
  }

  /**
   * Set the state manager for processing actions
   */
  setStateManager(stateManager: { processAction: (action: Action) => unknown } | null | undefined) {
    this.stateManager = stateManager || undefined;
  }

  /**
   * Process a thunk action
   */
  async processAction(
    thunkId: string,
    action: Action,
    thunk: Thunk,
    onActionComplete: (actionId: string) => void,
  ): Promise<void> {
    if (!thunkId) {
      throw new Error('thunkId is required for processAction');
    }

    debug('thunk', `Processing action ${action.type} for thunk ${thunkId}`);

    // Add a unique ID to the action for tracking
    if (!action.__id) {
      action.__id = `${thunkId}_action_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    const thunk_ = thunk;
    if (!thunk_) {
      debug('thunk', `Thunk ${thunkId} not found, cannot process action`);
      return;
    }

    if (thunk_.state === ThunkState.COMPLETED || thunk_.state === ThunkState.FAILED) {
      debug('thunk', `Thunk ${thunkId} is already completed/failed, ignoring action`);
      return;
    }

    // Track the action for this thunk
    if (!this.stateManager) {
      throw new Error('State manager not set');
    }

    let thunkActionSet = this.thunkActions.get(thunkId);
    if (!thunkActionSet) {
      thunkActionSet = new Set();
      this.thunkActions.set(thunkId, thunkActionSet);
    }

    // Set current thunk action ID for state update tracking
    this.currentThunkActionId = action.__id;

    try {
      // Process the action through the state manager
      // This will trigger state updates that will be tracked
      const result = this.stateManager.processAction(action);

      // Handle async results (like promises or completable results)
      if (result && typeof result === 'object') {
        // Check for a completion promise (completable result pattern)
        if ('completion' in result) {
          const completableResult = result as { completion?: unknown };
          const completion = completableResult.completion as Promise<unknown>;
          if (completableResult.completion && typeof completion.then === 'function') {
            // Wait for the async operation to complete
            await completion;
          }
        } else if (typeof (result as Promise<unknown>).then === 'function') {
          // Handle direct promise
          await (result as Promise<unknown>);
        }
      }

      // Mark action as completed
      if (action.__id) {
        thunkActionSet.add(action.__id);
        onActionComplete(action.__id);
      }
    } catch (error) {
      debug('thunk', `Error processing action for thunk ${thunkId}:`, error);
      // Still mark the action as "completed" (even if it failed) so thunk can finish
      if (action.__id) {
        thunkActionSet.add(action.__id);
        onActionComplete(action.__id);
      }
      throw error;
    } finally {
      // Clear current thunk action ID
      this.currentThunkActionId = undefined;
    }
  }

  /**
   * Handle a completed action
   * This helps track when all actions for a thunk have completed
   */
  handleActionComplete(actionId: string, thunks: Map<string, Thunk>): string[] {
    const completedThunkIds: string[] = [];

    // Find which thunk(s) this action belongs to
    for (const [thunkId, actions] of this.thunkActions.entries()) {
      if (actions.has(actionId)) {
        debug('thunk', `Action ${actionId} completed for thunk ${thunkId}`);

        // Remove the action from pending
        actions.delete(actionId);

        // Check if this thunk has any remaining actions
        if (actions.size === 0) {
          const thunk = thunks.get(thunkId);
          if (thunk && thunk.state === ThunkState.EXECUTING) {
            debug('thunk', `All actions completed for thunk ${thunkId}, marking as completable`);
            completedThunkIds.push(thunkId);
          }
        }
        break;
      }
    }

    return completedThunkIds;
  }

  /**
   * Check if an action requires queue or can run immediately
   */
  requiresQueue(action: Action): boolean {
    return !action.__bypassThunkLock;
  }

  /**
   * Get the currently processing thunk action ID
   */
  getCurrentThunkActionId(): string | undefined {
    return this.currentThunkActionId;
  }

  /**
   * Set the currently processing thunk action ID
   */
  setCurrentThunkActionId(actionId: string | undefined): void {
    this.currentThunkActionId = actionId;
  }

  /**
   * Clean up actions for a thunk
   */
  cleanupThunkActions(thunkId: string): void {
    this.thunkActions.delete(thunkId);
  }

  /**
   * Get pending actions for a thunk
   */
  getPendingActions(thunkId: string): Set<string> | undefined {
    return this.thunkActions.get(thunkId);
  }

  /**
   * Check if a thunk has pending actions
   */
  hasPendingActions(thunkId: string): boolean {
    const actions = this.thunkActions.get(thunkId);
    return actions ? actions.size > 0 : false;
  }

  /**
   * Clear all action tracking data
   */
  clear(): void {
    this.thunkActions.clear();
    this.currentThunkActionId = undefined;
  }

  /**
   * Get the scheduler instance
   */
  getScheduler(): ThunkScheduler {
    return this.scheduler;
  }
}
