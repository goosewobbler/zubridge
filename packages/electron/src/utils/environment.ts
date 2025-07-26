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
  const { app } = await import('electron');

  // Handle the case where NODE_ENV is explicitly set to production or ELECTRON_IS_DEV is set to 0
  if (process.env.NODE_ENV === 'production' || process.env.ELECTRON_IS_DEV === '0') {
    return false;
  }

  if (typeof app !== 'undefined') {
    return !app.isPackaged || process.env.NODE_ENV === 'development' || process.env.ELECTRON_IS_DEV === '1';
  }

  // Fallback for renderer process or when app isn't available
  return (
    process.env.NODE_ENV === 'development' || process.env.ELECTRON_IS_DEV === '1' || !process.env.VITE_DEV_SERVER_URL
  ); // Vite-specific check
};
