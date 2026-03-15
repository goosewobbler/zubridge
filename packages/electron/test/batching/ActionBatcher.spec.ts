import type { Action } from '@zubridge/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ActionBatcher, calculatePriority } from '../../src/batching/ActionBatcher.js';
import type { BatchAckPayload, BatchPayload } from '../../src/batching/types.js';
import { BATCHING_DEFAULTS } from '../../src/batching/types.js';

vi.mock('@zubridge/core', () => ({
  debug: vi.fn(),
}));

const createMockSendBatch = () =>
  vi.fn().mockImplementation(async (payload: BatchPayload) => ({
    batchId: payload.batchId,
    results: payload.actions.map((a) => ({ actionId: a.id, success: true })),
  }));

const createTestAction = (type: string, overrides: Partial<Action> = {}): Action => ({
  type,
  __id: self.crypto.randomUUID(),
  ...overrides,
});

describe('ActionBatcher', () => {
  let batcher: ActionBatcher;
  let mockSendBatch: ReturnType<typeof createMockSendBatch>;

  beforeEach(() => {
    vi.useFakeTimers();
    mockSendBatch = createMockSendBatch();
    batcher = new ActionBatcher(BATCHING_DEFAULTS, mockSendBatch);
  });

  afterEach(() => {
    batcher.destroy();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with config', () => {
      const stats = batcher.getStats();
      expect(stats.totalBatches).toBe(0);
      expect(stats.totalActions).toBe(0);
      expect(stats.currentQueueSize).toBe(0);
      expect(stats.isFlushing).toBe(false);
    });
  });

  describe('enqueue', () => {
    it('should add action to queue', () => {
      const action = createTestAction('TEST_ACTION');
      let resolveCalled = false;

      batcher.enqueue(
        action,
        () => {
          resolveCalled = true;
        },
        () => {},
        50,
      );

      const stats = batcher.getStats();
      expect(stats.currentQueueSize).toBe(1);
      expect(resolveCalled).toBe(false);
    });

    it('should schedule flush after enqueue', () => {
      const action = createTestAction('TEST_ACTION');

      batcher.enqueue(
        action,
        () => {},
        () => {},
        50,
      );

      expect(mockSendBatch).not.toHaveBeenCalled();

      vi.advanceTimersByTime(BATCHING_DEFAULTS.windowMs);

      expect(mockSendBatch).toHaveBeenCalledTimes(1);
    });

    it('should batch multiple actions', async () => {
      const actions = [
        createTestAction('ACTION_1'),
        createTestAction('ACTION_2'),
        createTestAction('ACTION_3'),
      ];

      actions.forEach((action) => {
        batcher.enqueue(
          action,
          () => {},
          () => {},
          50,
        );
      });

      vi.advanceTimersByTime(BATCHING_DEFAULTS.windowMs);
      await vi.runAllTimersAsync();

      expect(mockSendBatch).toHaveBeenCalledTimes(1);
      const batchArg = mockSendBatch.mock.calls[0][0];
      expect(batchArg.actions).toHaveLength(3);
    });
  });

  describe('high-priority flush', () => {
    it('should immediately flush for high-priority actions', async () => {
      const normalAction = createTestAction('NORMAL_ACTION');
      batcher.enqueue(
        normalAction,
        () => {},
        () => {},
        50,
      );

      const highPriorityAction = createTestAction('HIGH_PRIORITY');
      batcher.enqueue(
        highPriorityAction,
        () => {},
        () => {},
        100,
      );

      await vi.runAllTimersAsync();

      expect(mockSendBatch).toHaveBeenCalledTimes(1);
      const batchArg = mockSendBatch.mock.calls[0][0];
      expect(batchArg.actions).toHaveLength(2);
    });

    it('should flush when priority meets threshold', async () => {
      const config = { ...BATCHING_DEFAULTS, priorityFlushThreshold: 80 };
      batcher.destroy();
      batcher = new ActionBatcher(config, mockSendBatch);

      batcher.enqueue(
        createTestAction('ACTION_1'),
        () => {},
        () => {},
        50,
      );
      batcher.enqueue(
        createTestAction('ACTION_2'),
        () => {},
        () => {},
        80,
      );

      await vi.runAllTimersAsync();

      expect(mockSendBatch).toHaveBeenCalledTimes(1);
    });
  });

  describe('max batch size', () => {
    it('should flush when max batch size reached', async () => {
      const config = { ...BATCHING_DEFAULTS, maxBatchSize: 3 };
      batcher.destroy();
      batcher = new ActionBatcher(config, mockSendBatch);

      for (let i = 0; i < 4; i++) {
        batcher.enqueue(
          createTestAction(`ACTION_${i}`),
          () => {},
          () => {},
          50,
        );
      }

      await vi.runAllTimersAsync();

      expect(mockSendBatch).toHaveBeenCalledTimes(2);
      expect(mockSendBatch.mock.calls[0][0].actions).toHaveLength(3);
      expect(mockSendBatch.mock.calls[1][0].actions).toHaveLength(1);
    });
  });

  describe('flush', () => {
    it('should resolve all promises on successful batch', async () => {
      const resolves: boolean[] = [];

      batcher.enqueue(
        createTestAction('ACTION_1'),
        () => {
          resolves.push(true);
        },
        () => {},
        50,
      );
      batcher.enqueue(
        createTestAction('ACTION_2'),
        () => {
          resolves.push(true);
        },
        () => {},
        50,
      );

      vi.advanceTimersByTime(BATCHING_DEFAULTS.windowMs);
      await vi.runAllTimersAsync();

      expect(resolves).toHaveLength(2);
    });

    it('should reject all promises on batch error', async () => {
      mockSendBatch.mockRejectedValue(new Error('Batch failed'));
      const rejects: Error[] = [];

      batcher.enqueue(
        createTestAction('ACTION_1'),
        () => {},
        (err) => {
          rejects.push(err as Error);
        },
        50,
      );
      batcher.enqueue(
        createTestAction('ACTION_2'),
        () => {},
        (err) => {
          rejects.push(err as Error);
        },
        50,
      );

      vi.advanceTimersByTime(BATCHING_DEFAULTS.windowMs);
      await vi.runAllTimersAsync();

      expect(rejects).toHaveLength(2);
      expect(rejects[0].message).toBe('Batch failed');
    });

    it('should handle empty queue gracefully', async () => {
      await batcher.flush();
      expect(mockSendBatch).not.toHaveBeenCalled();
    });

    it('should resolve and reject actions individually based on per-action results', async () => {
      const action1 = createTestAction('ACTION_1');
      const action2 = createTestAction('ACTION_2');
      const action3 = createTestAction('ACTION_3');

      mockSendBatch.mockImplementation(async (payload: BatchPayload) => ({
        batchId: payload.batchId,
        results: payload.actions.map((a) => {
          if (a.action.type === 'ACTION_2') {
            return { actionId: a.id, success: false, error: 'Action 2 failed' };
          }
          return { actionId: a.id, success: true };
        }),
      }));

      const resolved: string[] = [];
      const rejected: { type: string; error: string }[] = [];

      batcher.enqueue(
        action1,
        (action) => {
          resolved.push(action.type);
        },
        (err) => {
          rejected.push({ type: 'ACTION_1', error: (err as Error).message });
        },
        50,
      );
      batcher.enqueue(
        action2,
        (action) => {
          resolved.push(action.type);
        },
        (err) => {
          rejected.push({ type: 'ACTION_2', error: (err as Error).message });
        },
        50,
      );
      batcher.enqueue(
        action3,
        (action) => {
          resolved.push(action.type);
        },
        (err) => {
          rejected.push({ type: 'ACTION_3', error: (err as Error).message });
        },
        50,
      );

      vi.advanceTimersByTime(BATCHING_DEFAULTS.windowMs);
      await vi.runAllTimersAsync();

      expect(resolved).toEqual(['ACTION_1', 'ACTION_3']);
      expect(rejected).toHaveLength(1);
      expect(rejected[0].type).toBe('ACTION_2');
      expect(rejected[0].error).toBe('Action 2 failed');
    });

    it('should reject actions with no result entry as protocol error', async () => {
      const action1 = createTestAction('ACTION_1');
      const action2 = createTestAction('ACTION_2');

      mockSendBatch.mockImplementation(async (payload: BatchPayload) => ({
        batchId: payload.batchId,
        // Only return a result for the first action, omit the second
        results: [{ actionId: payload.actions[0].id, success: true }],
      }));

      const resolved: string[] = [];
      const rejected: string[] = [];

      batcher.enqueue(
        action1,
        (action) => {
          resolved.push(action.type);
        },
        (err) => {
          rejected.push((err as Error).message);
        },
        50,
      );
      batcher.enqueue(
        action2,
        (action) => {
          resolved.push(action.type);
        },
        (err) => {
          rejected.push((err as Error).message);
        },
        50,
      );

      vi.advanceTimersByTime(BATCHING_DEFAULTS.windowMs);
      await vi.runAllTimersAsync();

      expect(resolved).toEqual(['ACTION_1']);
      expect(rejected).toHaveLength(1);
      expect(rejected[0]).toContain('No result received');
    });
  });

  describe('removeAction', () => {
    it('should remove action from queue', () => {
      const action = createTestAction('TEST_ACTION');

      batcher.enqueue(
        action,
        () => {},
        () => {},
        50,
      );

      expect(batcher.getStats().currentQueueSize).toBe(1);

      const removed = batcher.removeAction(action.__id as string);

      expect(removed).toBe(true);
      expect(batcher.getStats().currentQueueSize).toBe(0);
    });

    it('should reject removed action', () => {
      const action = createTestAction('TEST_ACTION');
      let rejected = false;
      let rejectError: Error | undefined;

      batcher.enqueue(
        action,
        () => {},
        (err) => {
          rejected = true;
          rejectError = err as Error;
        },
        50,
      );

      batcher.removeAction(action.__id as string);

      expect(rejected).toBe(true);
      expect(rejectError).toBeInstanceOf(Error);
      expect((rejectError as Error).message).toContain('cancelled');
    });

    it('should return false for non-existent action', () => {
      const removed = batcher.removeAction('non-existent-id');
      expect(removed).toBe(false);
    });
  });

  describe('getStats', () => {
    it('should track batch statistics', async () => {
      batcher.enqueue(
        createTestAction('ACTION_1'),
        () => {},
        () => {},
        50,
      );
      batcher.enqueue(
        createTestAction('ACTION_2'),
        () => {},
        () => {},
        50,
      );

      vi.advanceTimersByTime(BATCHING_DEFAULTS.windowMs);
      await vi.runAllTimersAsync();

      const stats = batcher.getStats();
      expect(stats.totalBatches).toBe(1);
      expect(stats.totalActions).toBe(2);
      expect(stats.averageBatchSize).toBe(2);
    });
  });

  describe('destroy', () => {
    it('should reject all pending actions', () => {
      const rejects: Error[] = [];

      batcher.enqueue(
        createTestAction('ACTION_1'),
        () => {},
        (err) => {
          rejects.push(err as Error);
        },
        50,
      );
      batcher.enqueue(
        createTestAction('ACTION_2'),
        () => {},
        (err) => {
          rejects.push(err as Error);
        },
        50,
      );

      batcher.destroy();

      expect(rejects).toHaveLength(2);
      expect(batcher.getStats().currentQueueSize).toBe(0);
    });

    it('should clear scheduled flush', () => {
      batcher.enqueue(
        createTestAction('ACTION_1'),
        () => {},
        () => {},
        50,
      );
      batcher.destroy();

      vi.advanceTimersByTime(BATCHING_DEFAULTS.windowMs);

      expect(mockSendBatch).not.toHaveBeenCalled();
    });

    it('should reject enqueue calls after destroy', () => {
      batcher.destroy();

      let rejected = false;
      let rejectError: Error | undefined;

      const id = batcher.enqueue(
        createTestAction('LATE_ACTION'),
        () => {},
        (err) => {
          rejected = true;
          rejectError = err as Error;
        },
        50,
      );

      expect(rejected).toBe(true);
      expect(rejectError?.message).toContain('destroyed');
      expect(id).toBe('');
      expect(batcher.getStats().currentQueueSize).toBe(0);
    });

    it('should not double-reject in-flight batch items when sendBatch resolves after destroy', async () => {
      let resolveSendBatch: (() => void) | undefined;
      mockSendBatch.mockImplementation(
        (payload: BatchPayload) =>
          new Promise<BatchAckPayload>((resolve) => {
            resolveSendBatch = () =>
              resolve({
                batchId: payload.batchId,
                results: payload.actions.map((a) => ({
                  actionId: a.id,
                  success: true,
                })),
              });
          }),
      );

      const rejectCalls: string[] = [];
      const resolveCalls: string[] = [];

      batcher.enqueue(
        createTestAction('IN_FLIGHT'),
        (action) => {
          resolveCalls.push(action.type);
        },
        (err) => {
          rejectCalls.push((err as Error).message);
        },
        50,
      );

      // Start the flush
      vi.advanceTimersByTime(BATCHING_DEFAULTS.windowMs);
      expect(batcher.getStats().isFlushing).toBe(true);

      // Destroy while sendBatch is in-flight
      batcher.destroy();

      // sendBatch resolves after destroy — should NOT call resolve/reject on batch items
      resolveSendBatch?.();
      await vi.runAllTimersAsync();

      // flush's result processing is skipped because isDestroyed is true
      expect(resolveCalls).toHaveLength(0);
      expect(rejectCalls).toHaveLength(0);
    });

    it('should not double-reject in-flight batch items when sendBatch rejects after destroy', async () => {
      let rejectSendBatch: (() => void) | undefined;
      mockSendBatch.mockImplementation(
        () =>
          new Promise<BatchAckPayload>((_resolve, reject) => {
            rejectSendBatch = () => reject(new Error('Network error'));
          }),
      );

      const rejectCalls: string[] = [];

      batcher.enqueue(
        createTestAction('IN_FLIGHT'),
        () => {},
        (err) => {
          rejectCalls.push((err as Error).message);
        },
        50,
      );

      vi.advanceTimersByTime(BATCHING_DEFAULTS.windowMs);
      expect(batcher.getStats().isFlushing).toBe(true);

      batcher.destroy();

      // sendBatch rejects after destroy — should not call reject on batch items
      rejectSendBatch?.();
      await vi.runAllTimersAsync();

      expect(rejectCalls).toHaveLength(0);
    });

    it('should not schedule new flushes after destroy', async () => {
      let resolveSendBatch: (() => void) | undefined;
      mockSendBatch.mockImplementation(
        (payload: BatchPayload) =>
          new Promise<BatchAckPayload>((resolve) => {
            resolveSendBatch = () =>
              resolve({
                batchId: payload.batchId,
                results: payload.actions.map((a) => ({
                  actionId: a.id,
                  success: true,
                })),
              });
          }),
      );

      // Enqueue and start flushing first batch
      batcher.enqueue(
        createTestAction('BATCH_1'),
        () => {},
        () => {},
        50,
      );
      vi.advanceTimersByTime(BATCHING_DEFAULTS.windowMs);

      // Enqueue more while flushing — these go into the queue
      batcher.enqueue(
        createTestAction('BATCH_2'),
        () => {},
        () => {},
        50,
      );

      // Destroy while flush is active and queue has items
      batcher.destroy();

      // Resolve the in-flight batch — normally this would trigger a follow-up flush
      resolveSendBatch?.();
      await vi.runAllTimersAsync();

      // sendBatch should only have been called once — no follow-up flush after destroy
      expect(mockSendBatch).toHaveBeenCalledTimes(1);
    });

    it('should resolve flushResultWaiters on destroy', async () => {
      vi.useRealTimers();
      try {
        batcher.enqueue(
          createTestAction('ACTION_1'),
          () => {},
          () => {},
          50,
        );

        // Start a flush - this registers a waiter since flush is in progress
        const flushPromise = batcher.flushWithResult(true);

        // While flush is in progress, call destroy
        batcher.destroy();

        // flushWithResult should resolve (not hang), either with result or empty due to destroy
        const result = await flushPromise;
        // Result should have batchId set (either from successful flush or empty from destroy)
        expect(result.batchId).toBeDefined();
      } finally {
        vi.useFakeTimers();
      }
    });
  });

  describe('shouldFlushNow', () => {
    it('should return true for priority >= threshold', () => {
      expect(batcher.shouldFlushNow(80)).toBe(true);
      expect(batcher.shouldFlushNow(100)).toBe(true);
    });

    it('should return false for priority < threshold', () => {
      expect(batcher.shouldFlushNow(50)).toBe(false);
      expect(batcher.shouldFlushNow(79)).toBe(false);
    });
  });

  describe('flush ordering', () => {
    it('should not create concurrent flushes when high-priority action arrives during active flush', async () => {
      let resolveSendBatch: (() => void) | undefined;
      const sendBatchCalls: BatchPayload[] = [];

      mockSendBatch.mockImplementation(
        (payload: BatchPayload) =>
          new Promise<BatchAckPayload>((resolve) => {
            sendBatchCalls.push(payload);
            resolveSendBatch = () =>
              resolve({
                batchId: payload.batchId,
                results: payload.actions.map((a) => ({
                  actionId: a.id,
                  success: true,
                })),
              });
          }),
      );

      batcher.enqueue(
        createTestAction('NORMAL_1'),
        () => {},
        () => {},
        50,
      );

      vi.advanceTimersByTime(BATCHING_DEFAULTS.windowMs);

      expect(batcher.getStats().isFlushing).toBe(true);
      expect(sendBatchCalls).toHaveLength(1);

      batcher.enqueue(
        createTestAction('HIGH_PRIORITY'),
        () => {},
        () => {},
        100,
      );

      expect(sendBatchCalls).toHaveLength(1);

      resolveSendBatch?.();
      await vi.runAllTimersAsync();

      expect(sendBatchCalls).toHaveLength(2);
      expect(sendBatchCalls[1].actions[0].action.type).toBe('HIGH_PRIORITY');
    });
  });

  describe('flushWithResult', () => {
    it('should return FlushResult with batch stats', async () => {
      const actions = [
        createTestAction('ACTION_1'),
        createTestAction('ACTION_2'),
        createTestAction('ACTION_3'),
      ];

      actions.forEach((action) => {
        batcher.enqueue(
          action,
          () => {},
          () => {},
          50,
        );
      });

      const result = await batcher.flushWithResult(true);

      expect(result.actionsSent).toBe(3);
      expect(result.batchId).toBeDefined();
      expect(result.actionIds).toHaveLength(3);
      expect(result.actionIds).toContain(actions[0].__id);
      expect(result.actionIds).toContain(actions[1].__id);
      expect(result.actionIds).toContain(actions[2].__id);
    });

    it('should return empty result when queue is empty', async () => {
      const result = await batcher.flushWithResult(true);

      expect(result.actionsSent).toBe(0);
      expect(result.batchId).toBe('');
      expect(result.actionIds).toHaveLength(0);
    });

    it('should force flush when force=true', async () => {
      batcher.enqueue(
        createTestAction('ACTION_1'),
        () => {},
        () => {},
        50,
      );

      // Don't advance timers - flushWithResult with force should still flush
      const result = await batcher.flushWithResult(true);

      expect(result.actionsSent).toBe(1);
      expect(mockSendBatch).toHaveBeenCalledTimes(1);
    });

    it('should return result with zero actions on batch failure', async () => {
      mockSendBatch.mockRejectedValue(new Error('Batch failed'));

      batcher.enqueue(
        createTestAction('ACTION_1'),
        () => {},
        () => {},
        50,
      );

      const result = await batcher.flushWithResult(true);

      expect(result.actionsSent).toBe(0);
      expect(result.actionIds).toHaveLength(0);
    });

    it('should return result to all concurrent callers', async () => {
      vi.useRealTimers();
      try {
        batcher.enqueue(
          createTestAction('ACTION_1'),
          () => {},
          () => {},
          50,
        );

        // Start multiple flushWithResult calls concurrently
        const [result1, result2, result3] = await Promise.all([
          batcher.flushWithResult(true),
          batcher.flushWithResult(true),
          batcher.flushWithResult(true),
        ]);

        // All concurrent callers should get the actual result, not empty fallback
        expect(result1.actionsSent).toBe(1);
        expect(result2.actionsSent).toBe(1);
        expect(result3.actionsSent).toBe(1);
        expect(result1.batchId).toBeDefined();
        // All should get the same batchId
        expect(result2.batchId).toBe(result1.batchId);
        expect(result3.batchId).toBe(result1.batchId);
      } finally {
        vi.useFakeTimers();
      }
    });

    it('should resolve all concurrent callers when sendBatch throws', async () => {
      vi.useRealTimers();
      try {
        mockSendBatch.mockRejectedValue(new Error('Batch failed'));

        batcher.enqueue(
          createTestAction('ACTION_1'),
          () => {},
          () => {},
          50,
        );

        // Start multiple flushWithResult calls concurrently - they should all resolve, not hang
        const results = await Promise.all([
          batcher.flushWithResult(true),
          batcher.flushWithResult(true),
          batcher.flushWithResult(true),
        ]);

        // All concurrent callers should get the error result with zero actions
        for (const result of results) {
          expect(result.actionsSent).toBe(0);
          expect(result.actionIds).toHaveLength(0);
          expect(result.batchId).toBeDefined();
        }
      } finally {
        vi.useFakeTimers();
      }
    });

    it('should not hang when flushWithResult is called after flush completes but before flushingPromise is nulled', async () => {
      vi.useRealTimers();
      try {
        batcher.enqueue(
          createTestAction('A'),
          () => {},
          () => {},
          50,
        );

        // First caller triggers the flush
        const p1 = batcher.flushWithResult(true);

        // Simulate a waiter that attaches just as the flush finishes
        // by chaining directly off the resolved promise
        const p2 = p1.then(() => batcher.flushWithResult(false));

        const [r1, r2] = await Promise.all([p1, p2]);
        expect(r1.actionsSent).toBe(1);
        // r2 should resolve (not hang); queue is empty so empty result is acceptable
        expect(r2).toBeDefined();
      } finally {
        vi.useFakeTimers();
      }
    });
  });

  describe('hard queue limit', () => {
    it('should reject actions when queue exceeds hard limit', () => {
      // Test with config where maxBatchSize is very large to prevent auto-flush
      // Hard limit will be hit first (at 100 in this test, minimum hardLimit is 100)
      const config = { ...BATCHING_DEFAULTS, maxBatchSize: 10, windowMs: 999999 };
      batcher.destroy();
      batcher = new ActionBatcher(config, mockSendBatch);

      // Hard limit is max(maxBatchSize * 4, 100) = max(40, 100) = 100
      const hardLimit = 100;

      // Fill to exactly the hard limit
      for (let i = 0; i < hardLimit; i++) {
        batcher.enqueue(
          createTestAction(`ACTION_${i}`),
          () => {},
          () => {},
          50,
        );
      }

      // Should have hit the hard limit (some items may have been flushed at maxBatchSize=10)
      expect(batcher.getStats().queueLimit).toBe(hardLimit);

      // Next action should be rejected because queue is at or near hard limit
      let rejectedError: Error | undefined;
      const rejectsSeen: Error[] = [];

      // Keep trying to add until we get a rejection due to hard limit
      for (let i = 0; i < 200; i++) {
        batcher.enqueue(
          createTestAction(`OVERFLOW_${i}`),
          () => {},
          (err) => {
            rejectsSeen.push(err as Error);
            if (!rejectedError && (err as Error).message.includes('exceeded hard limit')) {
              rejectedError = err as Error;
            }
          },
          50,
        );
      }

      // Should have rejected some actions due to hard limit
      expect(rejectedError).toBeDefined();
      expect(rejectedError?.message).toContain('exceeded hard limit');
      expect(batcher.getStats().rejectedActions).toBeGreaterThanOrEqual(1);
    });

    it('should track rejected actions in stats', () => {
      const config = { ...BATCHING_DEFAULTS, maxBatchSize: 10, windowMs: 999999 };
      batcher.destroy();
      batcher = new ActionBatcher(config, mockSendBatch);

      const hardLimit = 100;

      // Fill queue by adding many items quickly
      for (let i = 0; i < hardLimit + 50; i++) {
        batcher.enqueue(
          createTestAction(`ACTION_${i}`),
          () => {},
          () => {},
          50,
        );
      }

      // Should have rejected some actions
      expect(batcher.getStats().rejectedActions).toBeGreaterThanOrEqual(1);
    });

    it('should include queue limit in stats', () => {
      const stats = batcher.getStats();
      expect(stats.queueLimit).toBeDefined();
      expect(stats.queueLimit).toBe(BATCHING_DEFAULTS.maxBatchSize * 4);
    });

    it('should allow enqueue after queue is flushed below limit', async () => {
      const hardLimit = BATCHING_DEFAULTS.maxBatchSize * 4;

      // Fill to limit
      for (let i = 0; i < hardLimit; i++) {
        batcher.enqueue(
          createTestAction(`ACTION_${i}`),
          () => {},
          () => {},
          50,
        );
      }

      // Flush the queue
      vi.advanceTimersByTime(BATCHING_DEFAULTS.windowMs);
      await vi.runAllTimersAsync();

      // Queue should be empty or much smaller now
      expect(batcher.getStats().currentQueueSize).toBeLessThan(hardLimit);

      // Should be able to enqueue again
      let resolved = false;
      batcher.enqueue(
        createTestAction('AFTER_FLUSH'),
        () => {
          resolved = true;
        },
        () => {},
        50,
      );

      vi.advanceTimersByTime(BATCHING_DEFAULTS.windowMs);
      await vi.runAllTimersAsync();

      expect(resolved).toBe(true);
    });
  });
});

describe('calculatePriority', () => {
  it('should return 100 for immediate actions', () => {
    const action = createTestAction('TEST', { __immediate: true });
    expect(calculatePriority(action)).toBe(100);
  });

  it('should return 70 for thunk child actions', () => {
    const action = createTestAction('TEST', { __thunkParentId: 'parent-id' });
    expect(calculatePriority(action)).toBe(70);
  });

  it('should return 50 for normal actions', () => {
    const action = createTestAction('TEST');
    expect(calculatePriority(action)).toBe(50);
  });

  it('should prioritize immediate over thunk parent', () => {
    const action = createTestAction('TEST', {
      __immediate: true,
      __thunkParentId: 'parent-id',
    });
    expect(calculatePriority(action)).toBe(100);
  });
});
