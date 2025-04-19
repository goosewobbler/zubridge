import { type BrowserWindow } from 'electron';
import { createDispatch } from '@zubridge/electron/main';
import { BaseSystemTray } from '../../main/tray/base.js';
import type { Store } from 'redux';
import type { BaseState } from '../../types/index.js';
import type { StoreApi } from 'zustand';

/**
 * Redux mode tray implementation
 * In redux mode, we use createDispatch directly with a Redux store,
 * which automatically creates a Redux state manager adapter internally
 */
export class ReduxSystemTray extends BaseSystemTray {
  private store: Store<any> | null = null;
  private storeUnsubscribe: (() => void) | null = null;

  public init(store: StoreApi<BaseState> | Store<any>, window: BrowserWindow) {
    this.window = window;

    // Use the shared store from the main process
    this.store = store as Store<any>;
    console.log('[Redux Tray] Using shared Redux store');

    // Create dispatch directly from the store
    this.dispatch = createDispatch(this.store);

    // Initialize immediately with current state
    const reduxState = this.store.getState();
    this.update({
      counter: reduxState.counter,
      theme: {
        isDark: reduxState.theme?.isDark ?? false,
      },
      window: { isOpen: false }, // Provide required window state for BaseState
    } as BaseState);

    // Subscribe to state changes to update the tray UI
    const unsubscribe = this.store.subscribe(() => {
      if (this.store) {
        const state = this.store.getState();
        console.log(`[Redux Tray] State update:`, state);

        // Update the tray with the current state
        this.update({
          counter: state.counter,
          theme: {
            isDark: state.theme?.isDark ?? false,
          },
          window: { isOpen: false }, // Provide required window state for BaseState
        } as BaseState);
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
