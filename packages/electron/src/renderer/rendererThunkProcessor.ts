import { v4 as uuidv4 } from 'uuid';
import type { Action, AnyState, Thunk, Dispatch } from '@zubridge/types';
import { debug } from '@zubridge/core';

// Default timeout for action completion (10 seconds)
const DEFAULT_ACTION_COMPLETION_TIMEOUT = 10000;

// Add a declaration for our exposed interface
declare global {
  interface Window {
    __zubridge_thunkProcessor?: {
      executeThunk: (thunk: any, getState: any, parentId?: string) => Promise<any>;
      completeAction: (actionId: string, result: any) => void;
      dispatchAction: (action: Action | string, payload?: unknown, parentId?: string) => Promise<void>;
    };
  }
}

/**
 * Handles thunk execution in the renderer process
 */
export class RendererThunkProcessor {
  // Current window ID
  private currentWindowId?: number;

  // Function to send actions to main process
  private actionSender?: (action: Action, parentId?: string) => Promise<void>;

  // Function to register thunks with main process
  private thunkRegistrar?: (thunkId: string, parentId?: string) => Promise<void>;

  // Function to notify thunk completion
  private thunkCompleter?: (thunkId: string) => Promise<void>;

  // Queue of pending dispatches (action IDs)
  private pendingDispatches = new Set<string>();

  // Map of action IDs to their resolution functions
  private actionCompletionCallbacks = new Map<string, (result: any) => void>();

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
    thunkRegistrar: (thunkId: string, parentId?: string) => Promise<void>;
    thunkCompleter: (thunkId: string) => Promise<void>;
    actionCompletionHandler?: (actionId: string, callback: (result: any) => void) => () => void;
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
   * Handle action completion notification
   * This should be called when an action acknowledgment is received from the main process
   */
  public completeAction(actionId: string, result: any): void {
    debug('ipc', `[RENDERER_THUNK] Action completed: ${actionId}`);

    // Clear any pending timeout for this action
    const timeout = this.actionTimeouts.get(actionId);
    if (timeout) {
      debug('ipc', `[RENDERER_THUNK] Clearing timeout for action ${actionId}`);
      clearTimeout(timeout);
      this.actionTimeouts.delete(actionId);
    }

    // Call any completion callbacks waiting on this action
    // This must happen BEFORE removing from pending dispatches
    // to ensure any getState calls know it's done
    const callback = this.actionCompletionCallbacks.get(actionId);
    if (callback) {
      debug('ipc', `[RENDERER_THUNK] Executing completion callback for action ${actionId}`);
      callback(result);
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
      debug('ipc', `[RENDERER_THUNK] Remaining dispatch IDs: ${Array.from(this.pendingDispatches).join(', ')}`);
    }
  }

