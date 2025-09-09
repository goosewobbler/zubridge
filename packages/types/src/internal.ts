import type { AnyState, Handlers } from './index';

/**
 * Internal global augmentations for Zubridge
 * These are used by the core Zubridge packages (electron, tauri)
 */
export interface ZubridgeInternalWindow {
  /**
   * Internal subscription validator exposed by preload
   */
  __zubridge_subscriptionValidator?: {
    getWindowSubscriptions: () => Promise<string[]>;
    isSubscribedToKey: (key: string) => Promise<boolean>;
    stateKeyExists: (state: unknown, key: string) => boolean;
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
