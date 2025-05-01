import type { Action, AnyState } from '@zubridge/types';

/**
 * Interface that defines a Zubridge Middleware instance from @zubridge/middleware
 */
export interface ZubridgeMiddleware {
  processAction: (action: Action) => Promise<void> | void;
  setState: (state: AnyState) => Promise<void> | void;
  destroy?: () => Promise<void> | void;
}

/**
 * Helper to create bridge middleware options for Electron bridges
 *
 * This function integrates Rust-based middleware (@zubridge/middleware) with the Electron bridge.
 *
 * Note: You typically don't need to use this function directly. You can just pass the middleware
 * instance directly to the bridge creation functions.
 *
 * @example
 * ```typescript
 * import { createZustandBridge } from '@zubridge/electron';
 * import { initZubridgeMiddleware } from '@zubridge/middleware';
 *
 * // Initialize middleware from @zubridge/middleware (Rust implementation)
 * const middleware = initZubridgeMiddleware({
 *   logging: { enabled: true }
 * });
 *
 * // Create bridge with Rust middleware - just pass middleware directly
 * const bridge = createZustandBridge(store, windows, {
 *   // Your other options
 *   middleware: middleware
 * });
 * ```
 *
 * @internal This function is used internally by bridge creation functions
 */
export function createMiddlewareOptions(middleware: ZubridgeMiddleware) {
  return {
    // Process actions before they reach the store
    beforeProcessAction: async (action: Action) => {
      try {
        await middleware.processAction(action);
      } catch (error) {
        console.error('Error in zubridge middleware processAction:', error);
      }
      return action;
    },

    // Update middleware state after state changes
    afterStateChange: async (state: AnyState) => {
      try {
        await middleware.setState(state);
      } catch (error) {
        console.error('Error in zubridge middleware setState:', error);
      }
    },

    // Clean up when the bridge is destroyed
    onBridgeDestroy: async () => {
      if (middleware.destroy) {
        try {
          await middleware.destroy();
        } catch (error) {
          console.error('Error destroying zubridge middleware:', error);
        }
      }
    },
  };
}
