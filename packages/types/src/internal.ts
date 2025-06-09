import type { Action, AnyState, DispatchOptions, Handlers, InternalThunk } from './index';

/**
 * Internal global augmentations for Zubridge
 * These are used by the core Zubridge packages (electron, tauri)
 */
export interface ZubridgeInternalWindow {
  /**
   * Internal thunk processor exposed by preload
   */
  __zubridge_thunkProcessor?: {
    executeThunk: <S extends AnyState>(
      thunk: InternalThunk<S>,
      getState: () => S | Promise<S>,
      options?: DispatchOptions,
      parentId?: string,
    ) => Promise<any>;
    completeAction: (actionId: string, result: any) => void;
    dispatchAction: (action: string | Action, payload?: unknown, parentId?: string) => Promise<void>;
  };

  /**
   * Internal subscription validator exposed by preload
   */
  __zubridge_subscriptionValidator?: {
    getWindowSubscriptions: () => Promise<string[]>;
    isSubscribedToKey: (key: string) => Promise<boolean>;
    stateKeyExists: (state: any, key: string) => boolean;
  };

  /**
   * Window ID tracking (internal)
   */
  __zubridge_windowId?: string;

  /**
   * Public zubridge API exposed to renderer processes
   */
  zubridge?: Handlers<AnyState>;
}

// Only apply internal properties to Window
declare global {
  interface Window extends ZubridgeInternalWindow {}
}
