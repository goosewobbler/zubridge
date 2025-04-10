import { type BrowserWindow } from 'electron';
import { type StoreApi } from 'zustand';
import { createDispatch } from '@zubridge/electron/main';
import type { State } from '../../types/state.js';
import { BaseSystemTray } from '../../main/tray/base.js';

// Import handlers from main.ts
import { createHandlers } from './main.js';

/**
 * Handlers mode tray implementation
 * In handlers mode, we provide action handlers to the dispatch
 */
export class HandlersSystemTray extends BaseSystemTray {
  public init(store: StoreApi<State>, window: BrowserWindow) {
    this.window = window;

    // Get handlers from main.ts
    const handlers = createHandlers(store);

    // Create dispatch with handlers
    this.dispatch = createDispatch<State, StoreApi<State>>(store, { handlers });

    // Initialize immediately with current state
    this.update(store.getState());

    // Subscribe to state changes to update the tray UI
    store.subscribe((state) => this.update(state));
  }
}
