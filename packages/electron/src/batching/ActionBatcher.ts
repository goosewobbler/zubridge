import { debug } from '@zubridge/core';
import type { Action } from '@zubridge/types';
import type {
  BatchingConfig,
  BatchPayload,
  BatchStats,
  QueuedAction,
  SendBatchFn,
} from './types.js';

const uuidv4 = (): string => {
  return self.crypto.randomUUID();
};

export class ActionBatcher {
  private queue: QueuedAction[] = [];
  private flushTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private isFlushing = false;
  private pendingForceFlush = false;
  private stats = {
    totalBatches: 0,
    totalActions: 0,
  };

  constructor(
    private config: Required<BatchingConfig>,
    private sendBatch: SendBatchFn,
  ) {}

  enqueue(
    action: Action,
    resolve: (action: Action) => void,
    reject: (error: unknown) => void,
    priority: number,
    parentId?: string,
  ): string {
    const id = (action.__id as string) || uuidv4();

    if (this.shouldFlushNow(priority)) {
      debug('batching', `Immediate flush triggered for high-priority action ${action.type}`);
      this.queue.push({
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

    const batch = this.prepareBatch();
    const batchId = uuidv4();

    debug('batching', `Flushing batch ${batchId} with ${batch.length} actions`);

    try {
      const payload: BatchPayload = {
        batchId,
        actions: batch.map((item) => ({
          action: item.action,
          id: item.id,
          parentId: item.parentId,
        })),
      };

      this.stats.totalBatches++;
      this.stats.totalActions += batch.length;

      const ackPayload = await this.sendBatch(payload);

      const resultMap = new Map<string, { success: boolean; error?: string }>();
      if (ackPayload.results) {
        for (const result of ackPayload.results) {
          resultMap.set(result.actionId, result);
        }
      }

      for (const item of batch) {
        const result = resultMap.get(item.id);
        if (!result) {
          item.reject(new Error(`No result received for action ${item.id}`));
        } else if (!result.success) {
          item.reject(new Error(result.error || `Action ${item.id} failed`));
        } else {
          item.resolve(item.action);
        }
      }
    } catch (error) {
      debug('batching:error', `Batch ${batchId} failed:`, error);
      batch.forEach((item) => {
        item.reject(error);
      });
    } finally {
      this.isFlushing = false;

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
    };
  }

  destroy(): void {
    if (this.flushTimeoutId) {
      clearTimeout(this.flushTimeoutId);
      this.flushTimeoutId = null;
    }

    this.pendingForceFlush = false;

    this.queue.forEach((item) => {
      item.reject(new Error('ActionBatcher destroyed'));
    });
    this.queue = [];
    this.isFlushing = false;

    debug('batching', 'ActionBatcher destroyed');
  }
}

export function calculatePriority(action: Action): number {
  if (action.__bypassThunkLock) return 100;
  if (action.__thunkParentId) return 70;
  return 50;
}
