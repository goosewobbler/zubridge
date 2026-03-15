import { debug } from '@zubridge/core';
import type { Action, FlushResult } from '@zubridge/types';
import type {
  BatchingConfig,
  BatchPayload,
  BatchStats,
  QueuedAction,
  SendBatchFn,
} from './types.js';
import { PRIORITY_LEVELS } from './types.js';

const uuidv4 = (): string => {
  return self.crypto.randomUUID();
};

export class ActionBatcher {
  /**
   * Hard limit for queue size to prevent DoS attacks.
   * Set to 4x maxBatchSize to allow some buffering while preventing unbounded growth.
   * If queue exceeds this limit, new actions are rejected immediately.
   */
  private readonly HARD_QUEUE_LIMIT: number;

  private queue: QueuedAction[] = [];
  private activeBatch: QueuedAction[] = [];
  private flushTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private isFlushing = false;
  private flushingPromise: Promise<void> | null = null;
  private flushResultWaiters: Set<(result: FlushResult) => void> = new Set();
  private isDestroyed = false;
  private pendingForceFlush = false;
  private stats = {
    totalBatches: 0,
    totalActions: 0,
    rejectedActions: 0,
  };

  constructor(
    private config: Required<BatchingConfig>,
    private sendBatch: SendBatchFn,
  ) {
    // Set hard limit to 4x maxBatchSize, minimum 100
    this.HARD_QUEUE_LIMIT = Math.max(this.config.maxBatchSize * 4, 100);
    debug('batching', `ActionBatcher initialized with hard queue limit: ${this.HARD_QUEUE_LIMIT}`);
  }

  enqueue(
    action: Action,
    resolve: (action: Action) => void,
    reject: (error: unknown) => void,
    priority: number,
    parentId?: string,
  ): string {
    if (this.isDestroyed) {
      reject(new Error('ActionBatcher is destroyed'));
      return '';
    }

    const id = (action.__id as string) || uuidv4();

    // Check hard queue limit BEFORE enqueueing to prevent DoS
    if (this.queue.length >= this.HARD_QUEUE_LIMIT) {
      const error = new Error(
        `ActionBatcher queue exceeded hard limit (${this.HARD_QUEUE_LIMIT}). ` +
          'This may indicate a memory leak or DoS attack. ' +
          `Current queue size: ${this.queue.length}`,
      );
      this.stats.rejectedActions++;
      debug(
        'batching:error',
        `Action ${action.type} rejected: queue at hard limit (${this.queue.length}/${this.HARD_QUEUE_LIMIT})`,
      );
      reject(error);
      return id;
    }

    if (this.shouldFlushNow(priority)) {
      debug('batching', `Immediate flush triggered for high-priority action ${action.type}`);
      // Always insert at front to guarantee inclusion in the immediate flush
      // regardless of queue depth (queue can grow up to HARD_QUEUE_LIMIT = 4 × maxBatchSize)
      //
      // Note: Using unshift means multiple concurrent high-priority actions will be
      // processed in reverse arrival order (last-arriving action processed first).
      // This is acceptable since strict FIFO ordering among simultaneous high-priority
      // actions is not required.
      this.queue.unshift({
        action,
        resolve,
        reject,
        priority,
        id,
        parentId,
      });
      if (this.isFlushing) {
        this.pendingForceFlush = true;
      } else {
        void this.flush(true);
      }
      return id;
    }

    if (this.queue.length >= this.config.maxBatchSize) {
      debug('batching', `Queue full, flushing before adding action ${action.type}`);
      if (this.isFlushing) {
        this.pendingForceFlush = true;
      } else {
        void this.flush(true);
      }
    }

    this.addToQueue(action, resolve, reject, priority, id, parentId);

    if (!this.flushTimeoutId && !this.isFlushing) {
      this.scheduleFlush();
    }

    return id;
  }

  shouldFlushNow(priority: number): boolean {
    return priority >= this.config.priorityFlushThreshold;
  }

  scheduleFlush(): void {
    if (this.flushTimeoutId) {
      return;
    }

    this.flushTimeoutId = setTimeout(() => {
      this.flushTimeoutId = null;
      if (this.queue.length > 0) {
        void this.flush();
      }
    }, this.config.windowMs);
  }

