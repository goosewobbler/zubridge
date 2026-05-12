export const TIMING = {
  BUTTON_CLICK_PAUSE: process.platform === 'darwin' ? 500 : 300,
  STATE_SYNC_PAUSE: process.platform === 'darwin' ? 1000 : 750,
  WINDOW_CHANGE_PAUSE: process.platform === 'darwin' ? 800 : 600,
} as const;
