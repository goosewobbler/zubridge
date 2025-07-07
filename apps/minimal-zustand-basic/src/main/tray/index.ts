import { type BrowserWindow } from 'electron';
import { type StoreApi } from 'zustand';
import { createDispatch } from '@zubridge/electron/main';
import type { State } from '../../types.js';
import { BaseSystemTray } from './base.js';

/**
 * Basic mode tray implementation
 * In basic mode, we use createDispatch directly with the store, which
 * automatically creates the appropriate adapter internally
 */
export class BasicSystemTray extends BaseSystemTray {
  public init(store: StoreApi<State>, windows: BrowserWindow[]) {
    this.windows = windows;

    // Create dispatch helper from the store
    this.dispatch = createDispatch(store);

    // Initialize immediately with current state
    this.update(store.getState());

    // Subscribe to state changes to update the tray UI
    store.subscribe((state) => this.update(state));
  }
}

/**
 * Creates a tray instance for the basic minimal app
 */
export function createTray(store: StoreApi<State>, windows: BrowserWindow[]) {
  console.log('Creating tray for basic minimal app');

  const tray = new BasicSystemTray();
  tray.init(store, windows);
  return tray;
}

// Export a singleton factory function
export const tray = createTray;
