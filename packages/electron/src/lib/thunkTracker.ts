import { v4 as uuidv4 } from 'uuid';
import { debug } from '@zubridge/core';

/**
 * Possible states of a thunk during its lifecycle
 */
export enum ThunkState {
  PENDING = 'pending', // Registered but not started execution
  EXECUTING = 'executing', // Currently executing
  COMPLETED = 'completed', // Successfully completed
  FAILED = 'failed', // Failed with an error
}

/**
 * Information about a registered thunk
 */
export interface ThunkRecord {
  id: string; // Unique identifier
  parentId?: string; // Parent thunk ID if this is a nested thunk
  state: ThunkState; // Current execution state
  startTime: number; // When the thunk started executing
  endTime?: number; // When the thunk completed/failed
  childIds: Set<string>; // IDs of child thunks
  pendingChildIds: Set<string>; // IDs of child thunks that haven't completed
  actionIds: Set<string>; // IDs of actions dispatched by this thunk
  error?: Error; // Error if the thunk failed
  result?: unknown; // Result returned by the thunk
  sourceWindowId?: number; // ID of the window that initiated the thunk
}

/**
 * Result from registering a thunk
 */
export interface ThunkHandle {
  thunkId: string; // ID of the registered thunk
  markExecuting: () => void; // Mark thunk as executing
  markCompleted: (result?: unknown) => void; // Mark thunk as completed
  markFailed: (error: Error) => void; // Mark thunk as failed
  addChildThunk: (childId: string) => void; // Register a child thunk
  childCompleted: (childId: string) => void; // Mark a child thunk as completed
  addAction: (actionId: string) => void; // Register an action dispatched by this thunk
  setSourceWindowId: (windowId: number) => void; // Set the source window ID for cross-window coordination
}

/**
 * Callback function type for thunk state changes
 */
export type ThunkStateChangeListener = (thunkId: string, state: ThunkState, info: ThunkRecord) => void;

/**
 * A service that tracks thunk execution, their parent-child relationships,
 * and associated actions without affecting existing functionality
 */
export class ThunkTracker {
  // Map of all registered thunks by ID
  private thunks = new Map<string, ThunkRecord>();

  // Root thunks (those with no parent)
  private rootThunkIds = new Set<string>();

  // Active thunks (those currently executing)
  private activeThunkIds = new Set<string>();

  // Map of thunks by source window ID
  private thunksByWindow = new Map<number, Set<string>>();

  // State change listeners
  private stateChangeListeners: ThunkStateChangeListener[] = [];

  // Global thunk state version - increments on every thunk state change
  private stateVersion: number = 1;

  constructor() {
    debug('core', '[THUNK_TRACKER] Initialized');
  }

