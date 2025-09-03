import type { Action, AnyState } from '@zubridge/types';
import type { ZubridgeMiddleware } from '../middleware.js';

export interface CoreBridgeOptions {
  // Middleware hooks
  middleware?: ZubridgeMiddleware;
  beforeProcessAction?: (action: Action, windowId?: number) => Promise<Action> | Action;
  afterProcessAction?: (
    action: Action,
    processingTime: number,
    windowId?: number,
  ) => Promise<void> | void;
  beforeStateChange?: (state: AnyState, windowId?: number) => Promise<void> | void;
  afterStateChange?: (state: AnyState, windowId?: number) => Promise<void> | void;
  onBridgeDestroy?: () => Promise<void> | void;

  // Resource management options
  resourceManagement?: {
    /** Enable periodic cleanup of destroyed window subscription managers (default: true) */
    enablePeriodicCleanup?: boolean;
    /** Cleanup interval in milliseconds (default: 10 minutes) */
    cleanupIntervalMs?: number;
    /** Maximum number of subscription managers before forcing cleanup (default: 1000) */
    maxSubscriptionManagers?: number;
  };
}
