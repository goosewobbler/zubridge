import { debug } from '@zubridge/core';
import type { Action } from '@zubridge/types';
import { v4 as uuidv4 } from 'uuid';
import { QueueOverflowError } from '../../types/errors.js';
import type { ThunkProcessorOptions } from '../../types/thunk.js';

/**
 * Base class for thunk processors that handles common functionality
 * like action completion tracking, timeouts, and queue management
 */
export abstract class BaseThunkProcessor {
  // Configuration options
  protected actionCompletionTimeoutMs: number;
  protected maxQueueSize: number;

  // Action completion tracking
  protected actionCompletionCallbacks = new Map<string, (result: unknown) => void>();
  protected actionTimeouts = new Map<string, NodeJS.Timeout>();

  constructor(
    options: Required<ThunkProcessorOptions>,
    protected logPrefix: string,
  ) {
    this.actionCompletionTimeoutMs = options.actionCompletionTimeoutMs;
    this.maxQueueSize = options.maxQueueSize;
    debug(
      'core',
      `[${this.logPrefix}] Initialized with timeout: ${this.actionCompletionTimeoutMs}ms, maxQueueSize: ${this.maxQueueSize}`,
    );
  }

  /**
   * Generate a unique action ID if one doesn't exist
   */
  protected ensureActionId(action: Action | string, payload?: unknown): Action {
    const actionObj: Action =
      typeof action === 'string'
        ? { type: action, payload, __id: uuidv4() }
        : { ...action, __id: action.__id || uuidv4() };

    if (!actionObj.__id) {
      actionObj.__id = uuidv4();
    }

    return actionObj;
  }

  /**
   * Check if queue has capacity and throw QueueOverflowError if not
   */
  protected checkQueueCapacity(currentSize: number): void {
    if (currentSize >= this.maxQueueSize) {
      const error = new QueueOverflowError(currentSize, this.maxQueueSize);
      debug('core:error', `[${this.logPrefix}] Queue overflow: ${error.message}`);
      throw error;
    }
  }

  /**
   * Set up action completion tracking with timeout
   */
  protected setupActionCompletion(
    actionId: string,
    callback: (result: unknown) => void,
    timeoutCallback?: () => void,
  ): void {
    // Store the completion callback
    this.actionCompletionCallbacks.set(actionId, callback);
    debug('core', `[${this.logPrefix}] Set completion callback for action ${actionId}`);

    // Set up safety timeout
    const safetyTimeout = setTimeout(() => {
      if (this.actionCompletionCallbacks.has(actionId)) {
        debug(
          'core',
          `[${this.logPrefix}] Safety timeout triggered for action ${actionId} after ${this.actionCompletionTimeoutMs}ms`,
        );
        if (timeoutCallback) {
          timeoutCallback();
        } else {
          // Default timeout behavior - complete with timeout indicator
          this.completeActionInternal(actionId, { __timeout: true });
        }
      }
    }, this.actionCompletionTimeoutMs);

    // Store timeout for cleanup
    this.actionTimeouts.set(actionId, safetyTimeout);
  }

  /**
   * Complete an action and call its callback
   */
  protected completeActionInternal(actionId: string, result: unknown): boolean {
    const callback = this.actionCompletionCallbacks.get(actionId);
    if (!callback) {
      debug('core', `[${this.logPrefix}] No completion callback found for action ${actionId}`);
      return false;
    }

    // Clear timeout
    const timeout = this.actionTimeouts.get(actionId);
    if (timeout) {
      clearTimeout(timeout);
      this.actionTimeouts.delete(actionId);
    }

    // Log result for debugging
    try {
      debug('core', `[${this.logPrefix}] Action ${actionId} result: ${JSON.stringify(result)}`);
    } catch {
      debug('core', `[${this.logPrefix}] Action ${actionId} result: [Non-serializable result]`);
    }

    // Execute callback
    try {
      callback(result);
      debug('core', `[${this.logPrefix}] Completion callback executed for action ${actionId}`);
    } catch (callbackError) {
      debug(
        'core:error',
        `[${this.logPrefix}] Error in completion callback for action ${actionId}: ${callbackError}`,
      );
    }

    // Cleanup callback
    this.actionCompletionCallbacks.delete(actionId);
    return true;
  }

  /**
   * Handle action completion with error checking
   */
  public completeAction(actionId: string, result: unknown): void {
    debug('core', `[${this.logPrefix}] Action completed: ${actionId}`);

    // Check for errors in the result
    const { error: errorString } = result as { error: string };
    if (errorString) {
      debug(
        'core:error',
        `[${this.logPrefix}] Action ${actionId} completed with error: ${errorString}`,
      );
    }

    this.completeActionInternal(actionId, result);
  }

  /**
   * Force cleanup of expired actions and timeouts
   * This prevents memory leaks from stale actions
   */
  public forceCleanupExpiredActions(): void {
    debug('core', `[${this.logPrefix}] Force cleaning up expired actions and timeouts`);

    // Clear all timeouts
    for (const [actionId, timeout] of this.actionTimeouts) {
      debug('core', `[${this.logPrefix}] Force clearing timeout for action ${actionId}`);
      clearTimeout(timeout);
    }

    const clearedTimeouts = this.actionTimeouts.size;
    const clearedCallbacks = this.actionCompletionCallbacks.size;

    // Clear maps
    this.actionTimeouts.clear();
    this.actionCompletionCallbacks.clear();

    debug(
      'core',
      `[${this.logPrefix}] Force cleaned up ${clearedTimeouts} timeouts, ${clearedCallbacks} callbacks`,
    );
  }

  /**
   * Test method to check queue capacity (for testing purposes)
   */
  public testCheckQueueCapacity(currentSize: number): void {
    this.checkQueueCapacity(currentSize);
  }

  /**
   * Destroy and cleanup all resources
   */
  public destroy(): void {
    debug('core', `[${this.logPrefix}] Destroying processor instance`);
    this.forceCleanupExpiredActions();
    debug('core', `[${this.logPrefix}] Processor instance destroyed`);
  }
}
