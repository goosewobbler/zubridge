import { EventEmitter } from 'events';
import type { Action as BaseAction } from '@zubridge/types';
import { debug } from '@zubridge/core';
import { v4 as uuidv4 } from 'uuid';
import { Thunk } from './Thunk.js';

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
 * Extend the base Action type with thunk-related fields
 */
interface Action extends BaseAction {
  __sourceWindowId?: number; // ID of the window that dispatched this action
  __thunkParentId?: string; // Parent thunk ID if this action is part of a thunk
}

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
  childCompleted: (childId: string) => void;
  addAction: (actionId: string) => void;
  setSourceWindowId: (windowId: number) => void;
}

/**
 * Manages thunk lifecycle and processing decisions
 */
export class ThunkManager extends EventEmitter {
  // All registered thunks, indexed by ID
  private thunks: Map<string, Thunk> = new Map();

  // ID of the root thunk currently being processed
  private activeRootThunkId: string | undefined = undefined;

  // State version counter
  private stateVersion: number = 1;

  constructor() {
    super();
    debug('thunk', 'ThunkManager initialized');
  }

  /**
   * Register a new thunk with an auto-generated ID
   */
  registerThunk(parentId?: string): ThunkHandle {
    const thunkId = uuidv4();
    debug('thunk', `Registering thunk ${thunkId}${parentId ? ` with parent ${parentId}` : ''}`);

    // Create the thunk instance but don't associate with a window yet
    // The window ID will be set later via setSourceWindowId
    const thunk = new Thunk(thunkId, 0, parentId);
    this.thunks.set(thunkId, thunk);

    // If this thunk has a parent, add it as a child of the parent
    if (parentId && this.thunks.has(parentId)) {
      const parentThunk = this.thunks.get(parentId)!;
      parentThunk.addChild(thunkId);
    }

    // Emit event
    this.emit(ThunkManagerEvent.THUNK_REGISTERED, thunk);

    // Return a handle for this thunk
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
   * Register a new thunk with a specific ID
   */
  registerThunkWithId(thunkId: string, parentId?: string): ThunkHandle {
    debug('thunk', `Registering thunk with specific ID ${thunkId}${parentId ? ` with parent ${parentId}` : ''}`);

    // Create the thunk instance but don't associate with a window yet
    // The window ID will be set later via setSourceWindowId
    const thunk = new Thunk(thunkId, 0, parentId);
    this.thunks.set(thunkId, thunk);

    // If this thunk has a parent, add it as a child of the parent
    if (parentId && this.thunks.has(parentId)) {
      const parentThunk = this.thunks.get(parentId)!;
      parentThunk.addChild(thunkId);
    }

    // Emit event
    this.emit(ThunkManagerEvent.THUNK_REGISTERED, thunk);

    // Return a handle for this thunk
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
   */
  markThunkExecuting(thunkId: string): void {
    const thunk = this.thunks.get(thunkId);
    if (!thunk) return;

    thunk.activate();
    this.incrementStateVersion();
    this.emit(ThunkManagerEvent.THUNK_STARTED, thunk);
  }

  /**
   * Mark a thunk as completed
   */
  markThunkCompleted(thunkId: string, result?: unknown): void {
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
  markThunkFailed(thunkId: string, error: Error): void {
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
   * Notify that a child thunk has completed
   */
  childCompleted(parentId: string, childId: string): void {
    // This is a no-op in our new implementation since we check the actual state
    // of child thunks in isThunkTreeComplete
  }

  /**
   * Add an action to a thunk
   */
  addAction(thunkId: string, actionId: string): void {
    // This is a no-op in our new implementation
    // We don't track individual actions on thunks anymore
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
  processThunkAction(action: Action, sourceWindowId: number): void {
    const thunkId = action.__thunkParentId;
    if (!thunkId || !this.thunks.has(thunkId)) return;

    const thunk = this.thunks.get(thunkId)!;

    // Determine action type based on action.type
    if (isThunkStartAction(action)) {
      debug('thunk', `Activating thunk ${thunkId} from action ${action.type}`);
      thunk.activate();
      this.incrementStateVersion();
      this.emit(ThunkManagerEvent.THUNK_STARTED, thunk);
    } else if (isThunkEndAction(action)) {
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

    if (this.activeRootThunkId === rootId && this.isThunkTreeComplete(rootId)) {
      debug('thunk', `Root thunk tree ${rootId} is complete, releasing lock`);
      const previousActiveRootThunkId = this.activeRootThunkId;
      this.activeRootThunkId = undefined;
      this.incrementStateVersion();
      this.emit(ThunkManagerEvent.ROOT_THUNK_COMPLETED, previousActiveRootThunkId);
    }
  }

  /**
   * Determine if an action can be processed now
   */
  canProcessAction(action: Action, sourceWindowId: number): boolean {
    // If no thunk is active, any action can proceed
    if (!this.activeRootThunkId) return true;

    // If action is not part of a thunk, defer it while a thunk is active
    if (!action.__thunkParentId) return false;

    // If action is part of the active thunk tree, it can proceed
    const actionRootId = this.getRootThunkId(action.__thunkParentId);
    return actionRootId === this.activeRootThunkId;
  }

  /**
   * Try to acquire a lock for processing a thunk
   */
  tryAcquireThunkLock(action: Action, sourceWindowId: number): boolean {
    if (this.activeRootThunkId) return false;

    if (action.__thunkParentId) {
      const rootId = this.getRootThunkId(action.__thunkParentId);
      debug('thunk', `Acquiring lock for root thunk ${rootId}`);
      this.activeRootThunkId = rootId;
      this.incrementStateVersion();
      this.emit(ThunkManagerEvent.ROOT_THUNK_CHANGED, rootId);
      return true;
    }

    return false;
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

/**
 * Determine if an action represents a thunk start
 */
function isThunkStartAction(action: Action): boolean {
  return (
    action.type.includes('START') ||
    action.type.includes('THUNK') ||
    (action.type.includes(':SET:') && !action.type.includes('SLOW'))
  );
}

/**
 * Determine if an action represents a thunk end
 */
function isThunkEndAction(action: Action): boolean {
  return action.type.includes('END') || action.type.includes('COMPLETE') || action.type.includes(':SLOW:DONE');
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
