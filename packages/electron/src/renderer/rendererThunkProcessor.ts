import { debug } from '@zubridge/core';
import type {
  Action,
  AnyState,
  Dispatch,
  DispatchOptions,
  InternalThunk,
  Thunk,
} from '@zubridge/types';
// Import internal window augmentations
import type {} from '@zubridge/types/internal';
import { v4 as uuidv4 } from 'uuid';
import { Thunk as ThunkClass } from '../lib/Thunk.js';

// Platform-specific timeout for action completion
const DEFAULT_ACTION_COMPLETION_TIMEOUT = process.platform === 'linux' ? 20000 : 10000;

// Type for action results that may contain errors
interface ActionResult {
  error?: string;
  [key: string]: unknown;
}
debug(
  'ipc',
  `Using platform-specific action timeout: ${DEFAULT_ACTION_COMPLETION_TIMEOUT}ms for ${process.platform}`,
);

/**
 * Handles thunk execution in the renderer process
 */
export class RendererThunkProcessor {
  // Current window ID
  private currentWindowId?: number;

  // Function to send actions to main process
  private actionSender?: (action: Action, parentId?: string) => Promise<void>;

  // Function to register thunks with main process
  private thunkRegistrar?: (
    thunkId: string,
    parentId?: string,
    bypassThunkLock?: boolean,
    bypassAccessControl?: boolean,
  ) => Promise<void>;

  // Function to notify thunk completion
  private thunkCompleter?: (thunkId: string) => Promise<void>;

  // Custom state provider function
  private stateProvider?: (opts?: { bypassAccessControl?: boolean }) => Promise<unknown>;

  // Queue of pending dispatches (action IDs)
  private pendingDispatches = new Set<string>();

  // Map of action IDs to their resolution functions
  private actionCompletionCallbacks = new Map<string, (result: unknown) => void>();

  // Map to track timeouts for action completion
  private actionTimeouts = new Map<string, NodeJS.Timeout>();

  // Configuration options
  private actionCompletionTimeoutMs: number;

  constructor(actionCompletionTimeoutMs?: number) {
    this.actionCompletionTimeoutMs = actionCompletionTimeoutMs || DEFAULT_ACTION_COMPLETION_TIMEOUT;
    debug('ipc', '[RENDERER_THUNK] Initialized with timeout:', this.actionCompletionTimeoutMs);
  }

  /**
   * Initialize the processor with all required dependencies
   */
  public initialize(options: {
    windowId: number;
    actionSender: (action: Action, parentId?: string) => Promise<void>;
    thunkRegistrar: (
      thunkId: string,
      parentId?: string,
      bypassThunkLock?: boolean,
      bypassAccessControl?: boolean,
    ) => Promise<void>;
    thunkCompleter: (thunkId: string) => Promise<void>;
    actionCompletionHandler?: (actionId: string, callback: (result: unknown) => void) => () => void;
    actionCompletionTimeoutMs?: number;
  }): void {
    debug('ipc', '[RENDERER_THUNK] Initializing with options:', options);
    this.currentWindowId = options.windowId;
    this.actionSender = options.actionSender;
    this.thunkRegistrar = options.thunkRegistrar;
    this.thunkCompleter = options.thunkCompleter;

    // Update timeout configuration if provided - use direct assignment
    if (options.actionCompletionTimeoutMs !== undefined) {
      this.actionCompletionTimeoutMs = options.actionCompletionTimeoutMs;
      debug('ipc', '[RENDERER_THUNK] Updated timeout:', this.actionCompletionTimeoutMs);
    }

    debug('ipc', '[RENDERER_THUNK] Action sender:', this.actionSender);
    debug('ipc', `[RENDERER_THUNK] Initialized with window ID ${options.windowId}`);
  }

  /**
   * Set a custom state provider function
   * This allows explicitly registering a way to get state after initialization
   */
  public setStateProvider(
    provider: (opts?: { bypassAccessControl?: boolean }) => Promise<unknown>,
  ): void {
    this.stateProvider = provider;
    debug('ipc', '[RENDERER_THUNK] Custom state provider registered');
  }

