import { type BrowserWindow } from 'electron';
import { createDispatch } from '@zubridge/electron/main';
import { BaseSystemTray } from './base.js';
import type { State } from '../../types.js';
import type { ZustandBridge } from '@zubridge/electron/main';
import type { StateManager, AnyState } from '@zubridge/types';

/**
 * Custom mode tray implementation
 */
export class CustomSystemTray extends BaseSystemTray {
  public init(bridge: ZustandBridge, store: StateManager<AnyState>, windows: BrowserWindow[]) {
    this.windows = windows;

    console.log('[Custom Tray] Initializing with shared custom store');

    // Use the shared store instance from the main process
    this.dispatch = createDispatch(store) as any;

    // Initialize immediately with current state
    this.update(store.getState() as State);

    // Subscribe to state changes to update the tray UI
    store.subscribe((state: AnyState) => {
      console.log(`[Custom Tray] State update:`, state);
      this.update(state as State);
    });
  }
}

/**
 * Creates a tray instance for the custom minimal app
 */
export function createTray(bridge: ZustandBridge, store: StateManager<AnyState>, windows: BrowserWindow[]) {
  console.log('Creating tray for custom minimal app');

  const tray = new CustomSystemTray();
  tray.init(bridge, store, windows);
  return tray;
}

// Export a singleton factory function
export const tray = createTray;