  /**
   * Register a new thunk
   */
  public registerThunk(parentId?: string): ThunkHandle {
    const thunkId = uuidv4();
    const startTime = Date.now();

    // Create initial thunk info
    const thunkRecord: ThunkRecord = {
      id: thunkId,
      parentId,
      state: ThunkState.PENDING,
      startTime,
      childIds: new Set<string>(),
      pendingChildIds: new Set<string>(),
      actionIds: new Set<string>(),
    };

    // Add to registry
    this.thunks.set(thunkId, thunkRecord);

    // If this has a parent, update the parent's child lists
    if (parentId && this.thunks.has(parentId)) {
      const parentInfo = this.thunks.get(parentId)!;
      parentInfo.childIds.add(thunkId);
      parentInfo.pendingChildIds.add(thunkId);
      debug('core', `Added thunk ${thunkId} as child of ${parentId}`);
    } else {
      // This is a root thunk
      this.rootThunkIds.add(thunkId);
      debug('core', `Registered root thunk ${thunkId}`);
    }

    // Return control functions for this thunk
    return {
      thunkId,

      markExecuting: () => {
        const info = this.thunks.get(thunkId);
        if (info) {
          info.state = ThunkState.EXECUTING;
          this.activeThunkIds.add(thunkId);
          this.notifyStateChange(thunkId, info.state, info);
          debug('core', `[THUNK_TRACKER] Thunk ${thunkId} marked as EXECUTING, global state updated`);

          // Increment state version on thunk execution start
          this.incrementStateVersion();
        }
      },

      markCompleted: (result?: unknown) => {
        const info = this.thunks.get(thunkId);
        if (info) {
          info.state = ThunkState.COMPLETED;
          info.endTime = Date.now();
          info.result = result;
          this.activeThunkIds.delete(thunkId);

          // Remove from window tracking if it was associated with a window
          if (info.sourceWindowId !== undefined) {
            const windowThunks = this.thunksByWindow.get(info.sourceWindowId);
            if (windowThunks) {
              windowThunks.delete(thunkId);
              if (windowThunks.size === 0) {
                this.thunksByWindow.delete(info.sourceWindowId);
              }
            }
          }

          // Notify parent that this child is complete
          if (info.parentId && this.thunks.has(info.parentId)) {
            const parentInfo = this.thunks.get(info.parentId)!;
            parentInfo.pendingChildIds.delete(thunkId);
            debug('core', `Notified parent ${info.parentId} that child ${thunkId} completed`);
          }

          this.notifyStateChange(thunkId, info.state, info);
          debug('core', `[THUNK_TRACKER] Thunk ${thunkId} marked as COMPLETED, global state updated`, {
            duration: info.endTime - info.startTime,
            childCount: info.childIds.size,
            actionCount: info.actionIds.size,
            result,
          });

          // Increment state version on thunk completion
          this.incrementStateVersion();
        }
      },

      markFailed: (error: Error) => {
        const info = this.thunks.get(thunkId);
        if (info) {
          info.state = ThunkState.FAILED;
          info.endTime = Date.now();
          info.error = error;
          this.activeThunkIds.delete(thunkId);

          // Remove from window tracking if it was associated with a window
          if (info.sourceWindowId !== undefined) {
            const windowThunks = this.thunksByWindow.get(info.sourceWindowId);
            if (windowThunks) {
              windowThunks.delete(thunkId);
              if (windowThunks.size === 0) {
                this.thunksByWindow.delete(info.sourceWindowId);
              }
            }
          }

          // Notify parent that this child is complete (even though it failed)
          if (info.parentId && this.thunks.has(info.parentId)) {
            const parentInfo = this.thunks.get(info.parentId)!;
            parentInfo.pendingChildIds.delete(thunkId);
            debug('core', `Notified parent ${info.parentId} that child ${thunkId} failed`);
          }

          this.notifyStateChange(thunkId, info.state, info);
          debug('core', `Thunk ${thunkId} failed`, {
            duration: info.endTime - info.startTime,
            error: error.message,
          });
        }
      },

      addChildThunk: (childId: string) => {
        const info = this.thunks.get(thunkId);
        if (info) {
          info.childIds.add(childId);
          info.pendingChildIds.add(childId);
          debug('core', `Added child thunk ${childId} to parent ${thunkId}`);
        }
      },

      childCompleted: (childId: string) => {
        const info = this.thunks.get(thunkId);
        if (info) {
          info.pendingChildIds.delete(childId);
          debug('core', `Child thunk ${childId} completed for parent ${thunkId}`);
        }
      },

      addAction: (actionId: string) => {
        const info = this.thunks.get(thunkId);
        if (info) {
          info.actionIds.add(actionId);
          debug('core', `Added action ${actionId} to thunk ${thunkId}`);
        }
      },

      setSourceWindowId: (windowId: number) => {
        const info = this.thunks.get(thunkId);
        if (info) {
          debug('core', `[THUNK_TRACKER] Setting source window ID ${windowId} for thunk ${thunkId}`);
          info.sourceWindowId = windowId;

          // Add to window tracking map
          let windowThunks = this.thunksByWindow.get(windowId);
          if (!windowThunks) {
            windowThunks = new Set<string>();
            this.thunksByWindow.set(windowId, windowThunks);
            debug('core', `[THUNK_TRACKER] Created new window tracking set for window ${windowId}`);
          }
          windowThunks.add(thunkId);

          // Debug output to verify
          debug('core', `[THUNK_TRACKER] Window ${windowId} now has ${windowThunks.size} active thunks`);
          debug('core', `[THUNK_TRACKER] All tracked windows: [${Array.from(this.thunksByWindow.keys()).join(', ')}]`);

          debug('core', `Set source window ID ${windowId} for thunk ${thunkId}`);
        } else {
          debug('warn', `[THUNK_TRACKER] Could not find thunk ${thunkId} to set window ID ${windowId}`);
        }
      },
    };
  }

