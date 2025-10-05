import type { ReduxBridge, ZubridgeMiddleware, ZustandBridge } from '@zubridge/electron/main';
import type { CustomBridge } from '@zubridge/types';
import { debug } from '@zubridge/utils';

import { getZubridgeMode, ZubridgeMode } from '../utils/mode.js';

// Union type for all possible bridge return types
export type AnyBridge = ZustandBridge | ReduxBridge | CustomBridge;

/**
 * Creates the appropriate bridge implementation based on the selected mode
 */
export const createBridge = async (middleware?: ZubridgeMiddleware): Promise<AnyBridge> => {
  const mode = getZubridgeMode();
  debug('core', `[Main] Using Zubridge mode: ${mode}`);

  switch (mode) {
    case ZubridgeMode.ZustandBasic: {
      const { createBasicBridge } = await import('../modes/zustand-basic/main.js');
      const { getBasicStore } = await import('../modes/zustand-basic/store.js');
      return createBasicBridge(getBasicStore(), middleware);
    }

    case ZubridgeMode.ZustandHandlers: {
      const { createHandlersBridge } = await import('../modes/zustand-handlers/main.js');
      const { getHandlersStore } = await import('../modes/zustand-handlers/store.js');
      return createHandlersBridge(getHandlersStore(), middleware);
    }

    case ZubridgeMode.ZustandReducers: {
      const { createReducersBridge } = await import('../modes/zustand-reducers/main.js');
      const { getReducersStore } = await import('../modes/zustand-reducers/store.js');
      return createReducersBridge(getReducersStore(), middleware);
    }

    case ZubridgeMode.Redux: {
      const { createReduxBridge } = await import('../modes/redux/main.js');
      const { rootReducer } = await import('../modes/redux/features/index.js');
      const { configureStore } = await import('@reduxjs/toolkit');

      // Create Redux store directly for bridge use
      const reduxStore = configureStore({ reducer: rootReducer });
      return createReduxBridge(reduxStore, middleware);
    }

    case ZubridgeMode.Custom: {
      const { createCustomBridge } = await import('../modes/custom/main.js');
      const { getCustomStore } = await import('../modes/custom/store.js');

      // Get custom store directly for bridge use
      const customStore = getCustomStore();
      return createCustomBridge(customStore, middleware);
    }

    default: {
      // This should never happen due to validation in getZubridgeMode
      debug('core', `[Main] Unknown mode: ${mode}, falling back to basic mode`);
      const { createBasicBridge: fallback } = await import('../modes/zustand-basic/main.js');
      const { getBasicStore: fallbackStore } = await import('../modes/zustand-basic/store.js');
      return fallback(fallbackStore(), middleware);
    }
  }
};