  /**
   * Handle action completion notification
   * This should be called when an action acknowledgment is received from the main process
   */
  public completeAction(actionId: string, result: unknown): void {
    debug('ipc', `[RENDERER_THUNK] Action completed: ${actionId}`);
    debug('ipc', `[RENDERER_THUNK] Result: ${JSON.stringify(result)}`);

    // Clear any pending timeout for this action
    const timeout = this.actionTimeouts.get(actionId);
    if (timeout) {
      debug('ipc', `[RENDERER_THUNK] Clearing timeout for action ${actionId}`);
      clearTimeout(timeout);
      this.actionTimeouts.delete(actionId);
    }

    // Check if there was an error in the result
    if (result && typeof result === 'object' && 'error' in result) {
      const errorResult = result as ActionResult;
      debug(
        'ipc:error',
        `[RENDERER_THUNK] Action ${actionId} completed with error: ${errorResult.error}`,
      );
    }

    // Call any completion callbacks waiting on this action
    // This must happen BEFORE removing from pending dispatches
    // to ensure any getState calls know it's done
    const callback = this.actionCompletionCallbacks.get(actionId);
    if (callback) {
      debug('ipc', `[RENDERER_THUNK] Executing completion callback for action ${actionId}`);
      try {
        // Call the callback with the result directly, let the callback handle errors
        callback(result);
      } catch (callbackError) {
        debug(
          'ipc:error',
          `[RENDERER_THUNK] Error in completion callback for action ${actionId}: ${callbackError}`,
        );
      }
      this.actionCompletionCallbacks.delete(actionId);
    } else {
      debug('ipc', `[RENDERER_THUNK] No completion callback found for action ${actionId}`);
    }

    // Now remove from pending dispatches after callback completes
    this.pendingDispatches.delete(actionId);
    debug(
      'ipc',
      `[RENDERER_THUNK] Removed ${actionId} from pending dispatches, remaining: ${this.pendingDispatches.size}`,
    );
    if (this.pendingDispatches.size > 0) {
      debug(
        'ipc',
        `[RENDERER_THUNK] Remaining dispatch IDs: ${Array.from(this.pendingDispatches).join(', ')}`,
      );
    }
  }

