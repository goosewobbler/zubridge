import { debug } from '@zubridge/core';
import type {
  Action,
  AnyState,
  Dispatch,
  DispatchOptions,
  StateManager,
  Thunk,
} from '@zubridge/types';
import { v4 as uuidv4 } from 'uuid';
import { thunkManager } from '../lib/initThunkManager.js';
import { Thunk as ThunkClass } from '../lib/Thunk.js';
import { ThunkRegistrationQueue } from '../lib/ThunkRegistrationQueue.js';
import { QueueOverflowError } from '../types/errors.js';
import type { ThunkProcessorOptions } from '../types/thunkProcessor.js';
import { getThunkProcessorOptions } from '../utils/thunkProcessor.js';
import { actionQueue } from './actionQueue.js';

/**
 * Handles thunk execution in the main process
 */
export class MainThunkProcessor {
  // State manager to process actions
  private stateManager?: StateManager<AnyState>;

  // Map to track action promises for potentially async actions
  private pendingActionPromises = new Map<
    string,
    {
      resolve: (value: unknown) => void;
      promise: Promise<unknown>;
    }
  >();

  // Configuration options
  private actionCompletionTimeoutMs: number;
  private maxQueueSize: number;

  // Set to track first action for each thunk
  private sentFirstActionForThunk = new Set<string>();

  // Instantiate the thunk registration queue for main thunks
  private mainThunkRegistrationQueue = new ThunkRegistrationQueue(thunkManager);

  constructor(options?: ThunkProcessorOptions) {
    const config = getThunkProcessorOptions(options);
    this.actionCompletionTimeoutMs = config.actionCompletionTimeoutMs;
    this.maxQueueSize = config.maxQueueSize;
    debug(
      'core',
      `[MAIN_THUNK] Initialized with timeout: ${this.actionCompletionTimeoutMs}ms, maxQueueSize: ${this.maxQueueSize}`,
    );
  }

