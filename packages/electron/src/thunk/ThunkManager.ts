import type { Action } from '@zubridge/types';
import { EventEmitter } from 'node:events';
import { ThunkPriority } from '../constants.js';
import type { ThunkAction, ThunkTask } from '../types/thunk.js';
import {
  ThunkActionType,
  type ThunkHandle,
  ThunkLifecycleManager,
  ThunkManagerEvent,
} from './lifecycle/ThunkLifecycleManager.js';
import { ActionProcessor } from './processing/ActionProcessor.js';
import type { ThunkScheduler } from './scheduling/ThunkScheduler.js';
import { type Thunk, ThunkState } from './Thunk.js';
import { StateUpdateTracker } from './tracking/StateUpdateTracker.js';

/**
 * Refactored ThunkManager using focused, modular components
 * This is the main coordinator that orchestrates the various thunk management components
 */
export class ThunkManager extends EventEmitter {
  private lifecycleManager: ThunkLifecycleManager;
  private actionProcessor: ActionProcessor;
  private stateUpdateTracker: StateUpdateTracker;

  constructor(scheduler: ThunkScheduler) {
    super();

    // Initialize focused components
    this.stateUpdateTracker = new StateUpdateTracker();
    this.actionProcessor = new ActionProcessor(scheduler);
    this.lifecycleManager = new ThunkLifecycleManager(
      scheduler,
      this.actionProcessor,
      this.stateUpdateTracker,
    );

    // Set up the hasThunk checker for the ActionProcessor

    // Forward events from lifecycle manager
    this.lifecycleManager.on(ThunkManagerEvent.THUNK_REGISTERED, (...args) =>
      this.emit(ThunkManagerEvent.THUNK_REGISTERED, ...args),
    );
    this.lifecycleManager.on(ThunkManagerEvent.THUNK_STARTED, (...args) =>
      this.emit(ThunkManagerEvent.THUNK_STARTED, ...args),
    );
    this.lifecycleManager.on(ThunkManagerEvent.THUNK_COMPLETED, (...args) =>
      this.emit(ThunkManagerEvent.THUNK_COMPLETED, ...args),
    );
    this.lifecycleManager.on(ThunkManagerEvent.THUNK_FAILED, (...args) =>
      this.emit(ThunkManagerEvent.THUNK_FAILED, ...args),
    );
    this.lifecycleManager.on(ThunkManagerEvent.ROOT_THUNK_CHANGED, (...args) =>
      this.emit(ThunkManagerEvent.ROOT_THUNK_CHANGED, ...args),
    );
    this.lifecycleManager.on(ThunkManagerEvent.ROOT_THUNK_COMPLETED, (...args) =>
      this.emit(ThunkManagerEvent.ROOT_THUNK_COMPLETED, ...args),
    );
  }

  // Delegate lifecycle management methods
  registerThunk(thunkAction: ThunkAction, task?: ThunkTask, priority?: ThunkPriority): ThunkHandle;
  // Compatibility overload for tests that use the old signature (thunkId, thunk)
  registerThunk(
    thunkId: string,
    thunk: Thunk,
    task?: ThunkTask,
    priority?: ThunkPriority,
  ): ThunkHandle;
  registerThunk(
    thunkActionOrId: ThunkAction | string,
    taskOrThunk?: ThunkTask | Thunk,
    priorityOrTask?: ThunkPriority | ThunkTask,
    priority: ThunkPriority = ThunkPriority.NORMAL,
  ): ThunkHandle {
    // Handle the old signature for backward compatibility
    if (typeof thunkActionOrId === 'string') {
      const thunkId = thunkActionOrId;
      const thunk = taskOrThunk as Thunk;
      const task = (priorityOrTask as ThunkTask) || undefined;

      // Create a ThunkAction from the thunk - use thunk.id as the __id
      const thunkAction: ThunkAction = {
        __id: thunk.id || thunkId,
        type: 'THUNK',
        parentId: thunk.parentId,
      };

      const handle = this.lifecycleManager.registerThunk(thunkAction, task, priority);

      // Copy initial state from provided thunk to internal thunk if needed
      if (thunk.state && thunk.state !== ThunkState.PENDING) {
        const internalThunk = this.lifecycleManager.getThunk(handle.id);
        if (internalThunk) {
          // Force sync the initial state by calling the appropriate method
          switch (thunk.state) {
            case ThunkState.EXECUTING:
              internalThunk.activate();
              break;
            case ThunkState.COMPLETED:
              internalThunk.complete();
              break;
            case ThunkState.FAILED:
              internalThunk.fail();
              break;
          }
        }
      }

      return handle;
    }

    // Handle the new signature
    return this.lifecycleManager.registerThunk(
      thunkActionOrId as ThunkAction,
      taskOrThunk as ThunkTask,
      (priorityOrTask as ThunkPriority) ?? ThunkPriority.NORMAL,
    );
  }

