import { debug } from '@zubridge/core';
import type {
  Action,
  AnyState,
  BackendBridge,
  StateManager,
  WrapperOrWebContents,
} from '@zubridge/types';
import { initActionQueue } from '../main/actionQueue.js';
import { createMiddlewareOptions } from '../middleware.js';
import { actionScheduler, thunkManager } from '../thunk/init.js';
import type { CoreBridgeOptions } from '../types/bridge.js';
import { setupMainProcessErrorHandlers } from '../utils/globalErrorHandlers.js';
import { sanitizeState } from '../utils/serialization.js';
import { createWebContentsTracker, type WebContentsTracker } from '../utils/windows.js';
import { IpcHandler } from './ipc/IpcHandler.js';
import { type MiddlewareCallbacks, ResourceManager } from './resources/ResourceManager.js';
import { SubscriptionHandler } from './subscription/SubscriptionHandler.js';

/**
 * Core bridge between the main process and renderer processes
 */
export function createCoreBridge<State extends AnyState>(
  stateManager: StateManager<State>,
  options?: CoreBridgeOptions,
): BackendBridge<number> {
  debug('core', 'Creating CoreBridge with options:', options);

  // Setup global error handlers for the main process
  setupMainProcessErrorHandlers();

  // Initialize action queue with the state manager
  initActionQueue(stateManager);

  // Tracker for WebContents using WeakMap for automatic garbage collection
  let windowTracker: WebContentsTracker;
  try {
    windowTracker = createWebContentsTracker();
  } catch (error) {
    debug('core', 'Error creating WebContents tracker, using fallback:', error);
    // Provide a fallback tracker that does nothing
    windowTracker = {
      track: () => true,
      untrack: () => {},
      getActiveWebContents: () => [],
      getActiveIds: () => [],
      cleanup: () => {},
      untrackById: () => {},
      isTracked: () => false,
      hasId: () => false,
    } as WebContentsTracker;
  }

  // Create resource manager to prevent memory leaks, passing windowTracker for proper cleanup
  const resourceManager = new ResourceManager<State>(windowTracker, options?.resourceManagement);

  // Extract serialization maxDepth if provided
  const serializationMaxDepth = options?.serialization?.maxDepth;

  // Create IPC handler
  const ipcHandler = new IpcHandler(stateManager, resourceManager, serializationMaxDepth);

  // Create subscription handler
  const subscriptionHandler = new SubscriptionHandler(
    stateManager,
    resourceManager,
    windowTracker,
    serializationMaxDepth,
  );

  // Process options with middleware if provided
  let processedOptions = options;
  if (options?.middleware) {
    debug('core', 'Initializing middleware');
    const middlewareOptions = createMiddlewareOptions(options.middleware);
    processedOptions = {
      ...options,
      ...middlewareOptions,
    };

    // Register middleware callbacks using resource manager
    const callbacks: MiddlewareCallbacks = {};
    if (options?.middleware?.trackActionDispatch) {
      callbacks.trackActionDispatch = async (action: Action) => {
        await options.middleware?.trackActionDispatch?.(action);
      };
    }
    if (options?.middleware?.trackActionReceived) {
      callbacks.trackActionReceived = async (action: Action) => {
        await options.middleware?.trackActionReceived?.(action);
      };
    }
    if (options?.middleware?.trackStateUpdate) {
      callbacks.trackStateUpdate = async (action: Action, state: string) => {
        await options.middleware?.trackStateUpdate?.(action, state);
      };
    }
    if (options?.middleware?.trackActionAcknowledged) {
      callbacks.trackActionAcknowledged = async (actionId: string) => {
        await options.middleware?.trackActionAcknowledged?.(actionId);
      };
    }
    resourceManager.setMiddlewareCallbacks(callbacks);
  }

  // Subscribe to state manager changes and selectively notify windows
  let prevState: State | undefined;
  let stateManagerUnsubscribe: () => void;
  try {
    stateManagerUnsubscribe = stateManager.subscribe((state: State) => {
      debug('core', 'State manager notified of state change');
      const activeWebContents = windowTracker.getActiveWebContents();
      debug('core', `Notifying ${activeWebContents.length} active windows of state change`);

      // Sanitize state before notifying subscribers
      const serializationOptions = options?.serialization
        ? { maxDepth: options.serialization.maxDepth }
        : undefined;
      const sanitizedState = sanitizeState(state, serializationOptions) as State;
      const sanitizedPrevState = prevState
        ? (sanitizeState(prevState, serializationOptions) as State)
        : undefined;

      for (const webContents of activeWebContents) {
        const windowId = webContents.id;
        const subManager = resourceManager.getSubscriptionManager(windowId);
        if (!subManager) {
          debug('core', `No subscription manager for window ${windowId}, skipping`);
          continue;
        }
        // Only notify if relevant keys changed
        if (sanitizedPrevState !== undefined) {
          debug('core', `Notifying window ${windowId} of state change`);
          subManager.notify(sanitizedPrevState, sanitizedState);
        } else {
          // On first run, send full state to all subscribers
          debug('core', `Sending initial state to window ${windowId}`);
          subManager.notify(sanitizedState, sanitizedState);
        }
      }
      prevState = state;
    });
  } catch (error) {
    debug('core', 'Error subscribing to state manager:', error);
    stateManagerUnsubscribe = () => {}; // Provide no-op fallback
  }

  // Get IDs of subscribed windows
  const getSubscribedWindows = (): number[] => {
    const activeIds = windowTracker.getActiveIds();
    debug('windows', `Currently subscribed windows: ${activeIds.join(', ') || 'none'}`);
    return activeIds;
  };

  // Cleanup function for removing listeners
  const destroy = async () => {
    debug('core', 'Destroying CoreBridge');

    // Clean up IPC handlers
    ipcHandler.cleanup();

    // Clean up global singletons to prevent memory leaks in Redux/Custom modes
    debug('core', 'Cleaning up global singletons');
    try {
      // ThunkManager extends EventEmitter, so remove all listeners
      if (thunkManager && typeof thunkManager.removeAllListeners === 'function') {
        thunkManager.removeAllListeners();
        // Also force cleanup of completed thunks to prevent memory leaks
        if (typeof thunkManager.forceCleanupCompletedThunks === 'function') {
          thunkManager.forceCleanupCompletedThunks();
        }
        debug('core', 'ThunkManager listeners and completed thunks cleaned up');
      }

      // Force cleanup of thunk processors to prevent memory leaks
      try {
        const { resetMainThunkProcessor } = await import('../main/mainThunkProcessor.js');
        resetMainThunkProcessor();
        debug('core', 'MainThunkProcessor cleaned up');
      } catch (error) {
        debug('core', 'MainThunkProcessor cleanup skipped (not imported):', error);
      }

      // ActionScheduler may have timers or listeners
      if (actionScheduler && typeof actionScheduler.removeAllListeners === 'function') {
        actionScheduler.removeAllListeners();
        debug('core', 'ActionScheduler listeners cleaned up');
      }
    } catch (error) {
      debug('core', 'Error cleaning up singletons:', error);
    }

    // Apply bridge destroy hook if provided
    if (processedOptions?.onBridgeDestroy) {
      debug('core', 'Applying onBridgeDestroy hook');
      try {
        await processedOptions.onBridgeDestroy();
      } catch (error) {
        debug('core', 'Error in onBridgeDestroy hook:', error);
      }
    }

    // Cleanup all our resources
    debug('core', 'Unsubscribing from state manager');
    stateManagerUnsubscribe();

    debug('core', 'Cleaning up tracked WebContents');
    windowTracker.cleanup();

    debug('core', 'Clearing subscription managers and resource manager');
    resourceManager.clearAll();

    debug('core', 'CoreBridge destroyed');
  };

  // Return the bridge interface
  return {
    subscribe: subscriptionHandler.subscribe.bind(subscriptionHandler),
    unsubscribe: (...args: unknown[]) => {
      subscriptionHandler.unsubscribe(
        args[0] as WrapperOrWebContents[] | WrapperOrWebContents | undefined,
        args[1] as string[] | undefined,
      );
    },
    getSubscribedWindows,
    destroy,
    getWindowSubscriptions: subscriptionHandler.getWindowSubscriptions.bind(subscriptionHandler),
  };
}
