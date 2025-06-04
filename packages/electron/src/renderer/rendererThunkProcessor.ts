import { v4 as uuidv4 } from 'uuid';
import type { Action, AnyState, Thunk, Dispatch } from '@zubridge/types';
import { debug } from '@zubridge/core';
import { Thunk as ThunkClass } from '../lib/Thunk.js';

// Default timeout for action completion (10 seconds)
const DEFAULT_ACTION_COMPLETION_TIMEOUT = 10000;

// Add a declaration for our exposed interface
declare global {
  interface Window {
    __zubridge_thunkProcessor?: {
      executeThunk: (thunk: any, getState: () => any, parentId?: string) => Promise<any>;
      completeAction: (actionId: string, result: any) => void;
      dispatchAction: (action: Action | string, payload?: unknown, parentId?: string) => Promise<void>;
    };
    __zubridge_windowId?: string;
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
    if (typeof window === 'undefined' || !window.__zubridge_thunkProcessor) {
      throw new Error('Zubridge preload script is required for thunk execution.');
    }
    // Use the shared processor exposed from preload
    return window.__zubridge_thunkProcessor.executeThunk(thunk, getOriginalState, parentId);
  }

  /**
   * Internal thunk execution implementation (without preload check)
   */
  public async executeThunkImplementation<S extends AnyState>(
    thunkFn: Thunk<S>,
    getOriginalState: () => S | Promise<S>,
    parentId?: string,
  ): Promise<any> {
    // Create a Thunk instance
    const thunk = new ThunkClass({
      sourceWindowId: this.currentWindowId ?? 0,
      type: 'renderer',
      parentId,
    });
    debug('ipc', `[RENDERER_THUNK] Executing thunk ${thunk.id}`);

    // Register the thunk with main process
    if (this.thunkRegistrar && this.currentWindowId) {
      try {
        debug('ipc', `[RENDERER_THUNK] Registering thunk ${thunk.id} with main process`);
        await this.thunkRegistrar(thunk.id, parentId);
        debug('ipc', `[RENDERER_THUNK] Thunk ${thunk.id} registered successfully`);
      } catch (error) {
        debug('ipc:error', `[RENDERER_THUNK] Error registering thunk: ${error}`);
      }
    }

    // Track if this is the first action in the thunk
    let isFirstAction = true;

    try {
      // Create a dispatch function for this thunk that tracks each action
      const dispatch: Dispatch<S> = async (action: any, payload?: unknown) => {
        debug('ipc', '[RENDERER_THUNK] Dispatching action:', action);

        // Handle nested thunks
        if (typeof action === 'function') {
          debug('ipc', `[RENDERER_THUNK] Handling nested thunk in ${thunk.id}`);
          // For nested thunks, we use the current thunk ID as the parent
          return this.executeThunkImplementation(action, getOriginalState, thunk.id);
        }

        // Handle string actions by converting to action objects
        const actionObj: Action =
          typeof action === 'string'
            ? { type: action, payload, __id: uuidv4() }
            : { ...action, __id: action.__id || uuidv4() };

        const actionId = actionObj.__id as string;

        debug('ipc', `[RENDERER_THUNK] Thunk ${thunk.id} dispatching action ${actionObj.type} (${actionId})`);

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
        const actionPromise = new Promise<any>((resolve) => {
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
          debug('ipc:error', `[RENDERER_THUNK] No action sender configured, cannot send action ${actionId}`);
          throw new Error('Action sender not configured for renderer thunk processor');
        }

        return actionPromise;
      };

      // Use the getOriginalState directly - this comes from the renderer store mirror
      const getState = async (): Promise<S> => {
        debug('ipc', `[RENDERER_THUNK] getState called for thunk ${thunk.id}`);
        return getOriginalState();
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
  public async dispatchAction(action: Action | string, payload?: unknown, parentId?: string): Promise<void> {
    debug('ipc', '[RENDERER_THUNK] dispatchAction called with:', { action, payload, parentId });

    // Use the shared processor if available (called from preload context)
    if (typeof window !== 'undefined' && window.__zubridge_thunkProcessor) {
      debug('ipc', '[RENDERER_THUNK] Using shared thunk processor from preload for dispatchAction');
      return window.__zubridge_thunkProcessor.dispatchAction(action, payload, parentId);
    }

    // If no actionSender, this instance can't dispatch directly
    if (!this.actionSender) {
      debug('ipc:error', '[RENDERER_THUNK] dispatchAction: No action sender configured, cannot dispatch.');
      throw new Error('Action sender not configured for direct dispatch.');
    }

    const actionObj: Action =
      typeof action === 'string'
        ? { type: action, payload, __id: uuidv4() }
        : { ...action, __id: action.__id || uuidv4() };

    debug('ipc', `[RENDERER_THUNK] dispatchAction: Sending action ${actionObj.type} (${actionObj.__id})`);
    await this.actionSender(actionObj, parentId);
    debug('ipc', `[RENDERER_THUNK] dispatchAction: Action ${actionObj.__id} sent.`);
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
