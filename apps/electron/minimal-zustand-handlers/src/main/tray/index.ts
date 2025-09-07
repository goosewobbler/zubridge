import { createDispatch } from '@zubridge/electron/main';
import type { BrowserWindow } from 'electron';
import type { StoreApi } from 'zustand';
import type { State } from '../../features/index.js';
import { createHandlers } from '../bridge.js';
import { BaseSystemTray } from './base.js';

/**
 * Handlers mode tray implementation
 * In handlers mode, we use createDispatch with custom action handlers,
 * which automatically creates a state manager adapter internally
 */
export class HandlersSystemTray extends BaseSystemTray {
  public init(store: StoreApi<State>, windows: BrowserWindow[]) {
    this.windows = windows;

    console.log('[Handlers Tray] Using shared Zustand store with handlers');

    // Get handlers from bridge
    const handlers = createHandlers(store);

    // Create dispatch directly from the store with handlers
    // createDispatch will automatically create an appropriate state manager internally
    this.dispatch = createDispatch(store, { handlers });

    // Initialize immediately with current state
    this.update(store.getState());

    // Subscribe to state changes to update the tray UI
    store.subscribe((state) => {
      console.log('[Handlers Tray] State update:', state);
      this.update(state);
    });
  }
}

/**
 * Creates a tray instance for the handlers minimal app
 */
export function createTray(store: StoreApi<State>, windows: BrowserWindow[]) {
  console.log('Creating tray for handlers minimal app');

  const tray = new HandlersSystemTray();
  tray.init(store, windows);
  return tray;
}

// Export a singleton factory function
export const tray = createTray;