  /**
   * Execute a thunk function
   */
  public async executeThunk<S extends AnyState>(
    thunkFn: InternalThunk<S>,
    options?: DispatchOptions,
    parentId?: string,
  ): Promise<unknown> {
    // Create a Thunk instance
    const thunk = new ThunkClass({
      sourceWindowId: this.currentWindowId ?? 0,
      source: 'renderer',
      parentId,
      bypassAccessControl: options?.bypassAccessControl ?? false,
      bypassThunkLock: options?.bypassThunkLock ?? false,
    });
    debug(
      'ipc',
      `[RENDERER_THUNK] Executing thunk ${thunk.id} (bypassThunkLock=${thunk.bypassThunkLock})`,
    );

    // Track if this is the first action in the thunk
    let isFirstAction = true;

    debug('ipc', `[RENDERER_THUNK] Thunk ${thunk.id} bypassThunkLock: ${thunk.bypassThunkLock}`);
    // Register the thunk with main process
    if (this.thunkRegistrar && this.currentWindowId) {
      try {
        debug(
          'ipc',
          `[RENDERER_THUNK] Registering thunk ${thunk.id} with main process (bypassThunkLock=${thunk.bypassThunkLock})`,
        );
        await this.thunkRegistrar(
          thunk.id,
          parentId,
          options?.bypassThunkLock,
          options?.bypassAccessControl,
        );
        debug('ipc', `[RENDERER_THUNK] Thunk ${thunk.id} registered successfully`);
      } catch (error) {
        debug('ipc:error', `[RENDERER_THUNK] Error registering thunk: ${error}`);
      }
    }

    try {
      const getState = async (getStateOptions?: { bypassAccessControl?: boolean }): Promise<S> => {
        debug('ipc', `[RENDERER_THUNK] getState called for thunk ${thunk.id}`);

        // First try using the custom state provider if available
        if (this.stateProvider) {
          debug('ipc', `[RENDERER_THUNK] Using registered state provider for thunk ${thunk.id}`);
          // Pass bypassAccessControl option if provided, otherwise use the thunk's flag
          return this.stateProvider({
            bypassAccessControl: getStateOptions?.bypassAccessControl ?? thunk.bypassAccessControl,
          }) as Promise<S>;
        }

        throw new Error('No state provider available');
      };

      // Create a dispatch function for this thunk that tracks each action
      const dispatch: Dispatch<Partial<S>> = async (
        action: string | Action | Thunk<Partial<S>>,
        payloadOrOptions?: unknown | DispatchOptions,
        options?: DispatchOptions,
      ) => {
        debug(
          'ipc',
          `[RENDERER_THUNK] [${thunk.id}] Dispatch called (bypassThunkLock=${thunk.bypassThunkLock})`,
          action,
        );

        // Handle different parameter signatures
        let payload: unknown;
        let dispatchOptions: DispatchOptions | undefined;

        // Handle nested thunks
        if (typeof action === 'function') {
          debug('ipc', `[RENDERER_THUNK] Handling nested thunk in ${thunk.id}`);
          // For nested thunks, we use the current thunk ID as the parent
          dispatchOptions = payloadOrOptions as DispatchOptions | undefined;
          return this.executeThunk(action, dispatchOptions, thunk.id);
        }

        if (typeof action === 'string') {
          // String action signature: (action, payload?, options?)
          payload = payloadOrOptions;
          dispatchOptions = options;
        } else {
          // Action/Thunk signature: (action, options?)
          payload = undefined;
          dispatchOptions = payloadOrOptions as DispatchOptions | undefined;
        }

        // Handle string actions by converting to action objects
        const actionObj: Action =
          typeof action === 'string'
            ? { type: action, payload, __id: uuidv4() }
            : 'type' in action
              ? { ...action, __id: action.__id || uuidv4() }
              : ({ type: 'THUNK', __id: uuidv4() } as Action);

        // Pass through bypass flags from the thunk to the action
        if (thunk.bypassThunkLock) {
          actionObj.__bypassThunkLock = true;
        }
        if (thunk.bypassAccessControl) {
          actionObj.__bypassAccessControl = true;
        }

        const actionId = actionObj.__id as string;

        debug(
          'ipc',
          `[RENDERER_THUNK] Thunk ${thunk.id} dispatching action ${actionObj.type} (${actionId})`,
        );

        // Mark this action as starting a thunk if it's the first action in the thunk
        if (isFirstAction) {
          debug('ipc', `[RENDERER_THUNK] Marking action ${actionId} as starting thunk ${thunk.id}`);
          actionObj.__startsThunk = true;
          isFirstAction = false;
        }

        // Add to pending dispatches BEFORE creating the promise to ensure
        // getState can find it immediately
        this.pendingDispatches.add(actionId);
        debug(
          'ipc',
          `[RENDERER_THUNK] Added ${actionId} to pending dispatches, now pending: ${this.pendingDispatches.size}`,
        );

        // Create a promise that will resolve when this action completes
        const actionPromise = new Promise<unknown>((resolve, reject) => {
          // Store the callback to be called when action acknowledgment is received
          this.actionCompletionCallbacks.set(actionId, (result) => {
            debug(
              'ipc',
              `[RENDERER_THUNK] Action ${actionId} completion callback called with result`,
              result,
            );

            // Check if the result contains an error
            if (result && typeof result === 'object' && 'error' in result) {
              const errorResult = result as ActionResult;
              debug(
                'ipc:error',
                `[RENDERER_THUNK] Rejecting promise for action ${actionId} with error: ${errorResult.error}`,
              );

              // Create a proper error object
              const error = new Error(errorResult.error);

              // CRITICAL: Don't wrap in Promise.reject here as we're already in a promise context
              // Instead, directly throw the error which will be caught by the promise
              reject(error);
            } else {
              resolve(result || actionObj);
            }
          });

          debug('ipc', `[RENDERER_THUNK] Set completion callback for action ${actionId}`);

          // Set up a safety timeout in case we don't receive an acknowledgment
          debug('ipc', `[RENDERER_THUNK] Setting up safety timeout for action ${actionId}`);

          const safetyTimeout = setTimeout(() => {
            // If we still have a pending callback for this action, resolve it
            if (this.actionCompletionCallbacks.has(actionId)) {
              debug(
                'ipc',
                `[RENDERER_THUNK] Safety timeout triggered for action ${actionId} after ${this.actionCompletionTimeoutMs}ms`,
              );
              this.completeAction(actionId, actionObj);
            }
          }, this.actionCompletionTimeoutMs);

          // Store the timeout so we can clear it if we get an acknowledgment
          this.actionTimeouts.set(actionId, safetyTimeout);
        });

        // Send the action to the main process
        if (this.actionSender) {
          try {
            debug('ipc', `[RENDERER_THUNK] Sending action ${actionId} to main process`);
            await this.actionSender(actionObj, thunk.id);
            debug('ipc', `[RENDERER_THUNK] Action ${actionId} sent to main process`);
          } catch (error) {
            // If sending fails, clear any pending timeout
            const timeout = this.actionTimeouts.get(actionId);
            if (timeout) {
              clearTimeout(timeout);
              this.actionTimeouts.delete(actionId);
            }

            // Remove from pending and reject
            this.pendingDispatches.delete(actionId);
            this.actionCompletionCallbacks.delete(actionId);
            debug('ipc:error', `[RENDERER_THUNK] Error sending action ${actionId}:`, error);
            throw error;
          }
        } else {
          debug(
            'ipc:error',
            `[RENDERER_THUNK] No action sender configured, cannot send action ${actionId}`,
          );
          throw new Error('Action sender not configured for renderer thunk processor');
        }

        return actionPromise;
      };

      // Execute the thunk with the local dispatch function and state
      debug('ipc', `[RENDERER_THUNK] Executing thunk function for ${thunk.id}`);
      const result = await thunkFn(getState, dispatch);
      debug('ipc', `[RENDERER_THUNK] Thunk ${thunk.id} execution completed, result:`, result);
      return result;
    } catch (error) {
      debug('ipc:error', `[RENDERER_THUNK] Error executing thunk ${thunk.id}:`, error);
      throw error; // Rethrow to be caught by caller
    } finally {
      // Notify main process that thunk has completed
      if (this.thunkCompleter && this.currentWindowId) {
        try {
          debug('ipc', `[RENDERER_THUNK] Notifying main process of thunk ${thunk.id} completion`);
          await this.thunkCompleter(thunk.id);
          debug('ipc', `[RENDERER_THUNK] Thunk ${thunk.id} completion notified`);
        } catch (e) {
          debug('ipc:error', `[RENDERER_THUNK] Error notifying thunk completion: ${e}`);
        }
      }
    }
  }

