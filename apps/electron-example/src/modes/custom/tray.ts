import { type BrowserWindow } from 'electron';
import { createDispatch } from '@zubridge/electron/main';
import { BaseSystemTray } from '../../main/tray/base.js';
import type { BaseState } from '../../types/index.js';
import type { Store } from 'redux';
import type { StoreApi } from 'zustand';
import type { Dispatch } from '@zubridge/types';
import { getCustomStore } from './store.js';

/**
 * Custom mode tray implementation
 */
export class CustomSystemTray extends BaseSystemTray {
  public init(_store: StoreApi<BaseState> | Store | any, window: BrowserWindow) {
    this.window = window;

    console.log('[Custom Tray] Initializing with custom store');

    // Get a custom store instance
    const customStore = getCustomStore();

    // Create dispatch using the custom store with proper type cast for BaseState
    this.dispatch = createDispatch(customStore) as unknown as Dispatch<BaseState>;

    // Initialize immediately with current state
    this.update(customStore.getState() as BaseState);

    // Subscribe to state changes to update the tray UI
    customStore.subscribe((state) => {
      console.log(`[Custom Tray] State update:`, state);
      this.update(state as BaseState);
    });
  }
}
