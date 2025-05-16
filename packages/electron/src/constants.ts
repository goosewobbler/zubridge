/**
 * Constants used for IPC communication between main and renderer processes.
 * These are internal to the Zubridge electron implementation.
 */
export enum IpcChannel {
  /** Channel for subscribing to state updates */
  SUBSCRIBE = '__zubridge_state_update',
  /** Channel for getting the current state */
  GET_STATE = '__zubridge_get_initial_state',
  /** Channel for dispatching actions */
  DISPATCH = '__zubridge_dispatch_action',
  /** Channel for acknowledging action dispatches */
  DISPATCH_ACK = '__zubridge_dispatch_ack',
  /** Channel for registering thunks */
  REGISTER_THUNK = '__zubridge_register_thunk',
  /** Channel for completing thunks */
  COMPLETE_THUNK = '__zubridge_complete_thunk',
  /** Channel for getting the window ID in the renderer */
  GET_WINDOW_ID = '__zubridge_get_window_id',
  /** Channel for getting the current thunk state */
  GET_THUNK_STATE = '__zubridge_get_thunk_state',
}
