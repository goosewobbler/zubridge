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
      let rejectError: Error | null = null;

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
      expect(rejectError?.message).toContain('cancelled');
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
});

describe('calculatePriority', () => {
  it('should return 100 for bypassThunkLock actions', () => {
    const action = createTestAction('TEST', { __bypassThunkLock: true });
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

  it('should prioritize bypassThunkLock over thunk parent', () => {
    const action = createTestAction('TEST', {
      __bypassThunkLock: true,
      __thunkParentId: 'parent-id',
    });
    expect(calculatePriority(action)).toBe(100);
  });
});
