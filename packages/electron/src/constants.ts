/**
 * Constants used for IPC communication between main and renderer processes.
 * These are internal to the Zubridge electron implementation.
 */
export enum IpcChannel {
  /**
   * Used by renderer to send actions to main process
   */
  DISPATCH = 'zubridge:dispatch',

  /**
   * Used by main process to acknowledge action receipt
   */
  DISPATCH_ACK = 'zubridge:dispatch-ack',

  /**
   * Used by renderer to get state from main process
   */
  GET_STATE = 'zubridge:get-state',

  /**
   * Used by main process to send state updates to renderer
   */
  SUBSCRIBE = 'zubridge:subscribe',

  /**
   * Used by main process to send state updates to renderer with tracking
   */
  STATE_UPDATE = 'zubridge:state-update',

  /**
   * Used by renderer to acknowledge receipt of state update
   */
  STATE_UPDATE_ACK = 'zubridge:state-update-ack',

  /**
   * Used by renderer to register a thunk with main process
   */
  REGISTER_THUNK = 'zubridge:register-thunk',

  /**
   * Used by main process to acknowledge thunk registration
   */
  REGISTER_THUNK_ACK = 'zubridge:register-thunk-ack',

  /**
   * Used by renderer to notify main process of thunk completion
   */
  COMPLETE_THUNK = 'zubridge:complete-thunk',

  /**
   * Used by renderer to get window ID from main process
   */
  GET_WINDOW_ID = 'zubridge:get-window-id',

  /**
   * Used by renderer to get current thunk state from main process
   */
  GET_THUNK_STATE = 'zubridge:get-thunk-state',

  /**
   * Used by renderer to track action dispatch for performance metrics
   */
  TRACK_ACTION_DISPATCH = 'zubridge:track-action-dispatch',

  /**
   * Used by renderer to get window subscriptions from main process
   */
  GET_WINDOW_SUBSCRIPTIONS = 'zubridge:get-window-subscriptions',
}

/**
 * Defines priority levels for thunks in the scheduler
 * Higher numbers indicate higher priority
 */
export enum ThunkPriority {
  /**
   * Highest priority thunks that can run concurrently with other thunks
   * Used for bypass thunks that should not be blocked
   */
  BYPASS = 100,

  /**
   * High priority thunks
   * Reserved for future use (high priority but not bypass)
   */
  HIGH = 75,

  /**
   * Standard priority for most thunks
   * This is the default priority level
   */
  NORMAL = 50,

  /**
   * Lower priority thunks
   * Used for background tasks that can wait
   */
  LOW = 25,

  /**
   * Lowest priority
   * Only runs when nothing else is running
   */
  IDLE = 0,
}

/**
 * Events emitted by the ThunkScheduler
 */
export const ThunkSchedulerEvents = {
  /**
   * Emitted when a task is added to the queue
   * Payload: task
   */
  TASK_QUEUED: 'task:queued',

  /**
   * Emitted when a task starts execution
   * Payload: task
   */
  TASK_STARTED: 'task:started',

  /**
   * Emitted when a task completes successfully
   * Payload: task, result
   */
  TASK_COMPLETED: 'task:completed',

  /**
   * Emitted when a task fails with an error
   * Payload: task, error
   */
  TASK_FAILED: 'task:failed',

  /**
   * Emitted when the queue state changes
   * (task added, started, completed, or failed)
   */
  QUEUE_CHANGED: 'queue:changed',
} as const;
