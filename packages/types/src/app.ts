/**
 * Application-specific window augmentations
 * For use by example applications and E2E testing
 * Extends ZubridgeInternalWindow to gain access to the core APIs
 */
export interface ZubridgeAppWindow {
  /**
   * Counter API for thunk testing
   */
  counter?: {
    executeMainThunk: () => Promise<unknown>;
    executeMainThunkSlow: () => Promise<unknown>;
  };

  /**
   * Bypass flags for testing access control and thunk locking
   */
  bypassFlags?: {
    bypassAccessControl: boolean;
    bypassThunkLock: boolean;
  };

  /**
   * Electron IPC API exposed through contextBridge
   */
  electronAPI?: {
    createRuntimeWindow: () => Promise<{ success: boolean; windowId: number }>;
    closeCurrentWindow: () => Promise<void>;
    quitApp: () => Promise<void>;
    getWindowInfo: () => Promise<{ id: number; type: string; subscriptions: string[] }>;
    getMode: () => Promise<{ modeName: string; name?: string }>;
    subscribe: (
      keys: string[],
    ) => Promise<{ success: boolean; subscriptions?: string[]; error?: string }>;
    unsubscribe: (
      keys: string[],
    ) => Promise<{ success: boolean; subscriptions?: string[]; error?: string }>;
    minimizeWindow?: () => void;
    maximizeWindow?: () => void;
    openDevTools?: () => void;
  };

  /**
   * Process API for environment information
   */
  processAPI?: {
    platform: string;
    env: (name: string) => string | undefined;
  };
}

// Extend Window with application-specific properties
declare global {
  interface Window extends ZubridgeAppWindow {}
}
