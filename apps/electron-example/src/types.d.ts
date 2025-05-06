/**
 * ElectronAPI interface defines the IPC API exposed to renderer processes
 */
export interface ElectronAPI {
  createRuntimeWindow: () => Promise<{ success: boolean; windowId?: number }>;
  closeCurrentWindow: () => Promise<void>;
  quitApp: () => Promise<void>;
  getWindowInfo: () => Promise<{ id: number; type: string }>;
  getMode: () => Promise<{ modeName?: string; name?: string }>;
  minimizeWindow?: () => void;
  maximizeWindow?: () => void;
  openDevTools?: () => void;
}

/**
 * CounterAPI interface defines counter-specific IPC methods
 */
export interface CounterAPI {
  executeMainThunk: () => Promise<{ success: boolean; result?: number }>;
}

/**
 * Base state interface that all mode-specific states share.
 * This defines the minimal structure expected across all modes.
 */
export interface BaseState {
  counter: number;
  theme: {
    isDark: boolean;
  };
  [key: string]: any; // Add index signature to satisfy AnyState constraint
}

/**
 * Shared State type that all modes can use.
 * For now, it's just an alias for BaseState, but can be extended if needed.
 */
export type State = BaseState;

/**
 * Augment the Window interface with our custom APIs
 */
declare global {
  interface Window {
    electronAPI?: ElectronAPI;
    counter?: CounterAPI;
  }
}

// This file is treated as a module
export {};
