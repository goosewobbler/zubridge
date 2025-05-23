import { EventEmitter } from 'events';
import { debug } from '@zubridge/core';
import type { Action as BaseAction } from '@zubridge/types';

/**
 * Extended Action interface with thunk-related fields
 */
interface Action extends BaseAction {
  __sourceWindowId?: number;
  __thunkParentId?: string;
  __startsThunk?: boolean;
}

/**
 * Thunk lock states
 */
export enum ThunkLockState {
  IDLE = 'IDLE', // No thunk is active, all actions can proceed
  LOCKED = 'LOCKED', // A thunk is active, actions are subject to blocking rules
}

/**
 * Events emitted by ThunkLockManager
 */
export enum ThunkLockEvent {
  LOCK_ACQUIRED = 'lock:acquired',
  LOCK_RELEASED = 'lock:released',
  ACTION_BLOCKED = 'action:blocked',
  ACTION_ALLOWED = 'action:allowed',
}

/**
 * Information about an active thunk lock
 */
interface ActiveThunkLock {
  thunkId: string;
  windowId: number;
  acquiredAt: number;
}

/**
 * Centralized thunk lock state machine
 * This ensures all action processing respects the same locking rules
 */
export class ThunkLockManager extends EventEmitter {
  private state: ThunkLockState = ThunkLockState.IDLE;
  private activeThunkLock: ActiveThunkLock | null = null;

  constructor() {
    super();
    debug('thunk-lock', 'ThunkLockManager initialized');
  }

  /**
   * Get the current lock state
   */
  getState(): ThunkLockState {
    return this.state;
  }

  /**
   * Get information about the active thunk lock (if any)
   */
  getActiveThunkLock(): ActiveThunkLock | null {
    return this.activeThunkLock;
  }

  /**
   * Attempt to acquire a thunk lock for a specific thunk
   * @param thunkId - The ID of the thunk requesting the lock
   * @param windowId - The window ID where the thunk is running
   * @returns true if lock was acquired, false if blocked
   */
  tryAcquireLock(thunkId: string, windowId: number): boolean {
    debug('thunk-lock', `Attempting to acquire lock for thunk ${thunkId} from window ${windowId}`);

    // State machine transition: IDLE -> LOCKED
    if (this.state === ThunkLockState.IDLE) {
      this.state = ThunkLockState.LOCKED;
      this.activeThunkLock = {
        thunkId,
        windowId,
        acquiredAt: Date.now(),
      };

      debug('thunk-lock', `Lock acquired for thunk ${thunkId} from window ${windowId}`);
      this.emit(ThunkLockEvent.LOCK_ACQUIRED, this.activeThunkLock);
      return true;
    }

    // State machine invariant: LOCKED -> LOCKED (rejected)
    if (this.state === ThunkLockState.LOCKED) {
      debug(
        'thunk-lock',
        `Lock denied for thunk ${thunkId} - already locked by thunk ${this.activeThunkLock?.thunkId} from window ${this.activeThunkLock?.windowId}`,
      );
      return false;
    }

    return false;
  }

  /**
   * Release the thunk lock for a specific thunk
   * @param thunkId - The ID of the thunk releasing the lock
   * @returns true if lock was released, false if not held by this thunk
   */
  releaseLock(thunkId: string): boolean {
    debug('thunk-lock', `Attempting to release lock for thunk ${thunkId}`);

    // State machine invariant: Can only release if we hold the lock
    if (this.state === ThunkLockState.LOCKED && this.activeThunkLock?.thunkId === thunkId) {
      const releasedLock = this.activeThunkLock;

      // State machine transition: LOCKED -> IDLE
      this.state = ThunkLockState.IDLE;
      this.activeThunkLock = null;

      debug('thunk-lock', `Lock released for thunk ${thunkId} (held for ${Date.now() - releasedLock.acquiredAt}ms)`);
      this.emit(ThunkLockEvent.LOCK_RELEASED, releasedLock);
      return true;
    }

    debug('thunk-lock', `Cannot release lock for thunk ${thunkId} - not currently held by this thunk`);
    return false;
  }

