/**
 * Determines if the application is running in development mode
 *
 * Uses a combination of checks to ensure consistent behavior:
 * 1. Checks if app is packaged (production builds are packaged)
 * 2. Checks NODE_ENV environment variable
 * 3. Checks ELECTRON_IS_DEV environment variable (set by electron-is-dev or similar utilities)
 *
 * @returns {boolean} True if running in development mode, false otherwise
 */
export const isDev = async (): Promise<boolean> => {
  // Ensure we have access to the app object (should be in the main process)
  if (process.type !== 'browser') {
    // Not in main process, use environment variables only
    if (process.env.NODE_ENV === 'production' || process.env.ELECTRON_IS_DEV === '0') {
      return false;
    }
    return (
      process.env.NODE_ENV === 'development' ||
      process.env.ELECTRON_IS_DEV === '1' ||
      !process.env.VITE_DEV_SERVER_URL
    );
  }
  const { app } = await import('electron');

  return (
    !app.isPackaged || process.env.NODE_ENV === 'development' || process.env.ELECTRON_IS_DEV === '1'
  );
};