  executeThunk(thunkId: string): void {
    this.lifecycleManager.executeThunk(thunkId);
  }

  completeThunk(thunkId: string, result?: unknown): void {
    this.lifecycleManager.completeThunk(thunkId, result);
  }

  failThunk(thunkId: string, error: Error): void {
    this.lifecycleManager.failThunk(thunkId, error);
  }

  getActiveThunksSummary(): {
    version: number;
    thunks: Array<{ id: string; windowId: number; parentId?: string }>;
  } {
    const lifecycleSummary = this.lifecycleManager.getActiveThunksSummary();
    // Convert from the lifecycle manager format to the expected IPC format
    const formattedThunks = lifecycleSummary.map((thunkSummary) => {
      const thunk = this.lifecycleManager.getThunk(thunkSummary.id);
      return {
        id: thunkSummary.id,
        windowId: thunk?.sourceWindowId ?? 0,
        parentId: thunk?.parentId,
      };
    });

    return {
      version: Date.now(), // Use timestamp as version for compatibility
      thunks: formattedThunks,
    };
  }

  canProcessActionImmediately(action: Action): boolean {
    return this.lifecycleManager.canProcessActionImmediately(action);
  }

  getCurrentRootThunkId(): string | undefined {
    return this.lifecycleManager.getCurrentRootThunkId();
  }

  // Compatibility method for tests
  getRootThunkId(): string | undefined {
    return this.getCurrentRootThunkId();
  }

  hasThunk(thunkId: string): boolean {
    return this.lifecycleManager.hasThunk(thunkId);
  }

  isThunkActive(thunkId: string): boolean {
    return this.lifecycleManager.isThunkActive(thunkId);
  }

  isThunkFullyComplete(thunkId: string): boolean {
    return this.lifecycleManager.isThunkFullyComplete(thunkId);
  }

  getThunk(thunkId: string): Thunk | undefined {
    return this.lifecycleManager.getThunk(thunkId);
  }

  getThunkResult(thunkId: string): unknown {
    return this.lifecycleManager.getThunkResult(thunkId);
  }

  getThunkError(thunkId: string): Error | undefined {
    return this.lifecycleManager.getThunkError(thunkId);
  }

  forceCleanupCompletedThunks(): void {
    this.lifecycleManager.forceCleanupCompletedThunks();
  }

  // Delegate action processing methods
  setStateManager(
    stateManager: { processAction: (action: Action) => unknown } | null | undefined,
  ): void {
    this.actionProcessor.setStateManager(stateManager);
  }

  async processAction(thunkId: string, action: Action): Promise<void> {
    const thunk = this.lifecycleManager.getThunk(thunkId);
    if (!thunk) {
      throw new Error(`Thunk ${thunkId} not found`);
    }

    return this.actionProcessor.processAction(thunkId, action, thunk, (actionId: string) => {
      // Handle action completion
      const completedThunkIds = this.actionProcessor.handleActionComplete(
        actionId,
        new Map([[thunkId, thunk]]),
      );
      for (const completedThunkId of completedThunkIds) {
        this.lifecycleManager.completeThunk(completedThunkId);
      }
    });
  }

  handleActionComplete(_actionId: string): void {
    // This is handled internally by the ActionProcessor and communicated to LifecycleManager
    // No direct action needed here as the ActionProcessor already calls the completion callback
  }

  requiresQueue(action: Action): boolean {
    return this.actionProcessor.requiresQueue(action);
  }

  getCurrentThunkActionId(): string | undefined {
    return this.actionProcessor.getCurrentThunkActionId();
  }

  setCurrentThunkActionId(actionId: string | undefined): void {
    this.actionProcessor.setCurrentThunkActionId(actionId);
  }

  // Delegate state update tracking methods
  trackStateUpdateForThunk(
    thunkId: string,
    updateId: string,
    subscribedRendererIds: number[],
  ): void {
    this.stateUpdateTracker.trackStateUpdateForThunk(thunkId, updateId, subscribedRendererIds);

    // If a thunk was cleaned up but now has state updates to track,
    // we should ensure it's not fully cleaned up yet.
    // This handles the case where completeThunk() was called before trackStateUpdateForThunk()
    if (!this.lifecycleManager.hasThunk(thunkId)) {
      // The thunk was already cleaned up, but we can't track state updates for a non-existent thunk
      // In this case, we should not track the state update as the thunk is gone
      // However, for backward compatibility with tests, let's allow this scenario
      // and just ensure hasPendingStateUpdates works correctly
    }
  }

