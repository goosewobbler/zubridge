import { v4 as uuidv4 } from 'uuid';
import { ThunkState } from '@zubridge/types';

export interface ThunkOptions {
  id?: string;
  sourceWindowId: number;
  type: 'main' | 'renderer';
  parentId?: string;
  keys?: string[];
  bypassThunkLock?: boolean;
  bypassAccessControl?: boolean;
}

/**
 * Represents a thunk in the system
 */
export class Thunk {
  /** Unique identifier for this thunk */
  readonly id: string;

  /** ID of the window that dispatched this thunk */
  private _sourceWindowId: number;

  /** Parent thunk ID if this is a nested thunk */
  readonly parentId?: string;

  /** Thunk type: 'main' or 'renderer' */
  public type: 'main' | 'renderer';

  /** Current state of the thunk */
  private _state: ThunkState;

  /** Time when the thunk was created */
  readonly startTime: number;

  /** Set of child thunk IDs */
  private children: Set<string>;

  /** Keys this thunk will affect (for key-based locking) */
  public keys?: string[];

  /** Flag for lock bypass */
  public bypassThunkLock?: boolean;

  /** Flag for access control bypass */
  public bypassAccessControl?: boolean;

  constructor(options: ThunkOptions) {
    this.id = options.id || uuidv4();
    this._sourceWindowId = options.sourceWindowId;
    this.parentId = options.parentId;
    this.type = options.type;
    this._state = ThunkState.PENDING;
    this.startTime = Date.now();
    this.children = new Set();
    this.keys = options.keys;
    this.bypassThunkLock = options.bypassThunkLock;
    this.bypassAccessControl = options.bypassAccessControl;
  }

  /**
   * Get the source window ID
   */
  get sourceWindowId(): number {
    return this._sourceWindowId;
  }

  /**
   * Set the source window ID
   */
  set sourceWindowId(windowId: number) {
    this._sourceWindowId = windowId;
  }

  /**
   * Get the current state of the thunk
   */
  get state(): ThunkState {
    return this._state;
  }

  /**
   * Mark the thunk as active (processing)
   */
  activate(): void {
    this._state = ThunkState.EXECUTING;
  }

  /**
   * Mark the thunk as completed
   */
  complete(): void {
    this._state = ThunkState.COMPLETED;
  }

  /**
   * Mark the thunk as failed
   */
  fail(): void {
    this._state = ThunkState.FAILED;
  }

  /**
   * Add a child thunk to this thunk
   */
  addChild(childId: string): void {
    this.children.add(childId);
  }

  /**
   * Get all child thunk IDs
   */
  getChildren(): string[] {
    return Array.from(this.children);
  }

  /**
   * Check if the thunk is in a terminal state (completed or failed)
   */
  isComplete(): boolean {
    return this._state === ThunkState.COMPLETED || this._state === ThunkState.FAILED;
  }
}
