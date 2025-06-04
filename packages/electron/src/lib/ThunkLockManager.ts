import { EventEmitter } from 'events';
import { debug } from '@zubridge/core';
import type { Action } from '@zubridge/types';

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
 * ThunkLockManager now supports key-based locking.
 * - Multiple thunks can run concurrently if their key sets do not overlap.
 * - A thunk with no keys is a global lock (blocks all others).
 * - A thunk with 'force' bypasses all locks.
 */
export class ThunkLockManager extends EventEmitter {
  private state: ThunkLockState = ThunkLockState.IDLE;
  private activeThunkLock: ActiveThunkLock | null = null;
  private activeThunks: Map<string, { keys?: string[]; bypassLock?: boolean }>; // thunkId -> { keys, bypassLock }

  constructor() {
    super();
    this.activeThunks = new Map();
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
   * Attempt to acquire a lock for a thunk.
   * @param thunkId Unique ID for the thunk
   * @param keys Keys this thunk will affect (undefined = global lock)
   * @param force If true, bypass all locks
   * @returns true if lock acquired, false if blocked
   */
  acquire(thunkId: string, keys?: string[], bypassLock?: boolean): boolean {
    if (bypassLock) {
      this.activeThunks.set(thunkId, { keys, bypassLock });
      return true;
    }
    // If any active thunk is a global lock, block
    for (const { keys: activeKeys, bypassLock: activeBypassLock } of this.activeThunks.values()) {
      if (activeBypassLock) continue; // ignore forced thunks
      if (!activeKeys) return false; // global lock present
    }
    // If this is a global lock, block if any non-forced thunks are active
    if (!keys) {
      for (const { bypassLock: activeBypassLock } of this.activeThunks.values()) {
        if (!activeBypassLock) return false;
      }
      this.activeThunks.set(thunkId, { keys, bypassLock });
      return true;
    }
    // Otherwise, check for key overlap
    for (const { keys: activeKeys, bypassLock: activeBypassLock } of this.activeThunks.values()) {
      if (activeBypassLock) continue;
      if (!activeKeys) return false; // global lock present
      if (activeKeys.some((k) => keys.includes(k)) || keys.some((k) => activeKeys.includes(k))) {
        return false; // overlap
      }
    }
    this.activeThunks.set(thunkId, { keys, bypassLock });
    return true;
  }

  /**
   * Release a lock for a thunk.
   */
  release(thunkId: string): void {
    const hadThunk = this.activeThunks.has(thunkId);
    this.activeThunks.delete(thunkId);

    // Emit the lock released event if we actually deleted a thunk
    if (hadThunk) {
      debug('thunk-lock', `Released lock for thunk ${thunkId}, emitting LOCK_RELEASED event`);
      this.emit(ThunkLockEvent.LOCK_RELEASED, thunkId);
    }
  }

  /**
   * Check if a lock is held for the given keys (or global).
   * @param keys Keys to check (undefined = global)
   */
  isLocked(keys?: string[]): boolean {
    // If any forced thunks, ignore them
    for (const { keys: activeKeys, bypassLock: activeBypassLock } of this.activeThunks.values()) {
      if (activeBypassLock) continue;
      if (!activeKeys) return true; // global lock present
      if (!keys) return true; // global lock requested, but other locks present
      if (activeKeys.some((k) => keys.includes(k)) || keys.some((k) => activeKeys.includes(k))) {
        return true; // overlap
      }
    }
    return false;
  }

  /**
   * Get a summary of active thunks (for debugging/monitoring).
   */
  getActiveThunksSummary() {
    return Array.from(this.activeThunks.entries()).map(([id, { keys, bypassLock }]) => ({ id, keys, bypassLock }));
  }

  /**
   * Check if an action can be processed based on the current thunk lock state
   * Implements key-based and global locking.
   */
  canProcessAction(action: Action): boolean {
    // If the action has the bypass thunk lock flag, allow it to bypass all locks
    if (action.__bypassThunkLock === true) {
      debug('thunk-lock', `Action ${action.type} allowed - has bypassThunkLock flag`);
      this.emit(ThunkLockEvent.ACTION_ALLOWED, { action, reason: 'bypass-thunk-lock' });
      return true;
    }

    // If no thunks are active, allow all actions
    if (this.activeThunks.size === 0) {
      debug('thunk-lock', `Action ${action.type} allowed - no active thunks`);
      this.emit(ThunkLockEvent.ACTION_ALLOWED, { action, reason: 'no-active-thunks' });
      return true;
    }

    // If this action is not associated with a thunk, block if any global lock is present
    if (!action.__thunkParentId) {
      for (const { keys, bypassLock } of this.activeThunks.values()) {
        if (bypassLock) continue;
        if (!keys) {
          debug('thunk-lock', `Action ${action.type} blocked - global lock present`);
          this.emit(ThunkLockEvent.ACTION_BLOCKED, { action, reason: 'global-lock-present' });
          return false;
        }
      }
      // No global lock, allow
      debug('thunk-lock', `Action ${action.type} allowed - not part of a thunk, no global lock`);
      this.emit(ThunkLockEvent.ACTION_ALLOWED, { action, reason: 'not-part-of-thunk-no-global-lock' });
      return true;
    }

    // Find the active thunk for this action
    const thisThunk = this.activeThunks.get(action.__thunkParentId);
    if (!thisThunk) {
      // If the thunk is not active, block if any global lock or overlapping keys
      for (const [id, { keys, bypassLock }] of this.activeThunks.entries()) {
        if (bypassLock) continue;
        if (!keys) {
          debug('thunk-lock', `Action ${action.type} blocked - global lock present`);
          this.emit(ThunkLockEvent.ACTION_BLOCKED, { action, reason: 'global-lock-present' });
          return false;
        }
        // If action has __keys, check for overlap
        if (action.__keys && keys.some((k) => action.__keys!.includes(k))) {
          debug('thunk-lock', `Action ${action.type} blocked - key overlap with active thunk ${id}`);
          this.emit(ThunkLockEvent.ACTION_BLOCKED, { action, reason: 'key-overlap' });
          return false;
        }
      }
      // No global lock or overlap, allow
      debug('thunk-lock', `Action ${action.type} allowed - thunk not active, no global lock/overlap`);
      this.emit(ThunkLockEvent.ACTION_ALLOWED, { action, reason: 'thunk-not-active-no-global-lock-or-overlap' });
      return true;
    }

    // If the thunk is active, allow actions from it
    debug('thunk-lock', `Action ${action.type} allowed - part of active thunk ${action.__thunkParentId}`);
    this.emit(ThunkLockEvent.ACTION_ALLOWED, { action, reason: 'same-thunk' });
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
