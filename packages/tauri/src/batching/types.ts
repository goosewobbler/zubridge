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
  rejectedActions: number;
  queueLimit: number;
}

export type SendBatchFn = (batch: BatchPayload) => Promise<BatchAckPayload>;

/**
 * Priority levels for action scheduling and batching.
 * Higher values indicate higher priority.
 *
 * Priority assignment rules:
 * - IMMEDIATE (100): Actions with __immediate flag, always execute immediately
 * - ROOT_THUNK_ACTION (70): Actions belonging to the active root thunk
 * - NORMAL_THUNK_ACTION (50): Regular thunk-dispatched actions (renderer default)
 * - NORMAL_ACTION (0): Regular actions without special flags (main process default)
 *
 * Note: ActionBatcher (renderer) uses NORMAL_THUNK_ACTION as default,
 * while ActionScheduler (main) uses NORMAL_ACTION. This distinction
 * allows different priority handling in renderer vs main process.
 */
export const PRIORITY_LEVELS = {
  /** Immediate actions - highest priority, skip all queues */
  IMMEDIATE: 100,
  /** Actions belonging to the active root thunk - high priority */
  ROOT_THUNK_ACTION: 70,
  /** Regular thunk-dispatched actions - medium priority */
  NORMAL_THUNK_ACTION: 50,
  /** Regular actions without special flags - lowest priority */
  NORMAL_ACTION: 0,
} as const;
