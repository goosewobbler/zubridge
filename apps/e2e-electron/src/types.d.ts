/**
 * ElectronAPI interface defines the IPC API exposed to renderer processes
 */
export interface ElectronAPI {
  createRuntimeWindow: () => Promise<{ success: boolean; windowId?: number }>;
  closeCurrentWindow: () => Promise<void>;
  quitApp: () => Promise<void>;
  getWindowInfo: () => Promise<{ id: number; type: string; subscriptions: string[] }>;
  getMode: () => Promise<{ mode?: string; modeName?: string }>;
  minimizeWindow?: () => void;
  maximizeWindow?: () => void;
  openDevTools?: () => void;
  subscribe: (
    keys: string[],
  ) => Promise<{ success: boolean; subscriptions?: string[]; error?: string }>;
  unsubscribe: (
    keys: string[],
  ) => Promise<{ success: boolean; subscriptions?: string[]; error?: string }>;
}

/**
 * CounterAPI interface defines counter-specific IPC methods
 */
export interface CounterAPI {
  executeMainThunk: () => Promise<{ success: boolean; result?: number }>;
  executeMainThunkSlow: () => Promise<{ success: boolean; result?: number }>;
}

/**
 * ProcessAPI interface defines the process API exposed to the renderer process
 */
export interface ProcessAPI {
  platform: string;
  env: (name: string) => string;
}

// Import the BaseState from apps-shared
import { BaseState as SharedBaseState } from '@zubridge/apps-shared';
// Import app window augmentations
import type {} from '@zubridge/types/app';

/**
 * Base state interface that all mode-specific states share.
 * This extends the apps-shared BaseState which now has optional properties
 * for better type compatibility between State and Partial<State>
 */
export interface BaseState extends SharedBaseState {
  // Additional fields can be added here if needed
  [key: string]: any; // Add index signature to satisfy AnyState constraint
}

/**
 * Shared State type that all modes can use.
 * For now, it's just an alias for BaseState, but can be extended if needed.
 */
export type State = BaseState;

// This file is treated as a module
export {};
