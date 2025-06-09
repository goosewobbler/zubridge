import { EventEmitter } from 'node:events';
import { debug } from '@zubridge/core';
import { type Action, ThunkState } from '@zubridge/types';
import { Thunk } from './Thunk.js';
import { getThunkLockManager } from './ThunkLockManager.js';

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
  thunkId: string;
  markExecuting: () => void;
  markCompleted: (result?: unknown) => void;
  markFailed: (error: Error) => void;
  addChildThunk: (childId: string) => void;
  setSourceWindowId: (windowId: number) => void;
}

/**
 * Manages thunk lifecycle and processing decisions
 */
export class ThunkManager extends EventEmitter {
  // All registered thunks, indexed by ID
  private thunks: Map<string, Thunk> = new Map();

  // State version counter
  private stateVersion: number = 1;

  constructor() {
    super();
    debug('thunk', 'ThunkManager initialized');
  }

  /**
   * Register a new thunk instance
   */
  registerThunk(thunk: Thunk): ThunkHandle {
    debug(
      'thunk',
      `Registering thunk: id=${thunk.id}, parentId=${thunk.parentId}, bypassThunkLock=${thunk.bypassThunkLock}`,
    );
    this.thunks.set(thunk.id, thunk);

    // If this thunk has a parent, add it as a child of the parent
    if (thunk.parentId && this.thunks.has(thunk.parentId)) {
      const parentThunk = this.thunks.get(thunk.parentId)!;
      parentThunk.addChild(thunk.id);
    }

    // Emit event
    this.emit(ThunkManagerEvent.THUNK_REGISTERED, thunk);

    // Return a handle for this thunk
    return {
      thunkId: thunk.id,
      markExecuting: () => this.markThunkExecuting(thunk.id),
      markCompleted: () => this.markThunkCompleted(thunk.id),
      markFailed: () => this.markThunkFailed(thunk.id),
      addChildThunk: (childId: string) => this.addChildThunk(thunk.id, childId),
      setSourceWindowId: (windowId: number) => this.setSourceWindowId(thunk.id, windowId),
    };
  }

  /**
   * Mark a thunk as executing
   */
  markThunkExecuting(thunkId: string): void {
    debug('thunk', `Marking thunk as executing: id=${thunkId}`);
    const thunk = this.thunks.get(thunkId);
    if (!thunk) return;

    thunk.activate();
    this.incrementStateVersion();
    this.emit(ThunkManagerEvent.THUNK_STARTED, thunk);
  }

  /**
   * Mark a thunk as completed
   */
  markThunkCompleted(thunkId: string): void {
    debug('thunk', `Marking thunk as completed: id=${thunkId}`);
    const thunk = this.thunks.get(thunkId);
    if (!thunk) return;

    thunk.complete();
    this.incrementStateVersion();
    this.emit(ThunkManagerEvent.THUNK_COMPLETED, thunk);

    // Check if this is a root thunk and release the lock if needed
    this.checkAndReleaseRootThunkLock(thunkId);
  }

  /**
   * Mark a thunk as failed
   */
  markThunkFailed(thunkId: string): void {
    const thunk = this.thunks.get(thunkId);
    if (!thunk) return;

    thunk.fail();
    this.incrementStateVersion();
    this.emit(ThunkManagerEvent.THUNK_FAILED, thunk);

    // Check if this is a root thunk and release the lock if needed
    this.checkAndReleaseRootThunkLock(thunkId);
  }

  /**
   * Add a child thunk to a parent thunk
   */
  addChildThunk(parentId: string, childId: string): void {
    const parentThunk = this.thunks.get(parentId);
    if (!parentThunk) return;

    parentThunk.addChild(childId);
  }

  /**
   * Set the source window ID for a thunk
   */
  setSourceWindowId(thunkId: string, windowId: number): void {
    const thunk = this.thunks.get(thunkId);
    if (!thunk) return;

    // Set the window ID on the thunk
    thunk.sourceWindowId = windowId;
    debug('thunk', `Set source window ID ${windowId} for thunk ${thunkId}`);
  }

  /**
   * Check if a thunk is active
   */
  isThunkActive(thunkId: string): boolean {
    const thunk = this.thunks.get(thunkId);
    if (!thunk) return false;

    return thunk.state === ThunkState.EXECUTING;
  }

  /**
   * Get a thunk by ID
   */
  getThunk(thunkId: string): Thunk | undefined {
    return this.thunks.get(thunkId);
  }

  /**
   * Check if a thunk exists
   */
  hasThunk(thunkId: string): boolean {
    return this.thunks.has(thunkId);
  }

  /**
   * Process a thunk-related action
   */
  processThunkAction(action: Action): void {
    const thunkId = action.__thunkParentId;
    if (!thunkId || !this.thunks.has(thunkId)) return;

    const thunk = this.thunks.get(thunkId)!;

    // Use explicit metadata to determine thunk start/end
    if (action.__startsThunk) {
      debug('thunk', `Activating thunk ${thunkId} from action ${action.type}`);
      thunk.activate();
      this.incrementStateVersion();
      this.emit(ThunkManagerEvent.THUNK_STARTED, thunk);
    } else if (action.__endsThunk) {
      debug('thunk', `Completing thunk ${thunkId} from action ${action.type}`);
      thunk.complete();
      this.incrementStateVersion();
      this.emit(ThunkManagerEvent.THUNK_COMPLETED, thunk);
      this.checkAndReleaseRootThunkLock(thunkId);
    }
  }

