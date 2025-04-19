import { createZustandBridge } from '@zubridge/electron/main';
import type { BrowserWindow } from 'electron';
import type { StoreApi } from 'zustand';
import type { ZustandBridge } from '@zubridge/electron/main';

import { attachCounterHandlers } from './features/counter/index.js';
import { attachThemeHandlers } from './features/theme/index.js';
import type { BaseState } from '../../types/index.js';

/**
 * Creates a bridge using the basic approach
 * In this approach, handlers are attached to the store object
 */
export const createBasicBridge = <S extends BaseState, Store extends StoreApi<S>>(
  store: Store,
  windows: BrowserWindow[],
): ZustandBridge => {
  console.log('[Basic Mode] Creating bridge with store-based handlers');

  // Attach handlers to the store with generic type parameter
  attachCounterHandlers<S>(store);
  attachThemeHandlers<S>(store);

  // Create bridge without explicit handlers or reducer
  return createZustandBridge<S>(store, windows);
};
