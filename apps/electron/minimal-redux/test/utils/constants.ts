// Test timing constants for minimal app tests
// These are shorter than main E2E tests since minimal apps are simpler

export const TIMING = {
  // Button click pause - time to wait after clicking a button
  BUTTON_CLICK_PAUSE: process.platform === 'darwin' ? 500 : 300,

  // State sync pause - time to wait for state to sync between processes
  STATE_SYNC_PAUSE: process.platform === 'darwin' ? 1000 : 750,

  // Window change pause - time to wait when switching between windows
  WINDOW_CHANGE_PAUSE: process.platform === 'darwin' ? 800 : 600,

  // UI interaction pause - general pause for UI interactions
  UI_INTERACTION_PAUSE: 250,

  // Tray interaction pause - time to wait after tray interactions
  TRAY_INTERACTION_PAUSE: process.platform === 'darwin' ? 1500 : 1000,
} as const;

console.log(`Using timing configuration for platform: ${process.platform}`);
