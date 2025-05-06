import type { PlatformHandlers } from '../WindowInfo';

/**
 * Creates platform-specific handlers for Electron
 *
 * @param window - The global window object
 * @returns Platform-specific handlers
 */
export function createElectronAdapter(window: Window): PlatformHandlers {
  return {
    createWindow: async () => {
      try {
        if (!window.electronAPI) {
          console.error('electronAPI not available');
          return { success: false };
        }

        const result = await window.electronAPI.createRuntimeWindow();
        return {
          success: result.success,
          id: result.windowId,
        };
      } catch (error) {
        console.error('Error creating window:', error);
        return { success: false };
      }
    },

    closeWindow: async () => {
      try {
        if (!window.electronAPI) {
          console.error('electronAPI not available');
          return { success: false };
        }

        await window.electronAPI.closeCurrentWindow();
        return { success: true };
      } catch (error) {
        console.error('Error closing window:', error);
        return { success: false };
      }
    },

    quitApp: async () => {
      try {
        if (!window.electronAPI) {
          console.error('electronAPI not available');
          return { success: false };
        }

        await window.electronAPI.quitApp();
        return { success: true };
      } catch (error) {
        console.error('Error quitting app:', error);
        return { success: false };
      }
    },
  };
}
