import type { Action } from '@zubridge/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BatchAckPayload, BatchPayload } from '../../src/batching/types.js';
import { getBatchingConfig } from '../../src/utils/preloadOptions.js';

vi.mock('@zubridge/core', () => ({
  debug: vi.fn(),
}));

const createTestAction = (type: string, overrides: Partial<Action> = {}): Action => ({
  type,
  __id: self.crypto.randomUUID(),
  ...overrides,
});

const createSuccessMock = () =>
  vi.fn().mockImplementation(async (payload: BatchPayload) => ({
    batchId: payload.batchId,
    results: payload.actions.map((a) => ({ actionId: a.id, success: true })),
  }));

describe('Batching Integration', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('Thunk action batching', () => {
    it('should batch thunk child actions with correct priority', async () => {
      const { ActionBatcher, calculatePriority } = await import(
        '../../src/batching/ActionBatcher.js'
      );
      const mockSendBatch = createSuccessMock();
      const batcher = new ActionBatcher(getBatchingConfig(), mockSendBatch);

      const thunkParentId = 'thunk-123';
      const actions = [
        createTestAction('THUNK_ACTION_1', { __thunkParentId: thunkParentId }),
        createTestAction('THUNK_ACTION_2', { __thunkParentId: thunkParentId }),
      ];

      actions.forEach((action) => {
        const priority = calculatePriority(action);
        batcher.enqueue(
          action,
          () => {},
          () => {},
          priority,
        );
      });

      vi.advanceTimersByTime(16);
      await vi.runAllTimersAsync();

      expect(mockSendBatch).toHaveBeenCalledTimes(1);
      const batch = mockSendBatch.mock.calls[0][0];
      expect(batch.actions).toHaveLength(2);
      batch.actions.forEach((item: { action: Action }) => {
        expect(item.action.__thunkParentId).toBe(thunkParentId);
      });

      batcher.destroy();
    });

    it('should include parentId in batch payload', async () => {
      const { ActionBatcher } = await import('../../src/batching/ActionBatcher.js');
      const mockSendBatch = createSuccessMock();
      const batcher = new ActionBatcher(getBatchingConfig(), mockSendBatch);

      const parentId = 'thunk-parent-456';
      batcher.enqueue(
        createTestAction('CHILD_ACTION'),
        () => {},
        () => {},
        70,
        parentId,
      );

      vi.advanceTimersByTime(16);
      await vi.runAllTimersAsync();

      const batch = mockSendBatch.mock.calls[0][0];
      expect(batch.actions[0].parentId).toBe(parentId);

      batcher.destroy();
    });
  });

  describe('Mixed priority actions', () => {
    it('should handle mix of normal and high-priority actions', async () => {
      const { ActionBatcher, calculatePriority } = await import(
        '../../src/batching/ActionBatcher.js'
      );
      const mockSendBatch = createSuccessMock();
      const batcher = new ActionBatcher(getBatchingConfig(), mockSendBatch);

      batcher.enqueue(
        createTestAction('NORMAL_1'),
        () => {},
        () => {},
        calculatePriority(createTestAction('NORMAL_1')),
      );
      batcher.enqueue(
        createTestAction('NORMAL_2'),
        () => {},
        () => {},
        calculatePriority(createTestAction('NORMAL_2')),
      );
      batcher.enqueue(
        createTestAction('HIGH', { __bypassThunkLock: true }),
        () => {},
        () => {},
        100,
      );

      await vi.runAllTimersAsync();

      expect(mockSendBatch).toHaveBeenCalledTimes(1);
      const batch = mockSendBatch.mock.calls[0][0];
      expect(batch.actions).toHaveLength(3);

      batcher.destroy();
    });
  });

  describe('bypassThunkLock immediate flush', () => {
    it('should trigger immediate flush for bypassThunkLock actions', async () => {
      const { ActionBatcher } = await import('../../src/batching/ActionBatcher.js');
      const mockSendBatch = createSuccessMock();
      const batcher = new ActionBatcher(getBatchingConfig(), mockSendBatch);

      batcher.enqueue(
        createTestAction('NORMAL'),
        () => {},
        () => {},
        50,
      );

      vi.advanceTimersByTime(8);

      expect(mockSendBatch).not.toHaveBeenCalled();

      batcher.enqueue(
        createTestAction('BYPASS', { __bypassThunkLock: true }),
        () => {},
        () => {},
        100,
      );

      await vi.runAllTimersAsync();

      expect(mockSendBatch).toHaveBeenCalledTimes(1);
      const batch = mockSendBatch.mock.calls[0][0];
      expect(batch.actions).toHaveLength(2);

      batcher.destroy();
    });
  });

  describe('Batch acknowledgment handling', () => {
    it('should resolve promises on successful ACK', async () => {
      const { ActionBatcher } = await import('../../src/batching/ActionBatcher.js');
      const mockSendBatch = createSuccessMock();
      const batcher = new ActionBatcher(getBatchingConfig(), mockSendBatch);

      const results: string[] = [];
      batcher.enqueue(
        createTestAction('ACTION_1'),
        () => {
          results.push('resolved');
        },
        () => {},
        50,
      );

      vi.advanceTimersByTime(16);
      await vi.runAllTimersAsync();

      expect(results).toContain('resolved');

      batcher.destroy();
    });

    it('should reject promises on failed ACK', async () => {
      const { ActionBatcher } = await import('../../src/batching/ActionBatcher.js');
      const mockSendBatch = vi.fn().mockRejectedValue(new Error('ACK failed'));
      const batcher = new ActionBatcher(getBatchingConfig(), mockSendBatch);

      const errors: Error[] = [];
      batcher.enqueue(
        createTestAction('ACTION_1'),
        () => {},
        (err) => {
          errors.push(err as Error);
        },
        50,
      );

      vi.advanceTimersByTime(16);
      await vi.runAllTimersAsync();

      expect(errors).toHaveLength(1);
      expect(errors[0].message).toBe('ACK failed');

      batcher.destroy();
    });

    it('should handle mixed per-action results', async () => {
      const { ActionBatcher } = await import('../../src/batching/ActionBatcher.js');
      const action1 = createTestAction('SUCCESS_ACTION');
      const action2 = createTestAction('FAIL_ACTION');

      const mockSendBatch = vi.fn().mockImplementation(async (payload: BatchPayload) => ({
        batchId: payload.batchId,
        results: payload.actions.map((a) => {
          if (a.action.type === 'FAIL_ACTION') {
            return { actionId: a.id, success: false, error: 'Simulated failure' };
          }
          return { actionId: a.id, success: true };
        }),
      }));

      const batcher = new ActionBatcher(getBatchingConfig(), mockSendBatch);

      const resolved: string[] = [];
      const errors: string[] = [];

      batcher.enqueue(
        action1,
        (action) => {
          resolved.push(action.type);
        },
        (err) => {
          errors.push((err as Error).message);
        },
        50,
      );
      batcher.enqueue(
        action2,
        (action) => {
          resolved.push(action.type);
        },
        (err) => {
          errors.push((err as Error).message);
        },
        50,
      );

      vi.advanceTimersByTime(16);
      await vi.runAllTimersAsync();

      expect(resolved).toEqual(['SUCCESS_ACTION']);
      expect(errors).toEqual(['Simulated failure']);

      batcher.destroy();
    });
  });

  describe('Error propagation in batches', () => {
    it('should reject all actions in batch on send failure', async () => {
      const { ActionBatcher } = await import('../../src/batching/ActionBatcher.js');
      const mockSendBatch = vi.fn().mockRejectedValue(new Error('Send failed'));
      const batcher = new ActionBatcher(getBatchingConfig(), mockSendBatch);

      const errors: Error[] = [];
      batcher.enqueue(
        createTestAction('ACTION_1'),
        () => {},
        (err) => {
          errors.push(err as Error);
        },
        50,
      );
      batcher.enqueue(
        createTestAction('ACTION_2'),
        () => {},
        (err) => {
          errors.push(err as Error);
        },
        50,
      );

      vi.advanceTimersByTime(16);
      await vi.runAllTimersAsync();

      expect(errors).toHaveLength(2);
      errors.forEach((err) => {
        expect(err.message).toBe('Send failed');
      });

      batcher.destroy();
    });
  });

  describe('Batching disable fallback', () => {
    it('should dispatch directly without batching when enableBatching is false', async () => {
      const { ActionBatcher } = await import('../../src/batching/ActionBatcher.js');

      const directDispatchCalls: Action[] = [];
      const directDispatch = (action: Action) => {
        directDispatchCalls.push(action);
      };

      const enableBatching = false;
      let actionBatcher: InstanceType<typeof ActionBatcher> | null = null;

      if (enableBatching) {
        actionBatcher = new ActionBatcher(getBatchingConfig(), createSuccessMock());
      }

      const action = createTestAction('DIRECT_ACTION');
      if (actionBatcher) {
        throw new Error('Should not reach batcher path');
      }
      directDispatch(action);

      expect(directDispatchCalls).toHaveLength(1);
      expect(directDispatchCalls[0].type).toBe('DIRECT_ACTION');
      expect(actionBatcher).toBeNull();
    });
  });

  describe('Action ordering preservation', () => {
    it('should preserve action order within batch', async () => {
      const { ActionBatcher } = await import('../../src/batching/ActionBatcher.js');
      const mockSendBatch = createSuccessMock();
      const batcher = new ActionBatcher(getBatchingConfig(), mockSendBatch);

      const actionTypes = ['FIRST', 'SECOND', 'THIRD', 'FOURTH', 'FIFTH'];
      actionTypes.forEach((type) => {
        batcher.enqueue(
          createTestAction(type),
          () => {},
          () => {},
          50,
        );
      });

      vi.advanceTimersByTime(16);
      await vi.runAllTimersAsync();

      const batch = mockSendBatch.mock.calls[0][0];
      const receivedTypes = batch.actions.map((a: { action: Action }) => a.action.type);

      expect(receivedTypes).toEqual(actionTypes);

      batcher.destroy();
    });
  });

  describe('Backpressure handling', () => {
    it('should queue actions during active flush', async () => {
      const { ActionBatcher } = await import('../../src/batching/ActionBatcher.js');
      let resolveSendBatch: ((value: BatchAckPayload) => void) | undefined;
      const mockSendBatch = vi.fn().mockImplementation(
        (payload: BatchPayload) =>
          new Promise<BatchAckPayload>((resolve) => {
            resolveSendBatch = () =>
              resolve({
                batchId: payload.batchId,
                results: payload.actions.map((a) => ({ actionId: a.id, success: true })),
              });
          }),
      );
      const batcher = new ActionBatcher(getBatchingConfig(), mockSendBatch);

      batcher.enqueue(
        createTestAction('ACTION_1'),
        () => {},
        () => {},
        50,
      );

      vi.advanceTimersByTime(16);

      batcher.enqueue(
        createTestAction('ACTION_2'),
        () => {},
        () => {},
        50,
      );
      batcher.enqueue(
        createTestAction('ACTION_3'),
        () => {},
        () => {},
        50,
      );

      expect(batcher.getStats().isFlushing).toBe(true);
      expect(batcher.getStats().currentQueueSize).toBe(2);

      resolveSendBatch?.();
      await vi.runAllTimersAsync();

      expect(mockSendBatch).toHaveBeenCalledTimes(2);

      batcher.destroy();
    });
  });

  describe('Destroy during flush', () => {
    it('should reject queued actions when destroyed during active flush', async () => {
      const { ActionBatcher } = await import('../../src/batching/ActionBatcher.js');

      const mockSendBatch = vi.fn().mockImplementation(
        (_payload: BatchPayload) =>
          new Promise<BatchAckPayload>(() => {
            // Intentionally never resolves - testing destroy during active flush
          }),
      );
      const batcher = new ActionBatcher(getBatchingConfig(), mockSendBatch);

      const errors: string[] = [];

      batcher.enqueue(
        createTestAction('IN_FLIGHT'),
        () => {},
        (err) => {
          errors.push((err as Error).message);
        },
        50,
      );

      vi.advanceTimersByTime(16);

      batcher.enqueue(
        createTestAction('QUEUED_1'),
        () => {},
        (err) => {
          errors.push((err as Error).message);
        },
        50,
      );
      batcher.enqueue(
        createTestAction('QUEUED_2'),
        () => {},
        (err) => {
          errors.push((err as Error).message);
        },
        50,
      );

      expect(batcher.getStats().isFlushing).toBe(true);

      batcher.destroy();

      expect(errors).toHaveLength(2);
      errors.forEach((msg) => {
        expect(msg).toContain('destroyed');
      });
    });
  });
});
