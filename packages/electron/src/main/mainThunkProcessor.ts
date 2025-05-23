import { v4 as uuidv4 } from 'uuid';
import type { Action, AnyState, Thunk, Dispatch, StateManager, ProcessResult } from '@zubridge/types';
import { getThunkManager } from '../lib/ThunkManager.js';
import { actionQueue } from './actionQueue.js';
import { IpcChannel } from '../constants.js';
import { BrowserWindow } from 'electron';
import { debug } from '@zubridge/core';
import { ThunkRegistrationQueue } from '../lib/ThunkRegistrationQueue.js';

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

  // Set to track first action for each thunk
  private sentFirstActionForThunk = new Set<string>();

  // Instantiate the thunk registration queue for main thunks
  private mainThunkRegistrationQueue = new ThunkRegistrationQueue(getThunkManager());

  constructor(actionCompletionTimeoutMs?: number) {
    this.actionCompletionTimeoutMs = actionCompletionTimeoutMs || DEFAULT_ACTION_COMPLETION_TIMEOUT;
    debug('core', `[MAIN_THUNK] Initialized with timeout: ${this.actionCompletionTimeoutMs}`);
  }

  /**
   * Initialize with required dependencies
   * This should be called before each dispatch operation with the current context
   */
  public initialize(options: { stateManager: StateManager<any> }): void {
    this.stateManager = options.stateManager;
    debug('core', '[MAIN_THUNK] Initialized with state manager');
  }

  /**
   * Completes a pending action and sends acknowledgment
   */
  public completeAction(actionId: string): void {
    const pendingAction = this.pendingActionPromises.get(actionId);
    if (pendingAction) {
      debug('core', `[MAIN_THUNK] Completing pending action ${actionId}`);

      // Get the current state after the action has been processed
      const currentState = this.stateManager?.getState();

      // Resolve with the current state or just the action ID if state can't be retrieved
      pendingAction.resolve(currentState ?? actionId);
      this.pendingActionPromises.delete(actionId);
    } else {
      debug('core', `[MAIN_THUNK] No pending action found for ${actionId}`);
    }
  }

  /**
   * Execute a thunk in the main process
   */
  public async executeThunk<S extends AnyState>(thunk: Thunk<S>): Promise<any> {
    if (!this.stateManager) {
      throw new Error('State manager not set. Call initialize() before executing thunks.');
    }

    // Generate a thunk ID for this execution
    const thunkId = uuidv4();
    debug('core', `[MAIN_THUNK] Executing thunk with ID: ${thunkId}`);

    // Register the thunk using the mainThunkRegistrationQueue (returns a promise that resolves when lock is acquired and registered)
    const MAIN_PROCESS_WINDOW_ID = 0;
    const thunkManager = getThunkManager();
    const currentActiveRootThunk = thunkManager.getActiveRootThunkId();
    const activeThunksSummary = thunkManager.getActiveThunksSummary();

    debug('core', `[MAIN_THUNK] Current active root thunk: ${currentActiveRootThunk || 'none'}`);
    debug('core', `[MAIN_THUNK] Active thunks count: ${activeThunksSummary.thunks.length}`);
    debug('core', `[MAIN_THUNK] Active thunks details:`, activeThunksSummary.thunks);

    await this.mainThunkRegistrationQueue.registerThunkQueued(
      thunkId,
      MAIN_PROCESS_WINDOW_ID,
      undefined,
      'main',
      async () => {
        try {
          // Create a dispatch function for the thunk that tracks each action
          const dispatch: Dispatch<S> = async (action: any, payload?: unknown) => {
            if (typeof action === 'function') {
              debug('core', `[MAIN_THUNK] Handling nested thunk from ${thunkId}`);
              const result = await this.executeThunk(action);
              return result;
            }
            return this.dispatchAction(action, payload, thunkId);
          };

          // Get state function
          const getState = async (): Promise<S> => {
            debug('core', '[MAIN_THUNK] Getting state for thunk');
            return this.stateManager!.getState() as S;
          };

          // Execute the thunk
          debug('core', '[MAIN_THUNK] Executing thunk function');
          const result = await thunk(getState, dispatch);
          debug('core', '[MAIN_THUNK] Thunk executed successfully, result:', result);

          // Mark thunk as completed
          thunkManager.markThunkCompleted(thunkId, result);
          return result;
        } catch (error) {
          debug('core:error', `[MAIN_THUNK] Error executing thunk: ${error}`);
          thunkManager.markThunkFailed(thunkId, error as Error);
          throw error;
        }
      },
    );
    return undefined;
  }

  /**
   * Process an action with our state manager
   */
  public processAction(action: Action | string, payload?: unknown): void {
    if (!this.stateManager) {
      throw new Error('State manager not set. Call initialize() before processing actions.');
    }

    // Convert string actions to object form
    const actionObj: Action =
      typeof action === 'string' ? { type: action, payload, id: uuidv4() } : { ...action, id: action.id || uuidv4() };

    // Mark the action as originating from the main process
    (actionObj as any).__isFromMainProcess = true;

    // Process the action
    debug('core', `[MAIN_THUNK] Processing standalone action: ${actionObj.type}`);
    this.stateManager.processAction(actionObj);
  }

  /**
   * Dispatch an action as part of a thunk
   */
  private async dispatchAction(action: Action | string, payload?: unknown, parentId?: string): Promise<any> {
    if (!this.stateManager) {
      throw new Error('State manager not set. Call initialize() before dispatching actions.');
    }

    // Track if this is the first action for a particular parentId
    const isFirstActionForThunk = parentId && !this.sentFirstActionForThunk.has(parentId);

    // Convert string actions to object form
    const actionObj: Action =
      typeof action === 'string' ? { type: action, payload, id: uuidv4() } : { ...action, id: action.id || uuidv4() };

    // Ensure action has an ID
    if (!actionObj.id) {
      actionObj.id = uuidv4();
    }

    // Add metadata for thunks
    if (parentId) {
      (actionObj as any).__thunkParentId = parentId;

      // Mark the first action in a thunk with __startsThunk
      if (isFirstActionForThunk) {
        debug('core', `[MAIN_THUNK] Marking action ${actionObj.id} as starting thunk ${parentId}`);
        (actionObj as any).__startsThunk = true;
        this.sentFirstActionForThunk.add(parentId);
      }

      // Ensure thunk is registered before enqueueing the action
      if (!getThunkManager().hasThunk(parentId)) {
        debug('core', `[MAIN_THUNK] Registering thunk ${parentId} before enqueueing action ${actionObj.id}`);
        await this.mainThunkRegistrationQueue.registerThunkQueued(parentId, 0, undefined, 'main');
      }
    }

    // Mark as from main process (use a special source window ID for main process)
    const MAIN_PROCESS_WINDOW_ID = 0;

    // Enqueue the action through the action queue to ensure proper ordering
    debug('core', `[MAIN_THUNK] Enqueueing action: ${actionObj.type} (${actionObj.id}) through action queue`);

    return new Promise((resolve, reject) => {
      // Create a promise for this action
      this.pendingActionPromises.set(actionObj.id!, {
        resolve,
        promise: Promise.resolve(actionObj.id),
      });

      // Set up a timeout for the action
      const timeout = setTimeout(() => {
        debug('core:error', `[MAIN_THUNK] Action ${actionObj.id} timed out after ${this.actionCompletionTimeoutMs}ms`);
        this.pendingActionPromises.delete(actionObj.id!);
        reject(new Error(`Action ${actionObj.id} timed out`));
      }, this.actionCompletionTimeoutMs);

      // Create the completion callback that will be called when the action actually finishes
      const onComplete = () => {
        clearTimeout(timeout);
        debug('core', `[MAIN_THUNK] Action ${actionObj.id} completed through action queue`);

        // Get the current state after the action has been processed
        const currentState = this.stateManager?.getState();

        // Complete the action (this will resolve our promise)
        this.completeAction(actionObj.id!);
      };

      // Enqueue through action queue with proper source window ID and completion callback
      actionQueue.enqueueAction(actionObj, MAIN_PROCESS_WINDOW_ID, parentId, onComplete);
    });
  }

  /**
   * Check if this would be the first action for a thunk
   */
  public isFirstActionForThunk(thunkId: string): boolean {
    return !this.sentFirstActionForThunk.has(thunkId);
  }
}

// Singleton instance
let mainThunkProcessorInstance: MainThunkProcessor | undefined;

/**
 * Get the global MainThunkProcessor instance
 */
export const getMainThunkProcessor = (): MainThunkProcessor => {
  if (!mainThunkProcessorInstance) {
    mainThunkProcessorInstance = new MainThunkProcessor();
  }
  return mainThunkProcessorInstance;
};
