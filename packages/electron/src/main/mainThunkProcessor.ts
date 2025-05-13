import { v4 as uuidv4 } from 'uuid';
import type { Action, AnyState, Thunk, Dispatch, StateManager, ProcessResult } from '@zubridge/types';
import { getThunkTracker } from '../lib/thunkTracker.js';
import { IpcChannel } from '../constants.js';
import { BrowserWindow } from 'electron';

// Default timeout for action completion (10 seconds)
const DEFAULT_ACTION_COMPLETION_TIMEOUT = 10000;

/**
 * Handles thunk execution in the main process
 */
export class MainThunkProcessor {
  // State manager to process actions
  private stateManager?: StateManager<any>;

  // Map to track action promises for potentially async actions
  private pendingActionPromises = new Map<
    string,
    {
      resolve: (value: any) => void;
      promise: Promise<any>;
    }
  >();

  // Configuration options
  private actionCompletionTimeoutMs: number;

  constructor(
    private debugLogging = false,
    actionCompletionTimeoutMs?: number,
  ) {
    this.actionCompletionTimeoutMs = actionCompletionTimeoutMs || DEFAULT_ACTION_COMPLETION_TIMEOUT;
    if (debugLogging) console.log('[MAIN_THUNK] Initialized with timeout:', this.actionCompletionTimeoutMs);
  }

  /**
   * Initialize with required dependencies
   * This should be called before each dispatch operation with the current context
   */
  public initialize(options: { stateManager: StateManager<any> }): void {
    this.stateManager = options.stateManager;

    if (this.debugLogging) {
      console.log('[MAIN_THUNK] Initialized with state manager');
    }
  }

  /**
   * Send acknowledgment for a completed action
   */
  private sendActionAcknowledgment(actionId: string, sourceWindowId?: number): void {
    if (!sourceWindowId) {
      if (this.debugLogging) {
        console.log(`[MAIN_THUNK] No source window ID for action ${actionId}, cannot send acknowledgment`);
      }
      return;
    }

    try {
      // Get the window by ID
      const window = BrowserWindow.fromId(sourceWindowId);
      if (!window || window.isDestroyed()) {
        if (this.debugLogging) {
          console.log(`[MAIN_THUNK] Window ${sourceWindowId} not found or destroyed, cannot send acknowledgment`);
        }
        return;
      }

      // Get thunk state to include with the acknowledgment
      const thunkTracker = getThunkTracker(this.debugLogging);
      const thunkState = thunkTracker.getActiveThunksSummary();

      if (this.debugLogging) {
        console.log(`[MAIN_THUNK] Sending acknowledgment for action ${actionId} to window ${sourceWindowId}`);
        console.log(
          `[MAIN_THUNK] Including thunk state (version ${thunkState.version}) with ${thunkState.thunks.length} active thunks`,
        );
      }

      // Send the acknowledgment via IPC
      window.webContents.send(IpcChannel.DISPATCH_ACK, {
        actionId,
        thunkState,
      });
    } catch (error) {
      console.error(`[MAIN_THUNK] Error sending acknowledgment for action ${actionId}:`, error);
    }
  }

  /**
   * Completes a pending action and sends acknowledgment
   */
  public completeAction(actionId: string): void {
    const pendingAction = this.pendingActionPromises.get(actionId);
    if (pendingAction) {
      if (this.debugLogging) {
        console.log(`[MAIN_THUNK] Completing pending action ${actionId}`);
      }

      // Get the current state after the action has been processed
      const currentState = this.stateManager?.getState();

      // Resolve with the current state or just the action ID if state can't be retrieved
      pendingAction.resolve(currentState ?? actionId);
      this.pendingActionPromises.delete(actionId);
    } else if (this.debugLogging) {
      console.log(`[MAIN_THUNK] No pending action found for ${actionId}`);
    }
  }

