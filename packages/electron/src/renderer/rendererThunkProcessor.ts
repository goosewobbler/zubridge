import type { Action, AnyState, Dispatch, DispatchOptions, InternalThunk } from '@zubridge/types';
// Import internal window augmentations
import type {} from '@zubridge/types/internal';
import { debug } from '@zubridge/utils';
import { BaseThunkProcessor } from '../thunk/shared/BaseThunkProcessor.js';
import { Thunk } from '../thunk/Thunk.js';
import type { PreloadOptions } from '../types/preload.js';
import { getThunkProcessorOptions } from '../utils/configuration.js';

/**
 * Handles thunk execution in the renderer process
 */
export class RendererThunkProcessor extends BaseThunkProcessor {
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

  constructor(options?: PreloadOptions) {
    const config = getThunkProcessorOptions(options);
    super(config, 'RENDERER_THUNK');
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

    // Call base implementation for common cleanup (timeout clearing, callback execution)
    super.completeAction(actionId, result);

    // Handle renderer-specific cleanup - remove from pending dispatches
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
    const thunk = new Thunk({
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
      } catch (error: unknown) {
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
      const dispatch: Dispatch<S> = async (
        action: string | Action | InternalThunk<S>,
        payload?: unknown,
      ) => {
        debug(
          'ipc',
          `[RENDERER_THUNK] [${thunk.id}] Dispatch called (bypassThunkLock=${thunk.bypassThunkLock})`,
          action,
        );

        // Handle nested thunks
        if (typeof action === 'function') {
          debug('ipc', `[RENDERER_THUNK] Handling nested thunk in ${thunk.id}`);
          // For nested thunks, we use the current thunk ID as the parent
          return this.executeThunk(action, options, thunk.id);
        }

        // Handle string actions by converting to action objects
        const actionObj = this.ensureActionId(action, payload);

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

        // Check queue size before adding
        this.checkQueueCapacity(this.pendingDispatches.size);

        // Add to pending dispatches BEFORE creating the promise to ensure
        // getState can find it immediately
        this.pendingDispatches.add(actionId);
        debug(
          'ipc',
          `[RENDERER_THUNK] Added ${actionId} to pending dispatches, now pending: ${this.pendingDispatches.size}/${this.maxQueueSize}`,
        );

        // Create a promise that will resolve when this action completes
        const actionPromise = new Promise<unknown>((resolve, reject) => {
          // Set up completion tracking using base class
          this.setupActionCompletion(
            actionId,
            (result) => {
              const { error: errorString } = result as { error: string };
              debug(
                'ipc',
                `[RENDERER_THUNK] Action ${actionId} completion callback called with result`,
                result,
              );

              // Check if the result contains an error
              if (errorString) {
                debug(
                  'ipc:error',
                  `[RENDERER_THUNK] Rejecting promise for action ${actionId} with error: ${errorString}`,
                );
                reject(new Error(errorString));
              } else {
                resolve(result || actionObj);
              }
            },
            () => {
              // Timeout callback
              debug('ipc', `[RENDERER_THUNK] Safety timeout triggered for action ${actionId}`);
              this.completeAction(actionId, actionObj);
            },
          );
        });

        // Send the action to the main process
        if (this.actionSender) {
          try {
            debug('ipc', `[RENDERER_THUNK] Sending action ${actionId} to main process`);
            await this.actionSender(actionObj, thunk.id);
            debug('ipc', `[RENDERER_THUNK] Action ${actionId} sent to main process`);
          } catch (error: unknown) {
            // If sending fails, complete the action with error and clean up
            this.completeAction(actionId, { error: String(error) });
            this.pendingDispatches.delete(actionId);
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
    } catch (error: unknown) {
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
      } catch (error: unknown) {
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

    const actionObj = this.ensureActionId(action, payload);

    const actionId = actionObj.__id as string;

    // Create a promise that will resolve when the action completes
    return new Promise<void>((resolve, reject) => {
      // Check queue size before adding
      try {
        this.checkQueueCapacity(this.pendingDispatches.size);
      } catch (error) {
        reject(error);
        return;
      }

      // Add to pending dispatches
      this.pendingDispatches.add(actionId);
      debug(
        'ipc',
        `[RENDERER_THUNK] Added ${actionId} to pending dispatches, now pending: ${this.pendingDispatches.size}/${this.maxQueueSize}`,
      );

      // Set up completion tracking using base class
      this.setupActionCompletion(
        actionId,
        (result) => {
          const { error: errorString } = result as { error: string };
          debug(
            'ipc',
            `[RENDERER_THUNK] Action ${actionId} completion callback called with result:`,
            result,
          );

          // Check if the result contains an error
          if (errorString) {
            debug(
              'ipc:error',
              `[RENDERER_THUNK] Rejecting promise for action ${actionId} with error: ${errorString}`,
            );
            reject(new Error(errorString));
          } else {
            resolve();
          }
        },
        () => {
          // Timeout callback
          debug('ipc', `[RENDERER_THUNK] Safety timeout triggered for action ${actionId}`);
          this.completeAction(actionId, actionObj);
        },
      );

      // Send the action to the main process
      debug(
        'ipc',
        `[RENDERER_THUNK] dispatchAction: Sending action ${actionObj.type} (${actionObj.__id})`,
      );
      this.actionSender?.(actionObj, parentId)
        .then(() => {
          debug('ipc', `[RENDERER_THUNK] dispatchAction: Action ${actionObj.__id} sent.`);
        })
        .catch((error) => {
          // If sending fails, clean up and reject
          // The base class will handle timeout and callback cleanup when we complete the action
          this.completeAction(actionId, { error: error.message });
          this.pendingDispatches.delete(actionId);
          debug('ipc:error', `[RENDERER_THUNK] Error sending action ${actionId}:`, error);
          reject(error);
        });
    });
  }

  /**
   * Force cleanup of expired timeouts and callbacks
   * This prevents memory leaks from stale actions
   */
  public forceCleanupExpiredActions(): void {
    debug('ipc', '[RENDERER_THUNK] Force cleaning up expired actions and timeouts');

    // Call base cleanup for common timeout/callback cleanup
    super.forceCleanupExpiredActions();

    // Clear renderer-specific pending dispatches
    const clearedDispatches = this.pendingDispatches.size;
    this.pendingDispatches.clear();

    debug('ipc', `[RENDERER_THUNK] Force cleaned up ${clearedDispatches} pending dispatches`);
  }

  /**
   * Destroy the processor and cleanup all resources
   */
  public destroy(): void {
    debug('ipc', '[RENDERER_THUNK] Destroying RendererThunkProcessor instance');

    // Clean up all resources first
    this.forceCleanupExpiredActions();

    // Clear function references
    this.actionSender = undefined;
    this.thunkRegistrar = undefined;
    this.thunkCompleter = undefined;
    this.stateProvider = undefined;
    this.currentWindowId = undefined;

    // Call base destroy for remaining cleanup
    super.destroy();
  }
}

// Singleton instance of the thunk processor
let globalThunkProcessor: RendererThunkProcessor | undefined;

/**
 * Get the singleton instance of the RendererThunkProcessor
 */
export const getThunkProcessor = (options?: PreloadOptions): RendererThunkProcessor => {
  if (!globalThunkProcessor) {
    globalThunkProcessor = new RendererThunkProcessor(options);
    debug('ipc', '[RENDERER_THUNK] Created new RendererThunkProcessor instance (global)');
  }
  return globalThunkProcessor;
};

/**
 * Reset the global thunk processor (for cleanup or testing)
 */
export const resetThunkProcessor = (): void => {
  if (globalThunkProcessor) {
    debug('ipc', '[RENDERER_THUNK] Resetting global thunk processor');
    globalThunkProcessor.destroy();
  }
  globalThunkProcessor = undefined;
};
