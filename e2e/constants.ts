// Define a type for the timing configuration
export interface TimingConfig {
  WINDOW_SWITCH_PAUSE: number;
  STATE_SYNC_PAUSE: number;
  BUTTON_CLICK_PAUSE: number;
  WINDOW_CHANGE_PAUSE: number;
  WINDOW_WAIT_TIMEOUT: number;
  WINDOW_WAIT_INTERVAL: number;
  THUNK_WAIT_TIME: number;
  THUNK_START_PAUSE: number;
  UI_INTERACTION_PAUSE: number;
  FAST_ACTION_MAX_TIME: number;
  LONG_THUNK_WAIT_TIME: number;
}

// Platform-specific timing configurations
export const PLATFORM_TIMING: Record<string, TimingConfig> = {
  // Base timing values (used for macOS / Windows)
  base: {
    WINDOW_SWITCH_PAUSE: 100,
    STATE_SYNC_PAUSE: 250, // Time to wait for state to sync between windows
    BUTTON_CLICK_PAUSE: 50, // Time to wait after clicking a button
    WINDOW_CHANGE_PAUSE: 200, // Time to wait after window creation/deletion
    WINDOW_WAIT_TIMEOUT: 3000, // Maximum time to wait for window operations
    WINDOW_WAIT_INTERVAL: 150, // How often to check window availability
    THUNK_WAIT_TIME: 5000, // Time to wait for thunk to complete
    THUNK_START_PAUSE: 1000, // Time to wait for thunk to start
    UI_INTERACTION_PAUSE: 500,
    FAST_ACTION_MAX_TIME: 1000, // Maximum time a bypass action should take to complete
    LONG_THUNK_WAIT_TIME: 15000, // Extended wait time for operations that might take longer
  },

  // Timing adjustments for Linux (slower CI env)
  linux: {
    WINDOW_SWITCH_PAUSE: 200,
    STATE_SYNC_PAUSE: 500,
    BUTTON_CLICK_PAUSE: 50,
    WINDOW_CHANGE_PAUSE: 200,
    WINDOW_WAIT_TIMEOUT: 10000,
    WINDOW_WAIT_INTERVAL: 500,
    THUNK_WAIT_TIME: 15000,
    THUNK_START_PAUSE: 1000,
    UI_INTERACTION_PAUSE: 500,
    FAST_ACTION_MAX_TIME: 2000, // Maximum time a bypass action should take to complete (slower on Linux)
    LONG_THUNK_WAIT_TIME: 30000, // Extended wait time for operations that might take longer (slower on Linux)
  },
};

// Log the platform we're using
console.log(`[PLATFORM] Using platform '${process.platform}' for timing configuration`);

// Determine which timing configuration to use based on platform
export const TIMING: TimingConfig = PLATFORM_TIMING[process.platform] || PLATFORM_TIMING.base;
