import { createDispatch } from '@zubridge/electron/main';
import type { BrowserWindow } from 'electron';
import type { Store } from 'redux';
import type { State } from '../../features/index.js';
import { BaseSystemTray } from './base.js';

/**
 * Redux mode tray implementation
 * In redux mode, we use createDispatch directly with a Redux store,
 * which automatically creates a Redux state manager adapter internally
 */
export class ReduxSystemTray extends BaseSystemTray {
  public init(store: Store, windows: BrowserWindow[]) {
    this.windows = windows;

    console.log('[Redux Tray] Using shared Redux store');

    // Create dispatch directly from the store
    this.dispatch = createDispatch(store);

    // Initialize immediately with current state
    const reduxState = store.getState();
    this.update({
      counter: reduxState.counter,
      theme: reduxState.theme === 'dark' ? 'dark' : 'light',
    } as State);

    // Subscribe to state changes to update the tray UI
    store.subscribe(() => {
      const state = store.getState();
      console.log('[Redux Tray] State update:', state);

      // Update the tray with the current state
      this.update({
        counter: state.counter,
        theme: state.theme === 'dark' ? 'dark' : 'light',
      } as State);
    });
  }
}

/**
 * Creates a tray instance for the Redux minimal app
 */
export function createTray(store: Store, windows: BrowserWindow[]) {
  console.log('Creating tray for Redux minimal app');

  const tray = new ReduxSystemTray();
  tray.init(store, windows);
  return tray;
}

// Export a singleton factory function
export const tray = createTray;
