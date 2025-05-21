import type { Action as TypesAction, AnyState } from '@zubridge/types';
import { debug } from '@zubridge/core';

// Local definition for the Action type expected by the NAPI middleware
// This is used if direct import `from '@zubridge/middleware'` fails for type resolution.
interface NapiAction {
  type: string;
  payload?: string;
}

/**
 * Interface that defines a Zubridge Middleware instance from @zubridge/middleware.
 * This should match the actual signature of the object returned by initZubridgeMiddleware.
 */
export interface ZubridgeMiddleware {
  processAction: (action: NapiAction) => Promise<void> | void;
  setState: (stateJson: string) => Promise<void> | void;
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
    beforeProcessAction: async (action: TypesAction) => {
      try {
        debug('core', 'Applying middleware.processAction to action:', action);

        // Prepare action for the NAPI middleware which expects payload to be string | undefined
        let payloadForNapi: string | undefined = undefined;
        if (action.payload !== undefined && action.payload !== null) {
          if (typeof action.payload === 'string') {
            payloadForNapi = action.payload;
          } else {
            try {
              payloadForNapi = JSON.stringify(action.payload);
            } catch (stringifyError) {
              debug(
                'core',
                '[zubridge-electron] Error stringifying action payload for NAPI middleware:',
                stringifyError,
              );
              // Optionally, send a specific error object as payload or nothing
              payloadForNapi = JSON.stringify({ error: 'Payload stringification failed' });
            }
          }
        }

        // Create an action conforming to the NAPI middleware's expected Action type
        const napiCompliantAction: NapiAction = {
          type: action.type,
          payload: payloadForNapi,
        };

        // The middleware.processAction expects an Action where payload is string | undefined
        await middleware.processAction(napiCompliantAction);
      } catch (error) {
        debug('core:error', 'Error in zubridge middleware processAction:', error);
      }
      return action; // Return the original action for further processing by the bridge
    },

    // Update middleware state after state changes
    afterStateChange: async (state: AnyState) => {
      try {
        debug('core', 'Applying middleware.setState with updated state');
        let stateJson: string;
        try {
          stateJson = JSON.stringify(state);
        } catch (stringifyError) {
          debug('core:error', '[zubridge-electron] Error stringifying state for NAPI middleware:', stringifyError);
          // Send an error object as state or handle differently
          stateJson = JSON.stringify({ error: 'State stringification failed' });
        }
        await middleware.setState(stateJson);
      } catch (error) {
        debug('core:error', 'Error in zubridge middleware setState:', error);
      }
    },

    // Clean up when the bridge is destroyed
    onBridgeDestroy: async () => {
      if (middleware.destroy) {
        try {
          debug('core', 'Destroying middleware instance');
          await middleware.destroy();
        } catch (error) {
          debug('core:error', 'Error destroying zubridge middleware:', error);
        }
      }
    },
  };
}
