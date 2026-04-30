/**
 * Wire-protocol identifiers shared between this package and
 * `tauri-plugin-zubridge`. Tauri's plugin command path takes the form
 * `plugin:<plugin>|<command>`.
 */

export const PLUGIN_NAME = 'zubridge';

const cmd = (name: string) => `plugin:${PLUGIN_NAME}|${name}`;

export const TauriCommands = {
  GET_INITIAL_STATE: cmd('get_initial_state'),
  GET_STATE: cmd('get_state'),
  DISPATCH_ACTION: cmd('dispatch_action'),
  BATCH_DISPATCH: cmd('batch_dispatch'),
  REGISTER_THUNK: cmd('register_thunk'),
  COMPLETE_THUNK: cmd('complete_thunk'),
  STATE_UPDATE_ACK: cmd('state_update_ack'),
  SUBSCRIBE: cmd('subscribe'),
  UNSUBSCRIBE: cmd('unsubscribe'),
  GET_WINDOW_SUBSCRIPTIONS: cmd('get_window_subscriptions'),
} as const;

/**
 * Direct (non-plugin) command names. Supplied as a fallback for hosts that
 * register the commands at the top level rather than via the plugin builder.
 */
export const DirectCommands = {
  GET_INITIAL_STATE: 'get_initial_state',
  GET_STATE: 'get_state',
  DISPATCH_ACTION: 'dispatch_action',
  BATCH_DISPATCH: 'batch_dispatch',
  REGISTER_THUNK: 'register_thunk',
  COMPLETE_THUNK: 'complete_thunk',
  STATE_UPDATE_ACK: 'state_update_ack',
  SUBSCRIBE: 'subscribe',
  UNSUBSCRIBE: 'unsubscribe',
  GET_WINDOW_SUBSCRIPTIONS: 'get_window_subscriptions',
} as const;

export const TauriEvents = {
  STATE_UPDATE: 'zubridge://state-update',
} as const;
