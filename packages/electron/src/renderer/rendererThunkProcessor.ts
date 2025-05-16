import { v4 as uuidv4 } from 'uuid';
import type { Action, AnyState, Thunk, Dispatch } from '@zubridge/types';

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

  constructor(
    private debugLogging = false,
    actionCompletionTimeoutMs?: number,
  ) {
    this.actionCompletionTimeoutMs = actionCompletionTimeoutMs || DEFAULT_ACTION_COMPLETION_TIMEOUT;
    if (debugLogging) console.log('[RENDERER_THUNK] Initialized with timeout:', this.actionCompletionTimeoutMs);
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
    console.log('[RENDERER_THUNK] Initializing with options:', options);
    this.currentWindowId = options.windowId;
    this.actionSender = options.actionSender;
    this.thunkRegistrar = options.thunkRegistrar;
    this.thunkCompleter = options.thunkCompleter;

    // Update timeout configuration if provided - use direct assignment
    if (options.actionCompletionTimeoutMs !== undefined) {
      this.actionCompletionTimeoutMs = options.actionCompletionTimeoutMs;
      if (this.debugLogging) {
        console.log('[RENDERER_THUNK] Updated timeout:', this.actionCompletionTimeoutMs);
      }
    }

    console.log('[RENDERER_THUNK] Action sender:', this.actionSender);

    if (this.debugLogging) console.log(`[RENDERER_THUNK] Initialized with window ID ${options.windowId}`);
  }

  /**
   * Handle action completion notification
   * This should be called when an action acknowledgment is received from the main process
   */
  public completeAction(actionId: string, result: any): void {
    if (this.debugLogging) {
      console.log(`[RENDERER_THUNK] Action completed: ${actionId}`);
    }

    // Clear any pending timeout for this action
    const timeout = this.actionTimeouts.get(actionId);
    if (timeout) {
      if (this.debugLogging) {
        console.log(`[RENDERER_THUNK] Clearing timeout for action ${actionId}`);
      }
      clearTimeout(timeout);
      this.actionTimeouts.delete(actionId);
    }

    // Call any completion callbacks waiting on this action
    // This must happen BEFORE removing from pending dispatches
    // to ensure any getState calls know it's done
    const callback = this.actionCompletionCallbacks.get(actionId);
    if (callback) {
      if (this.debugLogging) {
        console.log(`[RENDERER_THUNK] Executing completion callback for action ${actionId}`);
      }
      callback(result);
      this.actionCompletionCallbacks.delete(actionId);
    } else if (this.debugLogging) {
      console.log(`[RENDERER_THUNK] No completion callback found for action ${actionId}`);
    }

    // Now remove from pending dispatches after callback completes
    this.pendingDispatches.delete(actionId);
    if (this.debugLogging) {
      console.log(
        `[RENDERER_THUNK] Removed ${actionId} from pending dispatches, remaining: ${this.pendingDispatches.size}`,
      );
      if (this.pendingDispatches.size > 0) {
        console.log(`[RENDERER_THUNK] Remaining dispatch IDs: ${Array.from(this.pendingDispatches).join(', ')}`);
      }
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
      if (this.debugLogging) console.log('[RENDERER_THUNK] Using shared thunk processor from preload');
      // Use the shared processor exposed from preload
      return window.__zubridge_thunkProcessor.executeThunk(thunk, getOriginalState, parentId);
    }

    // If we get here, we're using the local implementation

    // Generate a unique ID for this thunk
    const thunkId = uuidv4();
    if (this.debugLogging) console.log(`[RENDERER_THUNK] Executing thunk ${thunkId}`);

    // Register the thunk with main process
    if (this.thunkRegistrar && this.currentWindowId) {
      try {
        if (this.debugLogging) console.log(`[RENDERER_THUNK] Registering thunk ${thunkId} with main process`);
        await this.thunkRegistrar(thunkId, parentId);
        if (this.debugLogging) console.log(`[RENDERER_THUNK] Thunk ${thunkId} registered successfully`);
      } catch (error) {
        if (this.debugLogging) console.log(`[RENDERER_THUNK] Error registering thunk: ${error}`);
      }
    }

    try {
      // Create a dispatch function for this thunk that tracks each action
      const dispatch: Dispatch<S> = async (action: any, payload?: unknown) => {
        if (this.debugLogging) {
          console.log('[RENDERER_THUNK] Dispatching action:', action);
        }

        // Handle nested thunks
        if (typeof action === 'function') {
          if (this.debugLogging) console.log(`[RENDERER_THUNK] Handling nested thunk in ${thunkId}`);
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

        if (this.debugLogging)
          console.log(`[RENDERER_THUNK] Thunk ${thunkId} dispatching action ${actionObj.type} (${actionId})`);

        // Add to pending dispatches BEFORE creating the promise to ensure
        // getState can find it immediately
        this.pendingDispatches.add(actionId);
        if (this.debugLogging)
          console.log(
            `[RENDERER_THUNK] Added ${actionId} to pending dispatches, now pending: ${this.pendingDispatches.size}`,
          );

        // Create a promise that will resolve when this action completes
        const actionPromise = new Promise<Action>((resolve) => {
          // Store the callback to be called when action acknowledgment is received
          this.actionCompletionCallbacks.set(actionId, (result) => {
            if (this.debugLogging)
              console.log(`[RENDERER_THUNK] Action ${actionId} completion callback called with result`, result);
            resolve(result || actionObj);
          });

          if (this.debugLogging) console.log(`[RENDERER_THUNK] Set completion callback for action ${actionId}`);

          // Set up a safety timeout in case we don't receive an acknowledgment
          if (this.debugLogging) {
            console.log(`[RENDERER_THUNK] Setting up safety timeout for action ${actionId}`);
          }

          const safetyTimeout = setTimeout(() => {
            // If we still have a pending callback for this action, resolve it
            if (this.actionCompletionCallbacks.has(actionId)) {
              if (this.debugLogging) {
                console.log(
                  `[RENDERER_THUNK] Safety timeout triggered for action ${actionId} after ${this.actionCompletionTimeoutMs}ms`,
                );
              }
              this.completeAction(actionId, actionObj);
            }
          }, this.actionCompletionTimeoutMs);

          // Store the timeout so we can clear it if we get an acknowledgment
          this.actionTimeouts.set(actionId, safetyTimeout);
        });

        // Send the action to the main process
        if (this.debugLogging) {
          console.log('[RENDERER_THUNK] Sending action to main process:', actionObj);
          console.log('[RENDERER_THUNK] Thunk ID:', thunkId);
        }

        if (this.actionSender) {
          try {
            if (this.debugLogging) console.log(`[RENDERER_THUNK] Sending action ${actionId} to main process`);
            await this.actionSender(actionObj, thunkId as any);
            if (this.debugLogging) console.log(`[RENDERER_THUNK] Action ${actionId} sent to main process`);
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
            throw error;
          }
        } else {
          if (this.debugLogging) console.log(`[RENDERER_THUNK] ERROR: No actionSender available for thunk ${thunkId}`);

          // Clear any pending timeout
          const timeout = this.actionTimeouts.get(actionId);
          if (timeout) {
            clearTimeout(timeout);
            this.actionTimeouts.delete(actionId);
          }

          // If no sender is available, remove from pending and resolve with original action
          this.pendingDispatches.delete(actionId);
          this.actionCompletionCallbacks.delete(actionId);
          return actionObj;
        }

        if (this.debugLogging) console.log(`[RENDERER_THUNK] Waiting for action ${actionId} to complete`);
        // Return the action promise
        return actionPromise;
      };

      // Create a getState function that waits for pending dispatches
      const getState = async (): Promise<S> => {
        // Helper function to get the current state safely
        const getCurrentState = async (): Promise<S> => {
          if (typeof getOriginalState !== 'function') {
            return getOriginalState;
          }

          const state = getOriginalState();
          if (state instanceof Promise) {
            return await state;
          }

          return state;
        };

        if (this.pendingDispatches.size === 0) {
          // No pending dispatches, return state immediately
          if (this.debugLogging) {
            console.log(`[RENDERER_THUNK] getState: No pending dispatches, returning state immediately`);
          }
          return getCurrentState();
        }

        if (this.debugLogging) {
          console.log(
            `[RENDERER_THUNK] getState called with ${this.pendingDispatches.size} pending dispatches, waiting...`,
          );
          console.log(`[RENDERER_THUNK] Pending dispatch IDs: ${Array.from(this.pendingDispatches).join(', ')}`);
        }

        // Create promises for all pending dispatches
        const pendingPromises = Array.from(this.pendingDispatches).map(
          (actionId) =>
            new Promise<void>((resolve) => {
              // If we already have a callback for this action, wrap it to also resolve our promise
              const existingCallback = this.actionCompletionCallbacks.get(actionId);
              if (existingCallback) {
                this.actionCompletionCallbacks.set(actionId, (result) => {
                  existingCallback(result);
                  resolve();
                });
              } else {
                // Otherwise, register a new callback just for our promise
                this.actionCompletionCallbacks.set(actionId, () => {
                  resolve();
                });
              }
            }),
        );

        if (this.debugLogging) {
          console.log(`[RENDERER_THUNK] Waiting for ${pendingPromises.length} action promises to resolve`);
        }

        // Wait for all pending dispatches to complete
        await Promise.all(pendingPromises);

        if (this.debugLogging) {
          console.log('[RENDERER_THUNK] All dispatches complete, returning state');
        }

        // Return the current state
        return getCurrentState();
      };

      if (this.debugLogging) console.log(`[RENDERER_THUNK] Executing thunk function for ${thunkId}`);
      // Execute the thunk with our async getState and dispatch functions
      const result = await thunk(getState, dispatch);
      if (this.debugLogging) console.log(`[RENDERER_THUNK] Thunk ${thunkId} completed with result:`, result);

      // Notify main process of completion
      if (this.thunkCompleter) {
        try {
          if (this.debugLogging) console.log(`[RENDERER_THUNK] Notifying main process of thunk ${thunkId} completion`);
          await this.thunkCompleter(thunkId);
          if (this.debugLogging) console.log(`[RENDERER_THUNK] Main process notified of thunk ${thunkId} completion`);
        } catch (error) {
          if (this.debugLogging) console.log(`[RENDERER_THUNK] Error completing thunk: ${error}`);
        }
      }

      return result;
    } catch (error) {
      // Notify main process of completion (with error)
      if (this.thunkCompleter) {
        try {
          await this.thunkCompleter(thunkId);
        } catch (completeError) {
          if (this.debugLogging) console.log(`[RENDERER_THUNK] Error completing thunk: ${completeError}`);
        }
      }

      throw error;
    }
  }

  /**
   * Dispatches a single action to the main process
   */
  public async dispatchAction(action: Action | string, payload?: unknown, parentId?: string): Promise<void> {
    // Check if we should use the shared thunk processor from preload
    if (typeof window !== 'undefined' && window.__zubridge_thunkProcessor) {
      if (this.debugLogging) console.log('[RENDERER_THUNK] Using shared dispatch from preload');
      // Use the shared processor exposed from preload
      return window.__zubridge_thunkProcessor.dispatchAction(action, payload, parentId);
    }

    const actionObj: Action = typeof action === 'string' ? { type: action, payload, id: uuidv4() } : action;

    // Ensure action has an ID
    if (!actionObj.id) {
      actionObj.id = uuidv4();
    }

    if (this.debugLogging) console.log(`[RENDERER_THUNK] Dispatching action: ${actionObj.type}`);

    // Send to main process
    if (this.actionSender) {
      await this.actionSender(actionObj, parentId as any);
    }
  }
}

// Create a singleton instance
const globalThunkProcessor = new RendererThunkProcessor(true);

/**
 * Get the global renderer thunk processor
 */
export const getThunkProcessor = (): RendererThunkProcessor => {
  return globalThunkProcessor;
};
