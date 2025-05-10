/**
 * Common window types across platforms
 */
export type WindowType = 'main' | 'runtime' | 'directWebContents' | 'browserView' | 'webContentsView' | 'secondary';

/**
 * Information about the current window
 */
export interface WindowInfo {
  /**
   * Window identifier - could be a number (Electron) or string (Tauri)
   */
  id: number | string;

  /**
   * Type of window
   */
  type: WindowType;

  /**
   * Platform identifier (e.g., 'electron', 'tauri', 'basic')
   */
  platform: string;
}

/**
 * Base handlers that must be implemented for each platform
 */
export interface ActionHandlers {
  /**
   * Create a new window
   */
  createWindow: () => Promise<{ success: boolean; id?: number | string }>;

  /**
   * Close the current window
   */
  closeWindow: () => Promise<{ success: boolean }>;

  /**
   * Quit the application (optional - only for main windows)
   */
  quitApp?: () => Promise<{ success: boolean }>;

  /**
   * Double counter thunk implementation
   */
  doubleCounter?: (counter: number) => any;
}

/**
 * Get a display-friendly window title based on window type
 */
export function getWindowTitle(windowType: WindowType, windowInfo: WindowInfo): string {
  switch (windowType) {
    case 'main':
      return 'Main Window';
    case 'runtime':
      return 'Runtime Window';
    case 'directWebContents':
      return 'Direct WebContents Window';
    case 'browserView':
      return 'Browser View Window';
    case 'webContentsView':
      return 'WebContents View Window';
    case 'secondary':
      return 'Secondary Window';
    default:
      return `Window ${String(windowInfo.id)}`;
  }
}