  /**
   * Register a thunk with a specific ID
   * @param thunkId The ID to use for the thunk
   * @param parentId Optional parent thunk ID
   * @returns ThunkHandle to control the thunk
   */
  public registerThunkWithId(thunkId: string, parentId?: string): ThunkHandle {
    const startTime = Date.now();

    // Create initial thunk info
    const thunkRecord: ThunkRecord = {
      id: thunkId,
      parentId,
      state: ThunkState.PENDING,
      startTime,
      childIds: new Set<string>(),
      pendingChildIds: new Set<string>(),
      actionIds: new Set<string>(),
    };

    // Add to registry
    this.thunks.set(thunkId, thunkRecord);

    // If this has a parent, update the parent's child lists
    if (parentId && this.thunks.has(parentId)) {
      const parentInfo = this.thunks.get(parentId)!;
      parentInfo.childIds.add(thunkId);
      parentInfo.pendingChildIds.add(thunkId);
      debug('core', `Added thunk ${thunkId} as child of ${parentId}`);
    } else {
      // This is a root thunk
      this.rootThunkIds.add(thunkId);
      debug('core', `Registered root thunk ${thunkId}`);
    }

    // Return the same interface as registerThunk
    return {
      thunkId,
      markExecuting: () => this.markThunkExecuting(thunkId),
      markCompleted: (result?: unknown) => this.markThunkCompleted(thunkId, result),
      markFailed: (error: Error) => this.markThunkFailed(thunkId, error),
      addChildThunk: (childId: string) => this.addChildThunk(thunkId, childId),
      childCompleted: (childId: string) => this.childCompleted(thunkId, childId),
      addAction: (actionId: string) => this.addAction(thunkId, actionId),
      setSourceWindowId: (windowId: number) => this.setSourceWindowId(thunkId, windowId),
    };
  }

  /**
   * Mark a thunk as executing
   * @param thunkId The ID of the thunk to mark
   */
  public markThunkExecuting(thunkId: string): void {
    const info = this.thunks.get(thunkId);
    if (info) {
      info.state = ThunkState.EXECUTING;
      this.activeThunkIds.add(thunkId);
      this.notifyStateChange(thunkId, info.state, info);
      debug('core', `[THUNK_TRACKER] Thunk ${thunkId} marked as EXECUTING, global state updated`);

      // Increment state version
      this.incrementStateVersion();
    }
  }

  /**
   * Mark a thunk as failed
   * @param thunkId The ID of the thunk to mark
   * @param error The error that caused the failure
   */
  public markThunkFailed(thunkId: string, error: Error): void {
    const info = this.thunks.get(thunkId);
    if (info) {
      info.state = ThunkState.FAILED;
      info.endTime = Date.now();
      info.error = error;
      this.activeThunkIds.delete(thunkId);

      // Remove from window tracking if it was associated with a window
      if (info.sourceWindowId !== undefined) {
        const windowThunks = this.thunksByWindow.get(info.sourceWindowId);
        if (windowThunks) {
          windowThunks.delete(thunkId);
          if (windowThunks.size === 0) {
            this.thunksByWindow.delete(info.sourceWindowId);
          }
        }
      }

      // Notify parent that this child is complete (even though it failed)
      if (info.parentId && this.thunks.has(info.parentId)) {
        const parentInfo = this.thunks.get(info.parentId)!;
        parentInfo.pendingChildIds.delete(thunkId);
        debug('core', `Notified parent ${info.parentId} that child ${thunkId} failed`);
      }

      this.notifyStateChange(thunkId, info.state, info);
      debug('core', `Thunk ${thunkId} failed`, {
        duration: info.endTime - info.startTime,
        error: error.message,
      });

      // Increment state version
      this.incrementStateVersion();
    }
  }

  /**
   * Add a child thunk to a parent thunk
   * @param parentId The ID of the parent thunk
   * @param childId The ID of the child thunk to add
   */
  public addChildThunk(parentId: string, childId: string): void {
    const info = this.thunks.get(parentId);
    if (info) {
      info.childIds.add(childId);
      info.pendingChildIds.add(childId);
      debug('core', `Added child thunk ${childId} to parent ${parentId}`);
    }
  }

  /**
   * Mark a child thunk as completed
   * @param parentId The ID of the parent thunk
   * @param childId The ID of the child thunk that completed
   */
  public childCompleted(parentId: string, childId: string): void {
    const info = this.thunks.get(parentId);
    if (info) {
      info.pendingChildIds.delete(childId);
      debug('core', `Child thunk ${childId} completed for parent ${parentId}`);
    }
  }

  /**
   * Add an action to a thunk
   * @param thunkId The ID of the thunk
   * @param actionId The ID of the action to add
   */
  public addAction(thunkId: string, actionId: string): void {
    const info = this.thunks.get(thunkId);
    if (info) {
      info.actionIds.add(actionId);
      debug('core', `Added action ${actionId} to thunk ${thunkId}`);
    }
  }

