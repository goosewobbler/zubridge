import { createDispatch } from '@zubridge/electron/main';
import type { BrowserWindow } from 'electron';
import type { StoreApi } from 'zustand';
import type { State } from '../../features/index.js';
import { rootReducer } from '../../features/index.js';
import { BaseSystemTray } from './base.js';

/**
 * Reducers mode tray implementation
 * In reducers mode, we use createDispatch with a root reducer,
 * which automatically creates a state manager adapter internally
 */
export class ReducersSystemTray extends BaseSystemTray {
  private unsubscribe?: () => void;

  public init(store: StoreApi<State>, windows: BrowserWindow[]) {
    this.windows = windows;

    console.log('[Reducers Tray] Using shared Zustand store with reducers');

    // Unsubscribe from previous subscription if it exists
    if (this.unsubscribe) {
      console.log('[Reducers Tray] Cleaning up previous subscription');
      this.unsubscribe();
    }

    // Create dispatch directly from the store with reducer option
    this.dispatch = createDispatch<State>(store, { reducer: rootReducer });

    // Initialize immediately with current state
    this.update(store.getState());

    // Subscribe to state changes to update the tray UI
    this.unsubscribe = store.subscribe((state) => {
      console.log('[Reducers Tray] State update:', state);
      this.update(state);
    });
  }
}

/**
 * Creates a tray instance for the reducers minimal app
 */
export function createTray(store: StoreApi<State>, windows: BrowserWindow[]) {
  console.log('Creating tray for reducers minimal app');

  const tray = new ReducersSystemTray();
  tray.init(store, windows);
  return tray;
}

// Export a singleton factory function
export const tray = createTray;
