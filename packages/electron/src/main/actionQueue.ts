import type { Action as BaseAction } from '@zubridge/types';
import { debug } from '@zubridge/core';
import { ThunkManager, ThunkManagerEvent, getThunkManager } from '../lib/ThunkManager.js';
import { getThunkLockManager } from '../lib/ThunkLockManager.js';
import { ThunkRegistrationQueue } from '../lib/ThunkRegistrationQueue.js';

// Extend the base Action type with our additional fields
interface Action extends BaseAction {
  __sourceWindowId?: number; // ID of the window that dispatched this action
  __thunkParentId?: string; // Parent thunk ID if this action is part of a thunk
  __requiresWindowSync?: boolean; // Flag indicating extra sync delay needed
  __startsThunk?: boolean; // Indicates if this action should start a new thunk tree
}

/**
 * Information about a pending action in the main process queue
 */
interface QueuedAction {
  /** The action to process */
  action: Action;
  /** The window ID that sent this action */
  sourceWindowId: number;
  /** Time the action was received */
  receivedTime: number;
  /** Optional callback when action is completed */
  onComplete?: () => void;
}

/**
 * Manages a central action queue in the main process
 * This ensures proper ordering of actions across windows
 */
export class ActionQueueManager {
  // Queue of actions waiting to be processed
  private actionQueue: QueuedAction[] = [];

  // Action processor function (set externally)
  private actionProcessor?: (action: Action) => Promise<any>;

  // Function to broadcast thunk state (set externally)
  private thunkStateBroadcaster?: (
    version: number,
    thunks: Array<{ id: string; windowId: number; parentId?: string }>,
  ) => void;

  // Thunk manager
  private thunkManager: ThunkManager;

  // Thunk registration queue (now extracted)
  private thunkRegistrationQueue: ThunkRegistrationQueue;

  constructor() {
    debug('queue', 'Main action queue manager initialized');

    // Get the global thunk manager
    this.thunkManager = getThunkManager();

    // Create the extracted thunk registration queue
    this.thunkRegistrationQueue = new ThunkRegistrationQueue(this.thunkManager);

    // Subscribe to thunk completion events to trigger queue processing
    this.thunkManager.on(ThunkManagerEvent.ROOT_THUNK_COMPLETED, (rootThunkId: string) => {
      debug('queue', `Root thunk ${rootThunkId} completed, processing queue`);
      setTimeout(() => this.processQueue(), 50);
      setTimeout(() => this.thunkRegistrationQueue.processNextThunkRegistration(), 50);
    });
    // Also subscribe to lock release events for robustness
    getThunkLockManager().on('lock:released', () => {
      setTimeout(() => this.thunkRegistrationQueue.processNextThunkRegistration(), 10);
    });
  }

  /**
   * Set the action processor function
   */
  public setActionProcessor(processor: (action: Action) => Promise<any>): void {
    debug('queue', 'Setting action processor');
    this.actionProcessor = processor;
  }

  /**
   * Set the function to broadcast thunk state to renderers
   */
  public setThunkStateBroadcaster(
    broadcaster: (version: number, thunks: Array<{ id: string; windowId: number; parentId?: string }>) => void,
  ): void {
    debug('queue', 'Setting thunk state broadcaster');
    this.thunkStateBroadcaster = broadcaster;
  }

  /**
   * Get the current thunk state
   */
  public getThunkState(): { version: number; thunks: Array<{ id: string; windowId: number; parentId?: string }> } {
    return this.thunkManager.getActiveThunksSummary();
  }

  /**
   * Centralized thunk registration entry point for both main and renderer thunks
   * Returns a promise that resolves when the thunk is registered and started
   */
  public registerThunkQueued(
    thunkId: string,
    windowId: number,
    parentId: string | undefined,
    thunkType: 'main' | 'renderer',
    mainThunkCallback?: () => Promise<any>,
    rendererCallback?: () => void,
  ): Promise<any> {
    return this.thunkRegistrationQueue.registerThunkQueued(
      thunkId,
      windowId,
      parentId,
      thunkType,
      mainThunkCallback,
      rendererCallback,
    );
  }

