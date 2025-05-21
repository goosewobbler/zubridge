import { createZustandBridge } from '@zubridge/electron/main';
import type { StoreApi } from 'zustand';
import type { ZubridgeMiddleware, ZustandBridge } from '@zubridge/electron/main';

import { attachCounterHandlers } from './features/counter/index.js';
import { attachThemeHandlers } from './features/theme/index.js';
import type { BaseState } from '../../types.js';

/**
 * Creates a bridge using the basic approach
 * In this approach, handlers are attached to the store object
 */
export const createBasicBridge = <S extends BaseState, Store extends StoreApi<S>>(
  store: Store,
  middleware?: ZubridgeMiddleware,
): ZustandBridge => {
  console.log('[Basic Mode] Creating bridge with store-based handlers');

  // Attach handlers to the store with generic type parameter
  attachCounterHandlers<S>(store);
  attachThemeHandlers<S>(store);

  // Create bridge with middleware if provided
  return createZustandBridge<S>(store, {
    middleware,
  });
};