  /**
   * Check if an action can be processed based on the current thunk lock state
   * This implements global thunk blocking - when any thunk is active, only actions from that thunk are allowed
   */
  canProcessAction(action: Action, sourceWindowId: number): boolean {
    // State machine rule: IDLE state allows all actions
    if (this.state === ThunkLockState.IDLE) {
      debug('thunk-lock', `Action ${action.type} from window ${sourceWindowId} allowed - no active thunk`);
      this.emit(ThunkLockEvent.ACTION_ALLOWED, { action, sourceWindowId, reason: 'no-active-thunk' });
      return true;
    }

    // State machine rule: LOCKED state - global thunk blocking
    if (this.state === ThunkLockState.LOCKED && this.activeThunkLock) {
      // Only actions that are part of the currently active thunk are allowed
      if (action.__thunkParentId === this.activeThunkLock.thunkId) {
        debug(
          'thunk-lock',
          `Action ${action.type} from window ${sourceWindowId} allowed - part of active thunk ${this.activeThunkLock.thunkId}`,
        );
        this.emit(ThunkLockEvent.ACTION_ALLOWED, { action, sourceWindowId, reason: 'same-thunk' });
        return true;
      }

      // All other actions are blocked globally during thunk execution
      debug(
        'thunk-lock',
        `Action ${action.type} from window ${sourceWindowId} blocked - thunk ${this.activeThunkLock.thunkId} is active (global blocking)`,
      );
      this.emit(ThunkLockEvent.ACTION_BLOCKED, { action, sourceWindowId, reason: 'global-thunk-blocking' });
      return false;
    }

    // Default: allow the action
    debug('thunk-lock', `Action ${action.type} from window ${sourceWindowId} allowed - default case`);
    this.emit(ThunkLockEvent.ACTION_ALLOWED, { action, sourceWindowId, reason: 'default' });
    return true;
  }

  /**
   * Check if a new thunk can be registered
   */
  canRegisterThunk(thunkId: string, windowId: number, parentId?: string): boolean {
    debug(
      'thunk-lock',
      `Checking if thunk ${thunkId} from window ${windowId} can be registered${parentId ? ` with parent ${parentId}` : ''}`,
    );

    // If no lock is active, any new root thunk can register
    if (this.state === ThunkLockState.IDLE) {
      debug('thunk-lock', `Thunk ${thunkId} can register - no active lock`);
      return true;
    }

    // If a lock is active, only child thunks of the active thunk can register
    if (this.state === ThunkLockState.LOCKED && this.activeThunkLock && parentId === this.activeThunkLock.thunkId) {
      debug('thunk-lock', `Thunk ${thunkId} can register - child of active thunk ${this.activeThunkLock.thunkId}`);
      return true;
    }

    debug('thunk-lock', `Thunk ${thunkId} cannot register - blocked by active thunk ${this.activeThunkLock?.thunkId}`);
    return false;
  }

  /**
   * Get debug information about the current state
   */
  getDebugInfo(): {
    state: ThunkLockState;
    activeThunkLock: ActiveThunkLock | null;
    lockDuration?: number;
  } {
    return {
      state: this.state,
      activeThunkLock: this.activeThunkLock,
      lockDuration: this.activeThunkLock ? Date.now() - this.activeThunkLock.acquiredAt : undefined,
    };
  }
}

// Singleton instance
let thunkLockManagerInstance: ThunkLockManager | undefined;

/**
 * Get the global ThunkLockManager instance
 */
export function getThunkLockManager(): ThunkLockManager {
  if (!thunkLockManagerInstance) {
    thunkLockManagerInstance = new ThunkLockManager();
    debug('thunk-lock', 'Created global ThunkLockManager instance');
  }
  return thunkLockManagerInstance;
}
