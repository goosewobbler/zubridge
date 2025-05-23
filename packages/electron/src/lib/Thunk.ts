import { ThunkState } from '@zubridge/types';

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

  /** Current state of the thunk */
  private _state: ThunkState;

  /** Time when the thunk was created */
  readonly startTime: number;

  /** Set of child thunk IDs */
  private children: Set<string>;

  constructor(id: string, sourceWindowId: number, parentId?: string) {
    this.id = id;
    this._sourceWindowId = sourceWindowId;
    this.parentId = parentId;
    this._state = ThunkState.PENDING;
    this.startTime = Date.now();
    this.children = new Set();
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