  async flush(force = false): Promise<void> {
    if (this.isFlushing) {
      debug('batching', 'Flush already in progress, deferring');
      if (force) {
        this.pendingForceFlush = true;
      }
      return;
    }

    if (this.queue.length === 0) {
      debug('batching', 'Queue empty, nothing to flush');
      return;
    }

    if (this.flushTimeoutId) {
      clearTimeout(this.flushTimeoutId);
      this.flushTimeoutId = null;
    }

    this.isFlushing = true;

    const doFlush = async () => {
      let batchId = '';
      try {
        this.activeBatch = this.prepareBatch();
        batchId = uuidv4();
        const actionIds = this.activeBatch.map((item) => item.id);

        debug('batching', `Flushing batch ${batchId} with ${this.activeBatch.length} actions`);
        const payload: BatchPayload = {
          batchId,
          actions: this.activeBatch.map((item) => ({
            action: item.action,
            id: item.id,
            parentId: item.parentId,
          })),
        };

        this.stats.totalBatches++;
        this.stats.totalActions += this.activeBatch.length;

        const ackPayload = await this.sendBatch(payload);

        // If destroyed mid-flush, skip result processing — destroy() already rejected in-flight items
        if (!this.isDestroyed) {
          const resultMap = new Map<string, { success: boolean; error?: string }>();
          if (ackPayload.results) {
            for (const result of ackPayload.results) {
              resultMap.set(result.actionId, result);
            }
          }

          for (const item of this.activeBatch) {
            const result = resultMap.get(item.id);
            if (!result) {
              item.reject(new Error(`No result received for action ${item.id}`));
            } else if (!result.success) {
              item.reject(new Error(result.error || `Action ${item.id} failed`));
            } else {
              item.resolve(item.action);
            }
          }
        }

        // Notify all waiting callers with the result
        const result: FlushResult = { batchId, actionsSent: actionIds.length, actionIds };
        for (const resolve of this.flushResultWaiters) {
          resolve(result);
        }
        this.flushResultWaiters.clear();
      } catch (error) {
        debug('batching:error', `Batch ${batchId || '<unknown>'} failed:`, error);
        if (!this.isDestroyed) {
          this.activeBatch.forEach((item) => {
            item.reject(error);
          });
        }
        const errorResult: FlushResult = { batchId, actionsSent: 0, actionIds: [] };
        for (const resolve of this.flushResultWaiters) {
          resolve(errorResult);
        }
        this.flushResultWaiters.clear();
      } finally {
        this.activeBatch = [];
        this.isFlushing = false;

        // Skip post-flush scheduling if destroyed
        if (!this.isDestroyed) {
          if (this.pendingForceFlush) {
            this.pendingForceFlush = false;
            if (this.queue.length > 0) {
              void this.flush(true);
            }
          } else if (this.queue.length > 0) {
            this.scheduleFlush();
          }
        }
      }
    };

    // Store the promise so flushWithResult can await it
    const currentFlushPromise = doFlush();
    this.flushingPromise = currentFlushPromise;
    await currentFlushPromise;
    // Only clear if no new flush has taken over the slot
    if (this.flushingPromise === currentFlushPromise) {
      this.flushingPromise = null;
    }
  }

  /**
   * Flush pending actions and return result with batch stats.
   * This is used for manual flush from thunks.
   *
   * Results are delivered exclusively via flushResultWaiters — doFlush resolves
   * all registered waiters, so there is no stale result window between
   * scheduled flushes.
   */
  async flushWithResult(force = false): Promise<FlushResult> {
    const emptyResult: FlushResult = { batchId: '', actionsSent: 0, actionIds: [] };

    // Fast exit if batcher is destroyed
    if (this.isDestroyed) {
      return emptyResult;
    }

    // If a flush is actively in progress, register to receive the result when it completes.
    // We check isFlushing (not just flushingPromise) to avoid a dead-waiter race:
    // after doFlush completes, isFlushing is false and flushResultWaiters is cleared,
    // but flushingPromise may not yet be nulled (awaiting microtask continuation in flush()).
    // Without the isFlushing guard, a caller in that window would register a waiter
    // that is never resolved.
    if (this.flushingPromise && this.isFlushing) {
      return new Promise((resolve) => {
        this.flushResultWaiters.add(resolve);
      });
    }

    if (this.queue.length === 0) {
      return emptyResult;
    }

    // Register a waiter before flushing so doFlush delivers the result to us
    const resultPromise = new Promise<FlushResult>((resolve) => {
      this.flushResultWaiters.add(resolve);
    });

    // Perform the flush
    await this.flush(force);

    return resultPromise;
  }