  /**
   * Set the source window ID for a thunk
   * @param thunkId The ID of the thunk
   * @param windowId The window ID to set
   */
  public setSourceWindowId(thunkId: string, windowId: number): void {
    const info = this.thunks.get(thunkId);
    if (info) {
      debug('core', `[THUNK_TRACKER] Setting source window ID ${windowId} for thunk ${thunkId}`);
      info.sourceWindowId = windowId;

      // Add to window tracking map
      let windowThunks = this.thunksByWindow.get(windowId);
      if (!windowThunks) {
        windowThunks = new Set<string>();
        this.thunksByWindow.set(windowId, windowThunks);
        debug('core', `[THUNK_TRACKER] Created new window tracking set for window ${windowId}`);
      }
      windowThunks.add(thunkId);

      // Debug output to verify
      debug('core', `[THUNK_TRACKER] Window ${windowId} now has ${windowThunks.size} active thunks`);
      debug('core', `[THUNK_TRACKER] All tracked windows: [${Array.from(this.thunksByWindow.keys()).join(', ')}]`);

      debug('core', `Set source window ID ${windowId} for thunk ${thunkId}`);
    } else {
      debug('warn', `[THUNK_TRACKER] Could not find thunk ${thunkId} to set window ID ${windowId}`);
    }
  }

  /**
   * Get information about a specific thunk
   */
  public getThunkRecord(thunkId: string): ThunkRecord | undefined {
    return this.thunks.get(thunkId);
  }

  /**
   * Get information about all thunks
   */
  public getAllThunks(): ThunkRecord[] {
    return Array.from(this.thunks.values());
  }

  /**
   * Get root thunks (those with no parent)
   */
  public getRootThunks(): ThunkRecord[] {
    return Array.from(this.rootThunkIds)
      .map((id) => this.thunks.get(id)!)
      .filter(Boolean);
  }

  /**
   * Get active thunks (those currently executing)
   */
  public getActiveThunks(): ThunkRecord[] {
    return Array.from(this.activeThunkIds)
      .map((id) => this.thunks.get(id)!)
      .filter(Boolean);
  }

  /**
   * Get active thunks for a specific window
   */
  public getActiveThunksForWindow(windowId: number): ThunkRecord[] {
    const windowThunks = this.thunksByWindow.get(windowId);
    if (!windowThunks) return [];

    return Array.from(windowThunks)
      .map((id) => this.thunks.get(id)!)
      .filter((record) => record && record.state === ThunkState.EXECUTING);
  }

  /**
   * Check if any thunks are active (in the executing state)
   */
  public hasActiveThunks(): boolean {
    // Log the thunks in the map for debugging
    debug('core', `[THUNK_TRACKER] hasActiveThunks - Checking ${this.thunks.size} total thunks`);
    debug(
      'core',
      `[THUNK_TRACKER] Active thunk IDs set has ${this.activeThunkIds.size} entries: [${Array.from(
        this.activeThunkIds,
      ).join(', ')}]`,
    );

    if (this.thunks.size > 0) {
      this.thunks.forEach((thunk, id) => {
        debug('core', `[THUNK_TRACKER] Thunk ${id} state: ${thunk.state}, window: ${thunk.sourceWindowId}`);
      });
    }

    // Use the activeThunkIds set directly instead of recounting
    // This ensures consistency with the set that's maintained when markExecuting/markCompleted are called
    return this.activeThunkIds.size > 0;
  }

  /**
   * Check if any thunks are active for a specific window
   */
  public hasActiveThunksForWindow(windowId: number): boolean {
    const windowThunks = this.thunksByWindow.get(windowId);
    debug(
      'core',
      `[THUNK_TRACKER] Checking if window ${windowId} has active thunks. Window in tracking map: ${!!windowThunks}`,
    );

    if (!windowThunks) return false;

    // Debug log the thunks found for this window
    debug('core', `[THUNK_TRACKER] Window ${windowId} has ${windowThunks.size} tracked thunks`);

    let hasActiveThunk = false;
    for (const thunkId of windowThunks) {
      const record = this.thunks.get(thunkId);
      if (record && record.state === ThunkState.EXECUTING) {
        debug('core', `[THUNK_TRACKER] Found active thunk ${thunkId} in window ${windowId}`);
        hasActiveThunk = true;
        break;
      }
    }

    debug('core', `[THUNK_TRACKER] hasActiveThunksForWindow(${windowId}) returning ${hasActiveThunk}`);
    return hasActiveThunk;
  }

  /**
   * Check if a particular thunk has any pending children
   */
  public hasPendingChildren(thunkId: string): boolean {
    const info = this.thunks.get(thunkId);
    return info ? info.pendingChildIds.size > 0 : false;
  }