  /**
   * Execute a thunk in the main process
   */
  public async executeThunk<S extends AnyState>(
    thunk: Thunk<S>,
    getState: () => S | Promise<S>,
    parentId?: string,
  ): Promise<any> {
    if (!this.stateManager) {
      throw new Error('State manager not set. Call initialize() before executing thunks.');
    }

    // Get the ThunkTracker for coordinating with renderer
    const thunkTracker = getThunkTracker(this.debugLogging);

    // Register thunk with tracker
    const thunkId = uuidv4();
    const thunkHandle = thunkTracker.registerThunk(parentId || undefined);

    // Mark as executing
    thunkHandle.markExecuting();

    try {
      // Create a dispatch function for the thunk
      const dispatch: Dispatch<S> = async (action: any, payload?: unknown) => {
        // Handle nested thunks
        if (typeof action === 'function') {
          // For nested thunks, we pass along the same getState function
          return this.executeThunk(action, getState, thunkHandle.thunkId);
        }

        // Handle string actions
        const actionObj: Action =
          typeof action === 'string'
            ? { type: action, payload, id: uuidv4() }
            : { ...action, id: action.id || uuidv4() };

        // Add relation to parent thunk
        if (thunkHandle.thunkId) {
          (actionObj as any).__thunkParentId = thunkHandle.thunkId;
        }

        // Mark the action as originating from the main process
        (actionObj as any).__isFromMainProcess = true;

        if (this.debugLogging) {
          console.log(
            `[MAIN_THUNK] Processing action ${actionObj.type} (${actionObj.id}) as part of thunk ${thunkHandle.thunkId}`,
          );
        }

        // Create a promise that will resolve when the action has been fully processed
        const actionPromiseId = Math.random().toString(36).substring(2, 10);
        console.log(`[PROMISE_DEBUG] [${actionPromiseId}] Creating action promise for: ${actionObj.type}`);

        const actionPromise = new Promise((resolve) => {
          // Store the promise resolver in our map
          this.pendingActionPromises.set(actionObj.id!, {
            resolve,
            promise: Promise.resolve(),
          });

          if (this.debugLogging) {
            console.log(`[MAIN_THUNK] Created pending promise for action ${actionObj.id}`);
          }
        });

        // Process the action and check if it was processed synchronously
        const processResult = this.stateManager!.processAction(actionObj) as ProcessResult | void;
        const isProcessedSynchronously = processResult === undefined || processResult.isSync;

        // Track the action
        thunkHandle.addAction(actionObj.id!);

        // For actions that are processed synchronously and originate from the main process,
        // complete them immediately without waiting
        if (isProcessedSynchronously && (actionObj as any).__isFromMainProcess) {
          if (this.debugLogging) {
            console.log(`[MAIN_THUNK] Action ${actionObj.id} processed synchronously, completing immediately`);
          }
          setTimeout(() => {
            this.completeAction(actionObj.id!);
          }, 0);
        }
        // For async actions with completion promises, properly await them
        else if (processResult && !processResult.isSync && processResult.completion) {
          if (this.debugLogging) {
            console.log(`[MAIN_THUNK] Waiting for async action ${actionObj.id} to complete`);
          }

          console.log(`[MAIN_ASYNC_DEBUG] START waiting for completion of ${actionObj.type}`);

          try {
            // Wait for the action's completion promise (which will not return a value)
            await processResult.completion;
            console.log(`[MAIN_ASYNC_DEBUG] RESOLVED completion promise for ${actionObj.type}`);

            // If the action is still pending, complete it now
            if (this.pendingActionPromises.has(actionObj.id!)) {
              if (this.debugLogging) {
                console.log(`[MAIN_THUNK] Async action ${actionObj.id} completed successfully`);
              }

              // Use the original action object as the result since the completion promise returns void
              this.pendingActionPromises.get(actionObj.id!)!.resolve(actionObj);
              this.pendingActionPromises.delete(actionObj.id!);

              // Send acknowledgment for the action
              this.sendActionAcknowledgment(actionObj.id!, (actionObj as any).__sourceWindowId);
            }
          } catch (error) {
            console.error(`[MAIN_THUNK] Error in async action ${actionObj.id}:`, error);
            console.error(`[MAIN_ASYNC_DEBUG] ERROR in completion promise for ${actionObj.type}`, error);

            // Complete the action even if it failed
            if (this.pendingActionPromises.has(actionObj.id!)) {
              this.completeAction(actionObj.id!);
              this.sendActionAcknowledgment(actionObj.id!, (actionObj as any).__sourceWindowId);
            }
          }
        }
        // For actions without a completion promise, set up a safety timeout
        else {
          // Add a safety timeout for actions without completion promises
          setTimeout(() => {
            // If the action hasn't been completed yet, complete it
            if (this.pendingActionPromises.has(actionObj.id!)) {
              if (this.debugLogging) {
                console.log(
                  `[MAIN_THUNK] Auto-completing action ${actionObj.id} after timeout (${this.actionCompletionTimeoutMs}ms)`,
                );
              }
              this.completeAction(actionObj.id!);

              // Send acknowledgment for the action
              this.sendActionAcknowledgment(actionObj.id!, (actionObj as any).__sourceWindowId);
            }
          }, this.actionCompletionTimeoutMs);
        }

        if (this.debugLogging) {
          console.log(`[MAIN_THUNK] Action ${actionObj.type} (${actionObj.id}) started, awaiting completion`);
        }

        // Wait for the action to complete before returning
        const result = await actionPromise;

        if (this.debugLogging) {
          console.log(`[MAIN_THUNK] Action ${actionObj.type} (${actionObj.id}) completed`);
        }

        return result; // Return the action object or any result from the action
      };

      // Create an async getState function that matches our consistent API
      // In the main process this just wraps the synchronous getState in a Promise
      const asyncGetState = async (): Promise<S> => {
        if (this.debugLogging) {
          console.log('[MAIN_THUNK] Async getState called');
        }

        // Handle both synchronous and asynchronous getState
        return getState instanceof Promise ? await getState : Promise.resolve(getState());
      };

      // Execute the thunk with the async getState function
      // No type assertion needed as this now matches the Thunk<S> type
      const result = await thunk(asyncGetState, dispatch);

      // Mark thunk as completed
      thunkHandle.markCompleted(result);

      return result;
    } catch (error) {
      // Mark thunk as failed
      thunkHandle.markFailed(error as Error);
      throw error;
    }
  }

  /**
   * Process a direct action
   */
  public processAction(action: Action | string, payload?: unknown): void {
    if (!this.stateManager) {
      throw new Error('State manager not set. Call initialize() before processing actions.');
    }

    const actionObj: Action =
      typeof action === 'string' ? { type: action, payload, id: uuidv4() } : { ...action, id: action.id || uuidv4() };

    // Mark action as originating from the main process
    (actionObj as any).__isFromMainProcess = true;

    this.stateManager.processAction(actionObj);
  }
}

// Create a global singleton instance
const globalMainThunkProcessor = new MainThunkProcessor(true);

/**
 * Get the global singleton main process thunk processor
 */
export const getMainThunkProcessor = (): MainThunkProcessor => {
  return globalMainThunkProcessor;
};