  /**
   * Dispatch an action to the main process (for non-thunk scenarios)
   */
  public async dispatchAction(
    action: Action | string,
    payload?: unknown,
    parentId?: string,
  ): Promise<void> {
    debug('ipc', '[RENDERER_THUNK] dispatchAction called with:', { action, payload, parentId });

    // Use the zubridge handlers if available
    if (typeof window !== 'undefined' && window.zubridge?.dispatch) {
      debug('ipc', '[RENDERER_THUNK] Using window.zubridge.dispatch for action');
      try {
        if (typeof action === 'string') {
          await window.zubridge.dispatch(action, payload);
        } else {
          await window.zubridge.dispatch(action);
        }
        return;
      } catch (error) {
        debug('ipc:error', '[RENDERER_THUNK] Error dispatching through window.zubridge:', error);
      }
    }

    // If no actionSender, this instance can't dispatch directly
    if (!this.actionSender) {
      debug(
        'ipc:error',
        '[RENDERER_THUNK] dispatchAction: No action sender configured, cannot dispatch.',
      );
      throw new Error('Action sender not configured for direct dispatch.');
    }

    const actionObj: Action =
      typeof action === 'string'
        ? { type: action, payload, __id: uuidv4() }
        : { ...action, __id: action.__id || uuidv4() };

    const actionId = actionObj.__id as string;

    // Create a promise that will resolve when the action completes
    return new Promise<void>((resolve, reject) => {
      // Add to pending dispatches
      this.pendingDispatches.add(actionId);
      debug(
        'ipc',
        `[RENDERER_THUNK] Added ${actionId} to pending dispatches, now pending: ${this.pendingDispatches.size}`,
      );

      // Store the callback to be called when action acknowledgment is received
      this.actionCompletionCallbacks.set(actionId, (result) => {
        debug(
          'ipc',
          `[RENDERER_THUNK] Action ${actionId} completion callback called with result:`,
          result,
        );

        // Check if the result contains an error
        if (result && typeof result === 'object' && 'error' in result) {
          const errorResult = result as ActionResult;
          debug(
            'ipc:error',
            `[RENDERER_THUNK] Rejecting promise for action ${actionId} with error: ${errorResult.error}`,
          );
          reject(new Error(errorResult.error));
        } else {
          resolve();
        }
      });

      // Set up a safety timeout
      const safetyTimeout = setTimeout(() => {
        if (this.actionCompletionCallbacks.has(actionId)) {
          debug(
            'ipc',
            `[RENDERER_THUNK] Safety timeout triggered for action ${actionId} after ${this.actionCompletionTimeoutMs}ms`,
          );
          this.completeAction(actionId, actionObj);
        }
      }, this.actionCompletionTimeoutMs);

      // Store the timeout
      this.actionTimeouts.set(actionId, safetyTimeout);

      // Send the action to the main process
      debug(
        'ipc',
        `[RENDERER_THUNK] dispatchAction: Sending action ${actionObj.type} (${actionObj.__id})`,
      );
      this.actionSender!(actionObj, parentId)
        .then(() => {
          debug('ipc', `[RENDERER_THUNK] dispatchAction: Action ${actionObj.__id} sent.`);
        })
        .catch((error) => {
          // If sending fails, clear the timeout and reject
          const timeout = this.actionTimeouts.get(actionId);
          if (timeout) {
            clearTimeout(timeout);
            this.actionTimeouts.delete(actionId);
          }

          this.pendingDispatches.delete(actionId);
          this.actionCompletionCallbacks.delete(actionId);
          debug('ipc:error', `[RENDERER_THUNK] Error sending action ${actionId}:`, error);
          reject(error);
        });
    });
  }
}

// Singleton instance of the thunk processor
let globalThunkProcessor: RendererThunkProcessor | undefined;

/**
 * Get the singleton instance of the RendererThunkProcessor
 */
export const getThunkProcessor = (): RendererThunkProcessor => {
  if (!globalThunkProcessor) {
    globalThunkProcessor = new RendererThunkProcessor();
    debug('ipc', '[RENDERER_THUNK] Created new RendererThunkProcessor instance (global)');
  }
  return globalThunkProcessor;
};
