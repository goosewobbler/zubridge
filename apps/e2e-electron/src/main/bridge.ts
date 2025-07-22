import type { StoreApi } from 'zustand';
import type { ZubridgeMiddleware, ZustandBridge, ReduxBridge } from '@zubridge/electron/main';
import type { Store as ReduxStore } from 'redux';
import type { CustomBridge } from '@zubridge/types';
import { debug } from '@zubridge/core';

import { getZubridgeMode, ZubridgeMode } from '../utils/mode.js';
import type { BaseState } from '../types.js';

// Union type for all possible bridge return types
export type AnyBridge = ZustandBridge | ReduxBridge | CustomBridge;

/**
 * Creates the appropriate bridge implementation based on the selected mode
 */
export const createBridge = async <S extends BaseState, Store extends StoreApi<S>>(
  store: Store | ReduxStore,
  middleware?: ZubridgeMiddleware,
): Promise<AnyBridge> => {
  const mode = getZubridgeMode();
  debug('core', `[Main] Using Zubridge mode: ${mode}`);

  switch (mode) {
    case ZubridgeMode.ZustandBasic:
      const { createBasicBridge } = await import('../modes/zustand-basic/main.js');
      return createBasicBridge(store as Store, middleware);

    case ZubridgeMode.ZustandHandlers:
      const { createHandlersBridge } = await import('../modes/zustand-handlers/main.js');
      return createHandlersBridge(store as Store, middleware);

    case ZubridgeMode.ZustandReducers:
      const { createReducersBridge } = await import('../modes/zustand-reducers/main.js');
      return createReducersBridge(store as Store, middleware);

    case ZubridgeMode.Redux:
      const { createReduxBridge } = await import('../modes/redux/main.js');
      return createReduxBridge(store as ReduxStore, middleware);

    case ZubridgeMode.Custom:
      const { createCustomBridge } = await import('../modes/custom/main.js');
      return createCustomBridge(middleware);

    default:
      // This should never happen due to validation in getZubridgeMode
      debug('core', `[Main] Unknown mode: ${mode}, falling back to reducers mode`);
      const { createReducersBridge: fallback } = await import('../modes/zustand-reducers/main.js');
      return fallback(store as Store, middleware);
  }
};
