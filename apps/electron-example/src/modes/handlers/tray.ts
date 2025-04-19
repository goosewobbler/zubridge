import { type BrowserWindow } from 'electron';
import { type StoreApi } from 'zustand';
import { createDispatch } from '@zubridge/electron/main';
import type { State } from '../../types/index.js';
import { BaseSystemTray } from '../../main/tray/base.js';

// Import handlers from main.ts
import { createHandlers } from './main.js';

/**
 * Handlers mode tray implementation
 * In handlers mode, we use createDispatch with custom action handlers,
 * which automatically creates a state manager adapter internally
 */
export class HandlersSystemTray extends BaseSystemTray {
  public init(store: StoreApi<State>, window: BrowserWindow) {
    this.window = window;

    // Get handlers from main.ts
    const handlers = createHandlers(store);

    // Create dispatch directly from the store with handlers
    // createDispatch will automatically create an appropriate state manager internally
    this.dispatch = createDispatch(store, { handlers });

    // Initialize immediately with current state
    this.update(store.getState());

    // Subscribe to state changes to update the tray UI
    store.subscribe((state) => this.update(state));
  }
}
