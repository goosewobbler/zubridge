import { type BrowserWindow } from 'electron';
import { type StoreApi } from 'zustand';
import { createDispatch } from '@zubridge/electron/main';
import type { State } from '../../types/index.js';
import { BaseSystemTray } from '../../main/tray/base.js';

/**
 * Basic mode tray implementation
 * In basic mode, we use createDispatch directly with the store, which
 * automatically creates the appropriate adapter internally
 */
export class BasicSystemTray extends BaseSystemTray {
  public init(store: StoreApi<State>, window: BrowserWindow) {
    this.window = window;

    // Create dispatch directly from the store
    this.dispatch = createDispatch(store);

    // Initialize immediately with current state
    this.update(store.getState());

    // Subscribe to state changes to update the tray UI
    store.subscribe((state) => this.update(state));
  }
}