  acknowledgeStateUpdate(updateId: string, rendererId: number): boolean {
    const allAcknowledged = this.stateUpdateTracker.acknowledgeStateUpdate(updateId, rendererId);

    // If all acknowledged, check if any thunks can now be cleaned up
    if (allAcknowledged) {
      // Try to cleanup any completed thunks that were waiting for state update acknowledgments
      this.cleanupCompletedThunksWithNoUpdates();
    }

    return allAcknowledged;
  }

  cleanupDeadRenderer(rendererId: number): void {
    this.stateUpdateTracker.cleanupDeadRenderer(rendererId);

    // After cleanup, check if any thunks can now be cleaned up
    this.cleanupCompletedThunksWithNoUpdates();
  }

  cleanupExpiredUpdates(maxAgeMs = 30000): void {
    this.stateUpdateTracker.cleanupExpiredUpdates(maxAgeMs);

    // After cleanup, check if any thunks can now be cleaned up
    this.cleanupCompletedThunksWithNoUpdates();
  }

  /**
   * Helper method to cleanup completed thunks that no longer have pending updates
   */
  private cleanupCompletedThunksWithNoUpdates(): void {
    // Check all completed thunks to see if they can now be cleaned up
    const privateManager = this as unknown as {
      lifecycleManager: {
        thunks: Map<string, Thunk>;
        tryFinalCleanup: (thunkId: string) => void;
      };
    };

    for (const [thunkId, thunk] of privateManager.lifecycleManager.thunks) {
      if (thunk.state === ThunkState.COMPLETED) {
        privateManager.lifecycleManager.tryFinalCleanup(thunkId);
      }
    }
  }

  // Cleanup methods
  clear(): void {
    this.lifecycleManager.clear();
    this.stateUpdateTracker.clear();
  }

  // Compatibility methods for tests - delegate to appropriate components

  /**
   * Mark a thunk as executing (compatibility method)
   */
  markThunkExecuting(thunkId: string): void {
    this.executeThunk(thunkId);
  }

  /**
   * Mark a thunk as failed (compatibility method)
   */
  markThunkFailed(thunkId: string, error: Error): void {
    this.failThunk(thunkId, error);
  }

  /**
   * Check if an action should be queued (compatibility method)
   */
  shouldQueueAction(action: Action): boolean {
    return this.actionProcessor.requiresQueue(action);
  }

  /**
   * Check if an action can be processed (compatibility method)
   */
  canProcessAction(action: Action): boolean {
    return this.canProcessActionImmediately(action);
  }

  /**
   * Get the scheduler instance (compatibility method)
   */
  getScheduler(): ThunkScheduler {
    return this.getTaskScheduler();
  }

  /**
   * Process a thunk action (compatibility method)
   */
  processThunkAction(action: Action): boolean {
    // Check if the action has a valid thunk parent ID
    const parentThunkId = action.__thunkParentId;
    if (!parentThunkId || !this.hasThunk(parentThunkId)) {
      return false;
    }

    // Action can be processed immediately if it doesn't require queueing
    return !this.requiresQueue(action);
  }

  /**
   * Set current thunk action ID (compatibility method)
   */
  setCurrentThunkAction(actionId: string | undefined): void {
    this.actionProcessor.setCurrentThunkActionId(actionId);
  }

  /**
   * Get current active thunk ID (compatibility method)
   */
  getCurrentActiveThunkId(): string | undefined {
    return this.getCurrentRootThunkId();
  }

  /**
   * Cleanup expired state updates (compatibility method)
   */
  cleanupExpiredStateUpdates(maxAgeMs: number): void {
    this.stateUpdateTracker.cleanupExpiredUpdates(maxAgeMs);
  }

  /**
   * Get task scheduler instance
   */
  getTaskScheduler(): ThunkScheduler {
    // Access the scheduler through the actionProcessor
    return this.actionProcessor.getScheduler();
  }
}

// Export the enums and types for compatibility
export { ThunkActionType, ThunkManagerEvent, type ThunkHandle };

// Global instance management (for backward compatibility)
let thunkManager: ThunkManager | undefined;

/**
 * Get the global ThunkManager instance
 */
export function getThunkManager(): ThunkManager {
  if (!thunkManager) {
    throw new Error('ThunkManager not initialized. Call initThunkManager() first.');
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
