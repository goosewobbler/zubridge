import type { Action } from '@zubridge/types';

export interface BatchingConfig {
  windowMs: number;
  maxBatchSize: number;
  priorityFlushThreshold: number;
}

export const BATCHING_DEFAULTS: Required<BatchingConfig> = {
  windowMs: 16,
  maxBatchSize: 50,
  priorityFlushThreshold: 80,
};

export interface QueuedAction {
  action: Action;
  resolve: (action: Action) => void;
  reject: (error: unknown) => void;
  priority: number;
  id: string;
  parentId?: string;
}

export interface BatchPayload {
  batchId: string;
  actions: Array<{
    action: Action;
    id: string;
    parentId?: string;
  }>;
}

export interface BatchActionResult {
  actionId: string;
  success: boolean;
  error?: string;
}

export interface BatchAckPayload {
  batchId: string;
  results: BatchActionResult[];
  error?: string;
}

export interface BatchStats {
  totalBatches: number;
  totalActions: number;
  averageBatchSize: number;
  currentQueueSize: number;
  isFlushing: boolean;
}

export type SendBatchFn = (batch: BatchPayload) => Promise<BatchAckPayload>;
