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
}
