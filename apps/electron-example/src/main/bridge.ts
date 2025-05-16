import type { StoreApi } from 'zustand';
import type { ZubridgeMiddleware, ZustandBridge } from '@zubridge/electron/main';
import type { Store as ReduxStore } from 'redux';

import { getZubridgeMode } from '../utils/mode.js';
import type { BaseState } from '../types.js';

/**
 * Creates the appropriate bridge implementation based on the selected mode
 */
export const createBridge = async <S extends BaseState, Store extends StoreApi<S>>(
  store: Store | ReduxStore,
  middleware?: ZubridgeMiddleware,
): Promise<ZustandBridge> => {
  const mode = getZubridgeMode();
  console.log(`[Main] Using Zubridge mode: ${mode}`);

  switch (mode) {
    case 'basic':
      const { createBasicBridge } = await import('../modes/basic/main.js');
      return createBasicBridge(store as Store, middleware);

    case 'handlers':
      const { createHandlersBridge } = await import('../modes/handlers/main.js');
      return createHandlersBridge(store as Store, middleware);

    case 'reducers':
      const { createReducersBridge } = await import('../modes/reducers/main.js');
      return createReducersBridge(store as Store, middleware);

    case 'redux':
      const { createReduxBridge } = await import('../modes/redux/main.js');
      return createReduxBridge(store as ReduxStore, middleware);

    case 'custom':
      const { createCustomBridge } = await import('../modes/custom/main.js');
      return createCustomBridge(middleware);

    default:
      // This should never happen due to validation in getZubridgeMode
      console.warn(`[Main] Unknown mode: ${mode}, falling back to reducers mode`);
      const { createReducersBridge: fallback } = await import('../modes/reducers/main.js');
      return fallback(store as Store, middleware);
  }
};
