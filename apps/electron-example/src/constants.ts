/**
 * Constants used for IPC communication in the Electron Example app.
 * These are specific to the example app and separate from Zubridge's internal channels.
 */
export enum AppIpcChannel {
  /** Channel for notifying when a window has been created */
  WINDOW_CREATED = '__electron_example_window_created',
  /** Channel for getting the current window information */
  GET_WINDOW_INFO = '__electron_example_get_window_info',
  /** Channel for checking if the current window is the main window */
  IS_MAIN_WINDOW = '__electron_example_is_main_window',
  /** Channel for getting the window ID */
  GET_WINDOW_ID = '__electron_example_get_window_id',
  /** Channel for creating a new runtime window */
  CREATE_RUNTIME_WINDOW = '__electron_example_create_runtime_window',
  /** Channel for closing the current window */
  CLOSE_CURRENT_WINDOW = '__electron_example_close_current_window',
  /** Channel for getting the current mode */
  GET_MODE = '__electron_example_get_mode',
  /** Channel for quitting the application */
  QUIT_APP = '__electron_example_quit_app',
  /** Channel for executing a main process thunk */
  EXECUTE_MAIN_THUNK = '__electron_example_execute_main_thunk',
  /** Channel for executing a main process slow thunk */
  EXECUTE_MAIN_THUNK_SLOW = '__electron_example_execute_main_thunk_slow',
}