  /**
   * Initialize with required dependencies
   * This should be called before each dispatch operation with the current context
   */
  public initialize(options: { stateManager: StateManager<AnyState> }): void {
    this.stateManager = options.stateManager;
    thunkManager.setStateManager(this.stateManager);
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
  public async executeThunk<S extends AnyState>(
    thunk: Thunk<S>,
    options?: DispatchOptions,
    parentId?: string,
  ): Promise<unknown> {
    if (!this.stateManager) {
      throw new Error('State manager not set. Call initialize() before executing thunks.');
    }

    // Register the thunk using the mainThunkRegistrationQueue (returns a promise that resolves when lock is acquired and registered)
    const MAIN_PROCESS_WINDOW_ID = 0;
    const currentActiveRootThunk = thunkManager.getRootThunkId();
    const activeThunksSummary = thunkManager.getActiveThunksSummary();

    const thunkObj = new ThunkClass({
      sourceWindowId: MAIN_PROCESS_WINDOW_ID,
      source: 'main',
      parentId,
      keys: options?.keys,
      bypassThunkLock: options?.bypassThunkLock,
      bypassAccessControl: options?.bypassAccessControl,
    });

    debug(
      'core',
      `[MAIN_THUNK] Executing thunk with ID: ${thunkObj.id}${parentId ? ` (parent: ${parentId})` : ''}`,
    );
    debug('core', `[MAIN_THUNK] Current active root thunk: ${currentActiveRootThunk || 'none'}`);
    debug('core', `[MAIN_THUNK] Active thunks count: ${activeThunksSummary.thunks.length}`);
    debug('core', '[MAIN_THUNK] Active thunks details:', activeThunksSummary.thunks);

    // Execute the thunk through the registration queue and then wait for state propagation
    const thunkExecutionPromise = this.mainThunkRegistrationQueue.registerThunk(
      thunkObj,
      async () => {
        try {
          // Create a dispatch function for the thunk that tracks each action
          // This dispatch is "scoped" to the parent's keys/force
          const dispatch: Dispatch<S> = async (
            action: string | Action | Thunk<S>,
            payload?: unknown,
            _childOptions?: DispatchOptions,
          ) => {
            // Only allow the same keys/force as the parent (no escalation)
            const effectiveOptions = { ...options };
            if (typeof action === 'function') {
              debug('core', `[MAIN_THUNK] Handling nested thunk from ${thunkObj.id}`);
              // Pass down the same options to nested thunks, and pass current thunkId as parentId
              const result = await this.executeThunk(
                action as Thunk<S>,
                effectiveOptions,
                thunkObj.id,
              );
              return result;
            }
            return this.dispatchAction(action, payload, thunkObj.id, effectiveOptions);
          };

          // Get state function
          const getState = async (): Promise<S> => {
            debug('core', '[MAIN_THUNK] Getting state for thunk');
            if (!this.stateManager) {
              throw new Error('State manager not initialized');
            }
            return this.stateManager.getState() as S;
          };

          // Execute the thunk
          debug('core', '[MAIN_THUNK] Executing thunk function');
          const result = await thunk(getState, dispatch);
          debug('core', '[MAIN_THUNK] Thunk executed successfully, result:', result);

          // Return the result immediately - the ThunkRegistrationQueue will call completeThunk()
          return result;
        } catch (error) {
          debug('core:error', `[MAIN_THUNK] Error executing thunk: ${error}`);
          thunkManager.markThunkFailed(
            thunkObj.id,
            error instanceof Error ? error : new Error(String(error)),
          );
          throw error;
        }
      },
      undefined, // rendererCallback
    );

    // Wait for the thunk execution to complete, then wait for state propagation
    const result = await thunkExecutionPromise;

    // Now wait for all state updates to be acknowledged before returning
    debug('core', '[MAIN_THUNK] Thunk execution complete, waiting for state propagation');

    // Clean up expired state updates before checking completion
    thunkManager.cleanupExpiredStateUpdates(30000); // 30 second max age

    // Check immediate completion first (in case there were no state changes)
    if (thunkManager.isThunkFullyComplete(thunkObj.id)) {
      debug(
        'core',
        `[MAIN_THUNK] Thunk ${thunkObj.id} already fully complete (no pending state updates)`,
      );
      return result;
    }

    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      const checkCompletion = () => {
        // Clean up expired updates on each check
        thunkManager.cleanupExpiredStateUpdates(30000);

        if (thunkManager.isThunkFullyComplete(thunkObj.id)) {
          const elapsed = Date.now() - startTime;
          debug(
            'core',
            `[MAIN_THUNK] Thunk ${thunkObj.id} fully complete after ${elapsed}ms (execution + state propagation)`,
          );
          resolve(result);
        } else {
          // Check again in a short interval
          setTimeout(checkCompletion, 100);
        }
      };

      // Set up timeout for state propagation
      const timeout = setTimeout(() => {
        debug(
          'core:error',
          `[MAIN_THUNK] Timeout waiting for state propagation for thunk ${thunkObj.id}`,
        );
        reject(
          new Error(
            `Thunk completion timeout: state propagation not acknowledged within ${this.actionCompletionTimeoutMs}ms`,
          ),
        );
      }, this.actionCompletionTimeoutMs);

      // Start checking completion
      checkCompletion();

      // Ensure timeout is cleared when resolved
      const _safeResolve = (value: unknown) => {
        clearTimeout(timeout);
        resolve(value);
      };
      const _safeReject = (error: unknown) => {
        clearTimeout(timeout);
        reject(error);
      };
    });
  }

  /**
   * Process an action with our state manager, supporting options (keys/force)
   */
  public processAction(action: Action | string, options?: DispatchOptions): void {
    if (!this.stateManager) {
      throw new Error('State manager not set. Call initialize() before processing actions.');
    }

    // Convert string actions to object form
    const actionObj: Action =
      typeof action === 'string'
        ? { type: action, __id: uuidv4() }
        : { ...action, __id: action.__id || uuidv4() };

    // Mark the action as originating from the main process
    actionObj.__isFromMainProcess = true;

    // Attach keys/force to the action for downstream processing
    if (options?.keys) actionObj.__keys = options.keys;
    if (options?.bypassThunkLock) actionObj.__bypassThunkLock = options.bypassThunkLock;

    // Process the action
    debug('core', `[MAIN_THUNK] Processing standalone action: ${actionObj.type}`);
    this.stateManager.processAction(actionObj);
  }

  /**
   * Dispatch an action as part of a thunk or as a standalone action, supporting options (keys/force)
   */
  private async dispatchAction(
    action: Action | string,
    payload?: unknown,
    parentId?: string,
    options?: DispatchOptions,
  ): Promise<unknown> {
    if (!this.stateManager) {
      throw new Error('State manager not set. Call initialize() before dispatching actions.');
    }

    // Track if this is the first action for a particular parentId
    const isFirstActionForThunk = parentId && !this.sentFirstActionForThunk.has(parentId);

    // Convert string actions to object form
    const actionObj: Action =
      typeof action === 'string'
        ? { type: action, payload, __id: uuidv4() }
        : { ...action, __id: action.__id || uuidv4() };

    // Ensure action has an ID
    if (!actionObj.__id) {
      actionObj.__id = uuidv4();
    }

    // Add metadata for thunks
    if (parentId) {
      actionObj.__thunkParentId = parentId;

      // Mark the first action in a thunk with __startsThunk
      if (isFirstActionForThunk) {
        debug(
          'core',
          `[MAIN_THUNK] Marking action ${actionObj.__id} as starting thunk ${parentId}`,
        );
        actionObj.__startsThunk = true;
        this.sentFirstActionForThunk.add(parentId);
      }

      // Ensure thunk is registered before enqueueing the action
      if (!thunkManager.hasThunk(parentId)) {
        debug(
          'core',
          `[MAIN_THUNK] Registering thunk ${parentId} before enqueueing action ${actionObj.__id}`,
        );
        const thunkObj = new ThunkClass({
          id: parentId,
          sourceWindowId: 0,
          source: 'main',
          keys: options?.keys,
          bypassThunkLock: options?.bypassThunkLock,
          bypassAccessControl: options?.bypassAccessControl,
        });
        await this.mainThunkRegistrationQueue.registerThunk(thunkObj);
      }
    }

    // Attach keys/force to the action for downstream processing
    if (options?.keys) actionObj.__keys = options.keys;
    if (options?.bypassThunkLock) actionObj.__bypassThunkLock = options.bypassThunkLock;
    if (options?.bypassAccessControl) actionObj.__bypassAccessControl = options.bypassAccessControl;

    // Mark as from main process (use a special source window ID for main process)
    const MAIN_PROCESS_WINDOW_ID = 0;

    // Enqueue the action through the action queue to ensure proper ordering
    debug(
      'core',
      `[MAIN_THUNK] Enqueueing action: ${actionObj.type} (${actionObj.__id}) through action queue`,
    );

    return new Promise((resolve, reject) => {
      const actionId = actionObj.__id;
      if (!actionId) {
        throw new Error('Action ID is required but not set');
      }

      // Check queue size before adding
      if (this.pendingActionPromises.size >= this.maxQueueSize) {
        const error = new QueueOverflowError(this.pendingActionPromises.size, this.maxQueueSize);
        debug('core:error', `[MAIN_THUNK] Action queue overflow: ${error.message}`);
        reject(error);
        return;
      }

      // Create a promise for this action
      this.pendingActionPromises.set(actionId, {
        resolve,
        promise: Promise.resolve(actionId),
      });

      debug(
        'core',
        `[MAIN_THUNK] Added action ${actionId} to pending queue, now pending: ${this.pendingActionPromises.size}/${this.maxQueueSize}`,
      );

      // Set up a timeout for the action
      const timeout = setTimeout(() => {
        debug(
          'core:error',
          `[MAIN_THUNK] Action ${actionId} timed out after ${this.actionCompletionTimeoutMs}ms`,
        );
        this.pendingActionPromises.delete(actionId);
        reject(new Error(`Action ${actionId} timed out`));
      }, this.actionCompletionTimeoutMs);

      // Create the completion callback that will be called when the action actually finishes
      const onComplete = () => {
        clearTimeout(timeout);
        debug('core', `[MAIN_THUNK] Action ${actionObj.__id} completed through action queue`);

        // Complete the action (this will resolve our promise)
        if (actionId) {
          this.completeAction(actionId);
        }
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
export const getMainThunkProcessor = (options?: ThunkProcessorOptions): MainThunkProcessor => {
  if (!mainThunkProcessorInstance) {
    mainThunkProcessorInstance = new MainThunkProcessor(options);
  }
  return mainThunkProcessorInstance;
};