  /**
   * Get all actions associated with a thunk and its descendants
   */
  public getAllActionsForThunk(thunkId: string): string[] {
    const record = this.thunks.get(thunkId);
    if (!record) return [];

    // Start with this thunk's actions
    const actionIds = Array.from(record.actionIds);

    // Add actions from all child thunks
    for (const childId of record.childIds) {
      actionIds.push(...this.getAllActionsForThunk(childId));
    }

    return actionIds;
  }

  /**
   * Register a callback for thunk state changes
   */
  public onStateChange(callback: ThunkStateChangeListener): () => void {
    this.stateChangeListeners.push(callback);

    // Return unsubscribe function
    return () => {
      const index = this.stateChangeListeners.indexOf(callback);
      if (index !== -1) {
        this.stateChangeListeners.splice(index, 1);
      }
    };
  }

  /**
   * Notify all registered callbacks about a thunk state change
   */
  private notifyStateChange(thunkId: string, state: ThunkState, info: ThunkRecord): void {
    for (const callback of this.stateChangeListeners) {
      try {
        callback(thunkId, state, { ...info });
      } catch (err) {
        debug('core:error', 'Error in thunk state change callback:', err);
      }
    }
  }

  /**
   * Clear all registry data (mainly for testing)
   */
  public clear(): void {
    this.thunks.clear();
    this.rootThunkIds.clear();
    this.activeThunkIds.clear();
    this.thunksByWindow.clear();
    debug('core', 'Registry cleared');
  }

  /**
   * Mark a thunk as completed by its ID (for external completion)
   * This is used when we don't have access to the original ThunkHandle
   */
  public markThunkCompleted(thunkId: string, result?: unknown): void {
    const info = this.thunks.get(thunkId);
    if (info) {
      info.state = ThunkState.COMPLETED;
      info.endTime = Date.now();
      info.result = result;
      this.activeThunkIds.delete(thunkId);

      // Remove from window tracking if it was associated with a window
      if (info.sourceWindowId !== undefined) {
        const windowThunks = this.thunksByWindow.get(info.sourceWindowId);
        if (windowThunks) {
          windowThunks.delete(thunkId);
          if (windowThunks.size === 0) {
            this.thunksByWindow.delete(info.sourceWindowId);
          }
        }
      }

      // Notify parent that this child is complete
      if (info.parentId && this.thunks.has(info.parentId)) {
        const parentInfo = this.thunks.get(info.parentId)!;
        parentInfo.pendingChildIds.delete(thunkId);
        debug('core', `Notified parent ${info.parentId} that child ${thunkId} completed`);
      }

      this.notifyStateChange(thunkId, info.state, info);
      debug('core', `[THUNK_TRACKER] Thunk ${thunkId} marked as COMPLETED, global state updated`, {
        duration: info.endTime - info.startTime,
        childCount: info.childIds.size,
        actionCount: info.actionIds.size,
        result,
      });
      debug('core', `[THUNK_TRACKER] Thunk ${thunkId} marked as COMPLETED externally`);

      // Increment state version when thunk completes externally
      this.incrementStateVersion();
    } else {
      debug('warn', `[THUNK_TRACKER] Cannot mark non-existent thunk ${thunkId} as completed`);
    }
  }

  /**
   * Get the current global thunk state version
   */
  public getStateVersion(): number {
    return this.stateVersion;
  }

  /**
   * Increment the global thunk state version
   * @returns The new state version
   */
  private incrementStateVersion(): number {
    this.stateVersion += 1;
    debug('core', `[THUNK_TRACKER] Global thunk state version incremented to ${this.stateVersion}`);
    return this.stateVersion;
  }

  /**
   * Get a summary of active thunks suitable for piggybacking on acknowledgments
   */
  public getActiveThunksSummary(): {
    version: number;
    thunks: Array<{ id: string; windowId: number; parentId?: string }>;
  } {
    const activeThunks = this.getActiveThunks();

    return {
      version: this.stateVersion,
      thunks: activeThunks.map((thunk) => ({
        id: thunk.id,
        windowId: thunk.sourceWindowId || 0,
        parentId: thunk.parentId,
      })),
    };
  }

  /**
   * Check if a specific thunk is active
   */
  public isThunkActive(thunkId: string): boolean {
    return this.activeThunkIds.has(thunkId);
  }
}

// Create a singleton instance for global use
let globalThunkTracker: ThunkTracker | undefined;

/**
 * Get or create the global thunk tracker
 */
export const getThunkTracker = (): ThunkTracker => {
  if (!globalThunkTracker) {
    globalThunkTracker = new ThunkTracker();
  }

  return globalThunkTracker;
};