  /**
   * Find the index of the next action that can be processed
   */
  private findProcessableActionIndex(): number {
    const thunkLockManager = getThunkLockManager();

    for (let i = 0; i < this.actionQueue.length; i++) {
      const queuedAction = this.actionQueue[i];
      const action = queuedAction.action;
      const sourceWindowId = queuedAction.sourceWindowId;

      // Use ThunkLockManager for consistency
      if (thunkLockManager.canProcessAction(action, sourceWindowId)) {
        return i;
      }
    }

    return -1; // No processable action found
  }

  /**
   * Process the next action in the queue
   */
  private async processNextAction(): Promise<void> {
    if (!this.actionProcessor || this.actionQueue.length === 0) {
      return;
    }

    const actionIndex = this.findProcessableActionIndex();
    if (actionIndex === -1) {
      return;
    }

    const queuedAction = this.actionQueue[actionIndex];
    const action = queuedAction.action;
    const sourceWindowId = queuedAction.sourceWindowId;

    // Remove the processed action from the queue before processing
    // to avoid double-processing if the processor completes synchronously
    this.actionQueue.splice(actionIndex, 1);

    debug(
      'queue',
      `Processing action: ${action.type} (id: ${action.id}) from window ${sourceWindowId}${
        action.__thunkParentId ? `, parent thunk: ${action.__thunkParentId}` : ''
      }`,
    );

    try {
      // Update thunk state before processing if this is a thunk action
      if (action.__thunkParentId) {
        this.thunkManager.processThunkAction(action, sourceWindowId);
      }

      // Process the action
      await this.actionProcessor(action);
      debug('queue', `Action ${action.type} processed successfully`);

      // If this action required window sync, add a small delay to ensure state propagation
      if (action.__requiresWindowSync) {
        debug('queue', `Action ${action.type} required window sync, adding delay for state propagation`);
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      // Update thunk state after processing if this is a thunk action
      if (action.__thunkParentId) {
        this.thunkManager.processThunkAction(action, sourceWindowId);
      }

      queuedAction.onComplete?.();
    } catch (error) {
      debug('queue:error', `Error processing action ${action.type}: ${error as string}`);
    }

    // Process the next action in the queue
    this.processQueue();
  }

  /**
   * Enqueue an action for processing
   */
  public enqueueAction(action: Action, sourceWindowId: number, parentThunkId?: string, onComplete?: () => void): void {
    if (parentThunkId) {
      action.__thunkParentId = parentThunkId;

      // Ensure thunk is registered if not already
      if (!this.thunkManager.hasThunk(parentThunkId)) {
        debug(
          'queue',
          `Warning: thunk ${parentThunkId} not registered when enqueueing action from window ${sourceWindowId}`,
        );
        // No auto-registration; just warn
      }
    }

    action.__sourceWindowId = sourceWindowId; // Ensure sourceWindowId is on the action itself

    debug(
      'queue',
      `Enqueueing action: ${action.type} (id: ${action.id}) from window ${sourceWindowId}${
        parentThunkId ? `, parent thunk: ${parentThunkId}` : ''
      }`,
    );

    this.actionQueue.push({
      action,
      sourceWindowId,
      receivedTime: Date.now(),
      onComplete, // Pass through the completion callback
    });

    this.processQueue();
  }

  /**
   * Process the action queue
   */
  private processQueue(): void {
    if (this.processing || this.actionQueue.length === 0 || !this.actionProcessor) {
      return;
    }

    this.processing = true;

    // Check if we can process the next action based on thunk rules
    const nextActionIndex = this.findProcessableActionIndex();
    if (nextActionIndex === -1) {
      debug('queue', `No processable actions in queue of ${this.actionQueue.length} actions`);
      this.processing = false;
      return;
    }

    // Process the next action
    this.processNextAction()
      .catch((error) => {
        debug('queue:error', `Error in processNextAction: ${error as string}`);
      })
      .finally(() => {
        this.processing = false;
      });
  }

  private processing = false; // Re-entrancy guard for processQueue
}

/**
 * Determine if an action represents a thunk start
 */
function isThunkStartAction(action: Action): boolean {
  return !!action.__startsThunk;
}

export const actionQueue = new ActionQueueManager();
