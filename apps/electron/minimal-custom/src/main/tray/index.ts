import { createDispatch } from '@zubridge/electron/main';
import type { AnyState, StateManager } from '@zubridge/types';
import type { BrowserWindow } from 'electron';
import type { State } from '../../features/index.js';
import { BaseSystemTray } from './base.js';

/**
 * Custom mode tray implementation
 */
export class CustomSystemTray extends BaseSystemTray {
  private unsubscribe?: () => void;

  public init(store: StateManager<AnyState>, windows: BrowserWindow[]) {
    this.windows = windows;

    console.log('[Custom Tray] Initializing with shared custom store');

    // Unsubscribe from previous subscription if it exists
    if (this.unsubscribe) {
      console.log('[Custom Tray] Cleaning up previous subscription');
      this.unsubscribe();
    }

    // Use the shared store instance from the main process
    this.dispatch = createDispatch(store);

    // Initialize immediately with current state
    this.update(store.getState() as State);

    // Subscribe to state changes to update the tray UI
    this.unsubscribe = store.subscribe((state: AnyState) => {
      console.log('[Custom Tray] State update:', state);
      this.update(state as State);
    });
  }
}

/**
 * Creates a tray instance for the custom minimal app
 */
export function createTray(store: StateManager<AnyState>, windows: BrowserWindow[]) {
  console.log('Creating tray for custom minimal app');

  const tray = new CustomSystemTray();
  tray.init(store, windows);
  return tray;
}

// Export a singleton factory function
export const tray = createTray;
