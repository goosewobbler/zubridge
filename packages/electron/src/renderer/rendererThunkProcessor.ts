import { v4 as uuidv4 } from 'uuid';
import type { Action, AnyState, Thunk, Dispatch } from '@zubridge/types';

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

  constructor(private debugLogging = false) {
    if (debugLogging) console.log('[RENDERER_THUNK] Initialized');
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
  }): void {
    console.log('[RENDERER_THUNK] Initializing with options:', options);
    this.currentWindowId = options.windowId;
    this.actionSender = options.actionSender;
    this.thunkRegistrar = options.thunkRegistrar;
    this.thunkCompleter = options.thunkCompleter;

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

    // Remove from pending dispatches
    this.pendingDispatches.delete(actionId);

    // Call any completion callbacks waiting on this action
    const callback = this.actionCompletionCallbacks.get(actionId);
    if (callback) {
      callback(result);
      this.actionCompletionCallbacks.delete(actionId);
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
        console.log('[RENDERER_THUNK] Dispatching action:', action);

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

        if (this.debugLogging)
          console.log(`[RENDERER_THUNK] Thunk ${thunkId} dispatching action ${actionObj.type} (${actionObj.id})`);

        // Add to pending dispatches
        this.pendingDispatches.add(actionObj.id);
        if (this.debugLogging)
          console.log(
            `[RENDERER_THUNK] Added ${actionObj.id} to pending dispatches, now pending: ${this.pendingDispatches.size}`,
          );

        // Create a promise that will resolve when this action completes
        const actionPromise = new Promise<Action>((resolve) => {
          // Store the callback to be called when action acknowledgment is received
          this.actionCompletionCallbacks.set(actionObj.id, (result) => {
            if (this.debugLogging)
              console.log(`[RENDERER_THUNK] Action ${actionObj.id} completion callback called with result`, result);
            resolve(result || actionObj);
          });
          if (this.debugLogging) console.log(`[RENDERER_THUNK] Set completion callback for action ${actionObj.id}`);
        });

        // Send the action to the main process
        console.log('[RENDERER_THUNK] Sending action to main process:', actionObj);
        console.log('[RENDERER_THUNK] Thunk ID:', thunkId);
        console.log('[RENDERER_THUNK] Action sender:', this.actionSender);

        if (this.actionSender) {
          if (this.debugLogging) console.log(`[RENDERER_THUNK] Sending action ${actionObj.id} to main process`);
          await this.actionSender(actionObj, thunkId as any);
          if (this.debugLogging) console.log(`[RENDERER_THUNK] Action ${actionObj.id} sent to main process`);
        } else {
          if (this.debugLogging) console.log(`[RENDERER_THUNK] ERROR: No actionSender available for thunk ${thunkId}`);
        }

        if (this.debugLogging) console.log(`[RENDERER_THUNK] Waiting for action ${actionObj.id} to complete`);
        // Return the action promise
        return actionPromise;
      };

      // Create a getState function that waits for pending dispatches
      const getState = async (): Promise<S> => {
        if (this.pendingDispatches.size === 0) {
          // No pending dispatches, return state immediately
          if (this.debugLogging)
            console.log(`[RENDERER_THUNK] getState: No pending dispatches, returning state immediately`);
          return getOriginalState instanceof Promise ? await getOriginalState : getOriginalState();
        }

        if (this.debugLogging) {
          console.log(
            `[RENDERER_THUNK] getState called with ${this.pendingDispatches.size} pending dispatches, waiting...`,
          );
          console.log(`[RENDERER_THUNK] Pending dispatch IDs: ${Array.from(this.pendingDispatches).join(', ')}`);
        }

        // Wait for pending dispatches to complete
        return new Promise<S>((resolve) => {
          const checkQueue = () => {
            if (this.pendingDispatches.size === 0) {
              // No more pending dispatches, resolve with current state
              if (this.debugLogging) {
                console.log('[RENDERER_THUNK] All dispatches complete, returning state');
              }

              Promise.resolve(getOriginalState()).then(resolve);
            } else {
              // Check again after a short delay
              if (this.debugLogging) {
                console.log(`[RENDERER_THUNK] Still waiting for ${this.pendingDispatches.size} dispatches to complete`);
                console.log(`[RENDERER_THUNK] Pending IDs: ${Array.from(this.pendingDispatches).join(', ')}`);
              }
              setTimeout(checkQueue, 10);
            }
          };

          checkQueue();
        });
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

// Create a global singleton instance
const globalThunkProcessor = new RendererThunkProcessor(true);

/**
 * Get the global singleton thunk processor
 */
export const getThunkProcessor = (): RendererThunkProcessor => {
  console.log('[RENDERER_THUNK] Getting thunk processor');
  console.log('[RENDERER_THUNK] Local action sender:', globalThunkProcessor.actionSender);

  if (typeof window !== 'undefined') {
    console.log('[RENDERER_THUNK] Window is defined');
    // Return the local processor, which will delegate to preload's exposed processor
  }

  return globalThunkProcessor;
};
