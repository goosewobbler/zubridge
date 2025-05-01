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
}
