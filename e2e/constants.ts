// Define a type for the timing configuration
export interface TimingConfig {
  WINDOW_SWITCH_PAUSE: number;
  STATE_SYNC_PAUSE: number;
  BUTTON_CLICK_PAUSE: number;
  WINDOW_CHANGE_PAUSE: number;
  WINDOW_WAIT_TIMEOUT: number;
  WINDOW_WAIT_INTERVAL: number;
  THUNK_WAIT_TIME: number;
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
    THUNK_WAIT_TIME: 2000, // Time to wait for thunk to complete
  },

  // Timing adjustments for Linux (slower CI env)
  linux: {
    WINDOW_SWITCH_PAUSE: 200,
    STATE_SYNC_PAUSE: 500,
    BUTTON_CLICK_PAUSE: 50,
    WINDOW_CHANGE_PAUSE: 200,
    WINDOW_WAIT_TIMEOUT: 10000,
    WINDOW_WAIT_INTERVAL: 500,
    THUNK_WAIT_TIME: 2000,
  },
};

// Determine which timing configuration to use based on platform
export const TIMING: TimingConfig = PLATFORM_TIMING.base;