  /**
   * Get the root thunk ID for a given thunk
   */
  getRootThunkId(thunkId: string): string {
    let current = this.thunks.get(thunkId);
    if (!current) return thunkId;

    while (current.parentId && this.thunks.has(current.parentId)) {
      current = this.thunks.get(current.parentId)!;
    }

    return current.id;
  }

  /**
   * Check if a thunk tree is completely done
   */
  isThunkTreeComplete(rootThunkId: string): boolean {
    const rootThunk = this.thunks.get(rootThunkId);
    if (!rootThunk) return true;

    // Check if root is complete
    if (!rootThunk.isComplete()) return false;

    // Check all children recursively
    for (const childId of rootThunk.getChildren()) {
      if (!this.isThunkTreeComplete(childId)) return false;
    }

    return true;
  }

  /**
   * Release the lock if the thunk tree is complete
   */
  checkAndReleaseRootThunkLock(thunkId: string): void {
    const rootId = this.getRootThunkId(thunkId);
    debug('thunk', `Checking if root thunk tree is complete for rootId=${rootId}`);
    // Get the current active lock from ThunkLockManager for consistency
    const thunkLockManager = getThunkLockManager();

    // Only proceed if there's an active lock and it matches our root thunk
    if (this.isThunkTreeComplete(rootId)) {
      debug('thunk', `Root thunk tree ${rootId} is complete, releasing lock`);
      // Release through ThunkLockManager
      thunkLockManager.release(rootId);
      this.incrementStateVersion();
      this.emit(ThunkManagerEvent.ROOT_THUNK_COMPLETED, rootId);
    } else {
      debug('thunk', `Not releasing lock for thunk ${rootId}:`, {
        isRootComplete: this.isThunkTreeComplete(rootId),
        requestedRootId: rootId,
      });
    }
  }

  /**
   * Determine if an action can be processed now
   * Delegates to ThunkLockManager for consistency
   */
  canProcessAction(action: Action): boolean {
    const thunkLockManager = getThunkLockManager();
    return thunkLockManager.canProcessAction(action);
  }

  /**
   * Try to acquire a lock for processing a thunk
   * Delegates to ThunkLockManager for consistency
   */
  tryAcquireThunkLock(action: Action): boolean {
    if (!action.__thunkParentId) return false;

    const thunkLockManager = getThunkLockManager();
    const rootId = this.getRootThunkId(action.__thunkParentId);
    const thunk = this.thunks.get(rootId);
    if (thunk && thunkLockManager.acquire(rootId, thunk.keys, thunk.bypassThunkLock)) {
      this.incrementStateVersion();
      this.emit(ThunkManagerEvent.ROOT_THUNK_CHANGED, rootId);
      return true;
    }

    return false;
  }

  /**
   * Try to acquire a lock for a specific root thunk ID
   * Delegates to ThunkLockManager for consistency
   */
  tryAcquireThunkLockForId(thunkId: string): boolean {
    const thunk = this.thunks.get(thunkId);
    if (!thunk) {
      debug('thunk', `Cannot acquire lock for thunk ${thunkId} - thunk not found`);
      return false;
    }

    const thunkLockManager = getThunkLockManager();

    if (thunkLockManager.acquire(thunkId, thunk.keys, thunk.bypassThunkLock)) {
      this.incrementStateVersion();
      this.emit(ThunkManagerEvent.ROOT_THUNK_CHANGED, thunkId);
      return true;
    }

    return false;
  }

  /**
   * Get the currently active root thunk ID
   */
  getActiveRootThunkId(): string | undefined {
    const thunkLockManager = getThunkLockManager();
    const activeLock = thunkLockManager.getActiveThunkLock();
    return activeLock?.thunkId;
  }

  /**
   * Check if a specific thunk can be registered (not blocked by another thunk)
   * Delegates to ThunkLockManager for consistency
   */
  canRegisterThunk(thunkId: string, parentId?: string): boolean {
    const thunk = this.thunks.get(thunkId) || this.thunks.get(parentId || '');
    const windowId = thunk?.sourceWindowId || 0;

    const thunkLockManager = getThunkLockManager();
    return thunkLockManager.canRegisterThunk(thunkId, windowId, parentId);
  }

  /**
   * Get all active thunks for broadcasting
   */
  getActiveThunksSummary(): { version: number; thunks: Array<{ id: string; windowId: number; parentId?: string }> } {
    const activeThunks = Array.from(this.thunks.values())
      .filter((thunk) => thunk.state === ThunkState.EXECUTING)
      .map((thunk) => ({
        id: thunk.id,
        windowId: thunk.sourceWindowId,
        parentId: thunk.parentId,
      }));

    return {
      version: this.stateVersion,
      thunks: activeThunks,
    };
  }

  /**
   * Increment the state version
   */
  private incrementStateVersion(): number {
    return ++this.stateVersion;
  }
}

// Singleton instance of ThunkManager
let thunkManagerInstance: ThunkManager | undefined;

/**
 * Get the global ThunkManager instance
 */
export function getThunkManager(): ThunkManager {
  if (!thunkManagerInstance) {
    thunkManagerInstance = new ThunkManager();
    debug('thunk', 'Created global ThunkManager instance');
  }
  return thunkManagerInstance;
}
