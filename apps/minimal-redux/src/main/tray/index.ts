import { type BrowserWindow } from 'electron';
import { createDispatch } from '@zubridge/electron/main';
import { BaseSystemTray } from './base.js';
import type { State } from '../../features/index.js';
import type { Store } from 'redux';

/**
 * Redux mode tray implementation
 * In redux mode, we use createDispatch directly with a Redux store,
 * which automatically creates a Redux state manager adapter internally
 */
export class ReduxSystemTray extends BaseSystemTray {
  private store: Store<any> | null = null;
  private storeUnsubscribe: (() => void) | null = null;

  public init(store: Store, windows: BrowserWindow[]) {
    this.windows = windows;

    // Use the shared store from the main process
    this.store = store;
    console.log('[Redux Tray] Using shared Redux store');

    // Create dispatch directly from the store
    this.dispatch = createDispatch(this.store);

    // Initialize immediately with current state
    const reduxState = this.store.getState();
    this.update({
      counter: reduxState.counter,
      theme: reduxState.theme === 'dark' ? 'dark' : 'light',
    } as State);

    // Subscribe to state changes to update the tray UI
    const unsubscribe = this.store.subscribe(() => {
      if (this.store) {
        const state = this.store.getState();
        console.log(`[Redux Tray] State update:`, state);

        // Update the tray with the current state
        this.update({
          counter: state.counter,
          theme: state.theme === 'dark' ? 'dark' : 'light',
        } as State);
      }
    });

    this.storeUnsubscribe = unsubscribe;
  }

  // Override the destroy property with our own implementation
  public destroy = () => {
    if (this.storeUnsubscribe) {
      this.storeUnsubscribe();
      this.storeUnsubscribe = null;
    }
    this.dispatch = undefined;
    this.store = null;

    // Call the parent implementation
    if (this.electronTray) {
      this.electronTray.destroy();
      this.electronTray = undefined;
    }
  };
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