  /**
   * Execute a thunk function
   */
  public async executeThunk<S extends AnyState>(
    thunk: Thunk<S>,
    getOriginalState: () => S | Promise<S>,
    parentId?: string,
  ): Promise<any> {
    // Check if we should use the shared thunk processor from preload
    if (typeof window !== 'undefined' && window.__zubridge_thunkProcessor) {
      debug('ipc', '[RENDERER_THUNK] Using shared thunk processor from preload');
      // Use the shared processor exposed from preload
      return window.__zubridge_thunkProcessor.executeThunk(thunk, getOriginalState, parentId);
    }

    // If we get here, we're using the local implementation

    // Generate a unique ID for this thunk
    const thunkId = uuidv4();
    debug('ipc', `[RENDERER_THUNK] Executing thunk ${thunkId}`);

    // Register the thunk with main process
    if (this.thunkRegistrar && this.currentWindowId) {
      try {
        debug('ipc', `[RENDERER_THUNK] Registering thunk ${thunkId} with main process`);
        await this.thunkRegistrar(thunkId, parentId);
        debug('ipc', `[RENDERER_THUNK] Thunk ${thunkId} registered successfully`);
      } catch (error) {
        debug('ipc:error', `[RENDERER_THUNK] Error registering thunk: ${error}`);
      }
    }

    try {
      // Create a dispatch function for this thunk that tracks each action
      const dispatch: Dispatch<S> = async (action: any, payload?: unknown) => {
        debug('ipc', '[RENDERER_THUNK] Dispatching action:', action);

        // Handle nested thunks
        if (typeof action === 'function') {
          debug('ipc', `[RENDERER_THUNK] Handling nested thunk in ${thunkId}`);
          // For nested thunks, we use the current thunk ID as the parent
          return this.executeThunk(action, getOriginalState, thunkId);
        }

        // Handle string actions by converting to action objects
        const actionObj: Action =
          typeof action === 'string' ? { type: action, payload, id: uuidv4() } : (action as Action);

        // Ensure action has an ID
        if (!actionObj.id) {
          actionObj.id = uuidv4();
        }
        const actionId = actionObj.id as string;

        debug('ipc', `[RENDERER_THUNK] Thunk ${thunkId} dispatching action ${actionObj.type} (${actionId})`);

        // Add to pending dispatches BEFORE creating the promise to ensure
        // getState can find it immediately
        this.pendingDispatches.add(actionId);
        debug(
          'ipc',
          `[RENDERER_THUNK] Added ${actionId} to pending dispatches, now pending: ${this.pendingDispatches.size}`,
        );

        // Create a promise that will resolve when this action completes
        const actionPromise = new Promise<Action>((resolve) => {
          // Store the callback to be called when action acknowledgment is received
          this.actionCompletionCallbacks.set(actionId, (result) => {
            debug('ipc', `[RENDERER_THUNK] Action ${actionId} completion callback called with result`, result);
            resolve(result || actionObj);
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
        debug('ipc', '[RENDERER_THUNK] Sending action to main process:', actionObj);
        debug('ipc', '[RENDERER_THUNK] Thunk ID:', thunkId);

        if (this.actionSender) {
          try {
            debug('ipc', `[RENDERER_THUNK] Sending action ${actionId} to main process`);
            await this.actionSender(actionObj, thunkId as any);
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
          debug('ipc:error', `[RENDERER_THUNK] No action sender configured, cannot send action ${actionId}`);
          throw new Error('Action sender not configured for renderer thunk processor');
        }

        return actionPromise;
      };

      // Get current state (potentially async)
      debug('ipc', `[RENDERER_THUNK] Getting current state for thunk ${thunkId}`);
      const state = await getOriginalState();
      debug('ipc', `[RENDERER_THUNK] Current state for thunk ${thunkId}:`, state);

      // Wrapper for getState within the thunk to ensure it doesn't run while an action is pending
      const getState = async (): Promise<S> => {
        debug('ipc', `[RENDERER_THUNK] getState called within thunk ${thunkId}`);

        const invokeGetOriginalState = async (): Promise<S> => {
          const currentState = getOriginalState(); // Invoke it
          return currentState instanceof Promise ? await currentState : currentState;
        };

        if (this.pendingDispatches.size === 0) {
          debug('ipc', `[RENDERER_THUNK] getState: No pending dispatches, returning state immediately`);
          return invokeGetOriginalState();
        }

        debug(
          'ipc',
          `[RENDERER_THUNK] getState called with ${this.pendingDispatches.size} pending dispatches, waiting...`,
        );
        // Log pending dispatch IDs for clarity
        debug('ipc', `[RENDERER_THUNK] Pending dispatch IDs: ${Array.from(this.pendingDispatches).join(', ')}`);

        const pendingPromises = Array.from(this.pendingDispatches).map(
          (actionId) =>
            new Promise<void>((resolvePromise) => {
              const existingCallback = this.actionCompletionCallbacks.get(actionId);
              // Augment or set the callback for this actionId to resolve our promise
              this.actionCompletionCallbacks.set(actionId, (result) => {
                if (existingCallback) {
                  existingCallback(result); // Call original callback if it existed
                }
                resolvePromise(); // Resolve the promise for this specific action
              });
            }),
        );

        debug('ipc', `[RENDERER_THUNK] Waiting for ${pendingPromises.length} action promises to resolve`);
        await Promise.all(pendingPromises);
        debug('ipc', '[RENDERER_THUNK] All dispatches complete, returning state');
        return invokeGetOriginalState();
      };

      // Execute the thunk with the dispatch function and current state
      debug('ipc', `[RENDERER_THUNK] Executing thunk function for ${thunkId}`);
      const result = await thunk(getState, dispatch);
      debug('ipc', `[RENDERER_THUNK] Thunk ${thunkId} execution completed, result:`, result);
      return result;
    } catch (error) {
      debug('ipc:error', `[RENDERER_THUNK] Error executing thunk ${thunkId}:`, error);
      throw error; // Rethrow to be caught by caller
    } finally {
      // Notify main process that thunk has completed
      if (this.thunkCompleter && this.currentWindowId) {
        try {
          debug('ipc', `[RENDERER_THUNK] Notifying main process of thunk ${thunkId} completion`);
          await this.thunkCompleter(thunkId);
          debug('ipc', `[RENDERER_THUNK] Thunk ${thunkId} completion notified`);
        } catch (e) {
          debug('ipc:error', `[RENDERER_THUNK] Error notifying thunk completion: ${e}`);
        }
      }
    }
  }

  /**
   * Dispatch an action to the main process (for non-thunk scenarios)
   */
  public async dispatchAction(action: Action | string, payload?: unknown, parentId?: string): Promise<void> {
    debug('ipc', '[RENDERER_THUNK] dispatchAction called with:', { action, payload, parentId });

    // Use the shared processor if available (called from preload context)
    // This allows non-thunk dispatches from preload to also use the main processor for consistency
    if (typeof window !== 'undefined' && window.__zubridge_thunkProcessor) {
      debug('ipc', '[RENDERER_THUNK] Using shared thunk processor from preload for dispatchAction');
      return window.__zubridge_thunkProcessor.dispatchAction(action, payload, parentId);
    }

    // If no actionSender, this instance can't dispatch directly
    if (!this.actionSender) {
      debug('ipc:error', '[RENDERER_THUNK] dispatchAction: No action sender configured, cannot dispatch.');
      throw new Error('Action sender not configured for direct dispatch.');
    }

    const actionObj: Action = typeof action === 'string' ? { type: action, payload, id: uuidv4() } : (action as Action);

    if (!actionObj.id) {
      actionObj.id = uuidv4();
    }

    debug('ipc', `[RENDERER_THUNK] dispatchAction: Sending action ${actionObj.type} (${actionObj.id})`);
    await this.actionSender(actionObj, parentId);
    debug('ipc', `[RENDERER_THUNK] dispatchAction: Action ${actionObj.id} sent.`);
  }
}

// Singleton instance of the thunk processor
let globalThunkProcessor: RendererThunkProcessor | undefined;

/**
 * Get the singleton instance of the RendererThunkProcessor
 */
export const getThunkProcessor = (): RendererThunkProcessor => {
  if (!globalThunkProcessor) {
    globalThunkProcessor = new RendererThunkProcessor(/* Action completion timeout can be passed here if needed */);
    debug('ipc', '[RENDERER_THUNK] Created new RendererThunkProcessor instance (global)');
  }
  return globalThunkProcessor;
};
