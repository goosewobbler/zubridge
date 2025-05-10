import { v4 as uuidv4 } from 'uuid';
import type { Action, AnyState, Thunk, Dispatch, StateManager } from '@zubridge/types';
import { getThunkTracker } from '../lib/thunkTracker.js';

/**
 * Handles thunk execution in the main process
 */
export class MainThunkProcessor {
  // State manager to process actions
  private stateManager?: StateManager<any>;

  constructor(private debugLogging = false) {
    if (debugLogging) console.log('[MAIN_THUNK] Initialized');
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

        // Process the action
        this.stateManager!.processAction(actionObj);

        // Track the action (actionObj.id is guaranteed to be defined at this point)
        thunkHandle.addAction(actionObj.id!);

        return actionObj;
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