  // No priority sorting needed: high-priority actions (>= priorityFlushThreshold) trigger
  // an immediate flush in enqueue() and are inserted at the head of the queue with unshift,
  // so they're always at the head of a fresh batch.
  // Normal actions are processed in FIFO order within each batch window.
  private prepareBatch(): QueuedAction[] {
    const batch = this.queue.splice(0, this.config.maxBatchSize);
    return batch;
  }

  private addToQueue(
    action: Action,
    resolve: (action: Action) => void,
    reject: (error: unknown) => void,
    priority: number,
    id: string,
    parentId?: string,
  ): void {
    this.queue.push({
      action,
      resolve,
      reject,
      priority,
      id,
      parentId,
    });

    debug('batching', `Added action ${action.type} to queue (size: ${this.queue.length})`);
  }

  removeAction(actionId: string): boolean {
    const index = this.queue.findIndex((item) => item.id === actionId);
    if (index !== -1) {
      const removed = this.queue.splice(index, 1)[0];
      removed.reject(new Error(`Action ${actionId} was cancelled`));
      debug('batching', `Removed action ${actionId} from queue`);
      return true;
    }
    return false;
  }

  getStats(): BatchStats {
    return {
      totalBatches: this.stats.totalBatches,
      totalActions: this.stats.totalActions,
      averageBatchSize:
        this.stats.totalBatches > 0 ? this.stats.totalActions / this.stats.totalBatches : 0,
      currentQueueSize: this.queue.length,
      isFlushing: this.isFlushing,
      rejectedActions: this.stats.rejectedActions,
      queueLimit: this.HARD_QUEUE_LIMIT,
    };
  }

  destroy(): void {
    this.isDestroyed = true;

    if (this.flushTimeoutId) {
      clearTimeout(this.flushTimeoutId);
      this.flushTimeoutId = null;
    }

    this.pendingForceFlush = false;

    // Reject queued items not yet flushed
    this.queue.forEach((item) => {
      item.reject(new Error('ActionBatcher destroyed'));
    });
    this.queue = [];

    // Reject in-flight items that were removed from the queue by prepareBatch()
    // but are still awaiting sendBatch completion
    this.activeBatch.forEach((item) => {
      item.reject(new Error('ActionBatcher destroyed'));
    });
    this.activeBatch = [];

    const emptyResult: FlushResult = { batchId: '', actionsSent: 0, actionIds: [] };
    for (const resolve of this.flushResultWaiters) {
      resolve(emptyResult);
    }
    this.flushResultWaiters.clear();

    debug('batching', 'ActionBatcher destroyed');
  }
}

/**
 * Calculate the priority for an action based on its flags.
 * Uses centralized PRIORITY_LEVELS constants for consistency across the system.
 *
 * Priority rules:
 * - Actions with __immediate get IMMEDIATE priority (100)
 * - Actions with __thunkParentId get ROOT_THUNK_ACTION priority (70)
 * - All other actions get NORMAL_THUNK_ACTION priority (50)
 *
 * Note: This function is used in the renderer process (ActionBatcher).
 * The renderer does not have access to the active root thunk context;
 * without __thunkParentId on the action, all renderer thunk actions
 * default to NORMAL_THUNK_ACTION priority (50).
 * The main process (ActionScheduler) distinguishes between root and
 * nested thunks, assigning NORMAL_THUNK_ACTION (50) to non-root thunks.
 */
export function calculatePriority(action: Action): number {
  if (action.__immediate) return PRIORITY_LEVELS.IMMEDIATE;
  if (action.__thunkParentId) return PRIORITY_LEVELS.ROOT_THUNK_ACTION;
  return PRIORITY_LEVELS.NORMAL_THUNK_ACTION;
}
