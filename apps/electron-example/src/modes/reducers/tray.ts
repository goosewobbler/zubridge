import { type BrowserWindow } from 'electron';
import { type StoreApi } from 'zustand';
import { createDispatch } from '@zubridge/electron/main';

import { BaseSystemTray } from '../../main/tray/base.js';
import { rootReducer } from './features/index.js';
import type { State } from '../../types/index.js';

/**
 * Reducers mode tray implementation
 * In reducers mode, we use createDispatch with a root reducer,
 * which automatically creates a state manager adapter internally
 */
export class ReducersSystemTray extends BaseSystemTray {
  public init(store: StoreApi<State>, window: BrowserWindow) {
    this.window = window;

    // Create dispatch directly from the store with reducer option
    this.dispatch = createDispatch(store, { reducer: rootReducer });

    // Initialize immediately with current state
    this.update(store.getState());

    // Subscribe to state changes to update the tray UI
    store.subscribe((state) => this.update(state));
  }
}
