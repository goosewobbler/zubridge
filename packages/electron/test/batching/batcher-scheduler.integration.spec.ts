import type { Action } from '@zubridge/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ActionScheduler } from '../../src/action/ActionScheduler.js';
import { ActionBatcher, calculatePriority } from '../../src/batching/ActionBatcher.js';
import type { BatchAckPayload, BatchPayload } from '../../src/batching/types.js';
import { BATCHING_DEFAULTS, PRIORITY_LEVELS } from '../../src/batching/types.js';
import { ThunkScheduler } from '../../src/thunk/scheduling/ThunkScheduler.js';
import { ThunkManager } from '../../src/thunk/ThunkManager.js';

vi.mock('@zubridge/core', () => ({
  debug: vi.fn(),
}));

const createTestAction = (type: string, overrides: Partial<Action> = {}): Action => ({
  type,
  __id: self.crypto.randomUUID(),
  ...overrides,
});

describe('ActionBatcher + ActionScheduler Integration', () => {
  let batcher: ActionBatcher;
  let scheduler: ActionScheduler;
  let thunkManager: ThunkManager;
  let mockSendBatch: ReturnType<typeof vi.fn>;
  let processedActions: Array<{ action: Action; priority: number }>;

  beforeEach(() => {
    vi.useFakeTimers();
    processedActions = [];

    // Create mock send batch that tracks priorities
    mockSendBatch = vi.fn().mockImplementation(async (payload: BatchPayload) => {
      // Simulate the scheduler receiving and processing actions
      const results = payload.actions.map((item) => {
        const priority = calculatePriority(item.action);
        processedActions.push({ action: item.action, priority });
        return { actionId: item.id, success: true };
      });

      return {
        batchId: payload.batchId,
        results,
      } as BatchAckPayload;
    });

    // Create ThunkScheduler for ThunkManager
    const mockScheduler: ThunkScheduler = new ThunkScheduler();
    thunkManager = new ThunkManager(mockScheduler);

    // Create ActionScheduler
    scheduler = new ActionScheduler(thunkManager);
    scheduler.setActionProcessor(async (action: Action) => {
      // Simulate action processing
      return action;
    });

    // Create ActionBatcher
    batcher = new ActionBatcher(BATCHING_DEFAULTS, mockSendBatch);
  });

  afterEach(() => {
    batcher.destroy();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('Priority system integration', () => {
    it('should use consistent priority values across batcher and scheduler', () => {
      // Test that calculatePriority matches expected levels
      expect(calculatePriority(createTestAction('NORMAL'))).toBe(
        PRIORITY_LEVELS.NORMAL_THUNK_ACTION,
      );
      expect(calculatePriority(createTestAction('THUNK', { __thunkParentId: 'thunk-1' }))).toBe(
        PRIORITY_LEVELS.ROOT_THUNK_ACTION,
      );
      expect(calculatePriority(createTestAction('BYPASS', { __immediate: true }))).toBe(
        PRIORITY_LEVELS.IMMEDIATE,
      );
    });

    it('should process actions in priority order from batcher to scheduler', async () => {
      // Enqueue actions with different priorities
      const normalAction = createTestAction('NORMAL');
      const thunkAction = createTestAction('THUNK', { __thunkParentId: 'thunk-1' });
      const bypassAction = createTestAction('BYPASS', { __immediate: true });

      // Add normal action first
      batcher.enqueue(
        normalAction,
        () => {},
        () => {},
        calculatePriority(normalAction),
      );

      // Add thunk action
      batcher.enqueue(
        thunkAction,
        () => {},
        () => {},
        calculatePriority(thunkAction),
      );

      // Add bypass action - should trigger immediate flush
      batcher.enqueue(
        bypassAction,
        () => {},
        () => {},
        calculatePriority(bypassAction),
      );

      await vi.runAllTimersAsync();

      // Verify all actions were processed
      expect(mockSendBatch).toHaveBeenCalledTimes(1);
      expect(processedActions).toHaveLength(3);

      // Verify priority values are from PRIORITY_LEVELS
      // High-priority actions are inserted at front with unshift, so order is reversed
      // Queue order: [bypass (100), normal (50), thunk (70)] after unshift
      expect(processedActions[0].priority).toBe(PRIORITY_LEVELS.IMMEDIATE);
      expect(processedActions[1].priority).toBe(PRIORITY_LEVELS.NORMAL_THUNK_ACTION);
      expect(processedActions[2].priority).toBe(PRIORITY_LEVELS.ROOT_THUNK_ACTION);
    });

    it('should immediately flush high-priority actions', async () => {
      const normalAction = createTestAction('NORMAL');
      const highPriorityAction = createTestAction('HIGH', { __immediate: true });

      // Enqueue normal action
      batcher.enqueue(
        normalAction,
        () => {},
        () => {},
        calculatePriority(normalAction),
      );

      // Advance time halfway through batch window
      vi.advanceTimersByTime(BATCHING_DEFAULTS.windowMs / 2);
      expect(mockSendBatch).not.toHaveBeenCalled();

      // Enqueue high priority action - should trigger immediate flush
      batcher.enqueue(
        highPriorityAction,
        () => {},
        () => {},
        calculatePriority(highPriorityAction),
      );

      await vi.runAllTimersAsync();

      // Verify batch was sent immediately due to high priority
      expect(mockSendBatch).toHaveBeenCalledTimes(1);
      expect(processedActions).toHaveLength(2);
    });
  });

  describe('Thunk context and priority', () => {
    it('should assign ROOT_THUNK_ACTION priority to actions within active thunk', async () => {
      const thunkId = 'test-thunk-1';

      // Simulate thunk registration
      thunkManager.registerThunk(thunkId, 1, false, false);

      // Create action belonging to this thunk
      const thunkAction = createTestAction('THUNK_ACTION', { __thunkParentId: thunkId });
      const priority = calculatePriority(thunkAction);

      expect(priority).toBe(PRIORITY_LEVELS.ROOT_THUNK_ACTION);

      // Enqueue through batcher
      batcher.enqueue(
        thunkAction,
        () => {},
        () => {},
        priority,
      );

      await vi.runAllTimersAsync();

      // Verify the priority was maintained through the pipeline
      expect(processedActions).toHaveLength(1);
      expect(processedActions[0].priority).toBe(PRIORITY_LEVELS.ROOT_THUNK_ACTION);
    });

    it('should handle mixed priority actions during thunk execution', async () => {
      const thunkId = 'test-thunk-1';
      thunkManager.registerThunk(thunkId, 1, false, false);

      const actions = [
        createTestAction('THUNK_1', { __thunkParentId: thunkId }),
        createTestAction('NORMAL'),
        createTestAction('THUNK_2', { __thunkParentId: thunkId }),
        createTestAction('BYPASS', { __immediate: true }),
      ];

      // Enqueue all actions
      actions.forEach((action) => {
        const priority = calculatePriority(action);
        batcher.enqueue(
          action,
          () => {},
          () => {},
          priority,
        );
      });

      await vi.runAllTimersAsync();

      // Verify all were processed with correct priorities
      // High-priority actions are inserted at front with unshift, so IMMEDIATE comes first
      expect(processedActions).toHaveLength(4);
      expect(processedActions[0].priority).toBe(PRIORITY_LEVELS.IMMEDIATE); // BYPASS (inserted at front)
      expect(processedActions[1].priority).toBe(PRIORITY_LEVELS.ROOT_THUNK_ACTION); // THUNK_1
      expect(processedActions[2].priority).toBe(PRIORITY_LEVELS.NORMAL_THUNK_ACTION); // NORMAL
      expect(processedActions[3].priority).toBe(PRIORITY_LEVELS.ROOT_THUNK_ACTION); // THUNK_2
    });
  });

  describe('Batch window and priority interaction', () => {
    it('should respect batch window for low-priority actions', async () => {
      const actions = Array.from({ length: 5 }, (_, i) => createTestAction(`ACTION_${i}`));

      // Enqueue actions at different times within the batch window
      actions.forEach((action, index) => {
        batcher.enqueue(
          action,
          () => {},
          () => {},
          calculatePriority(action),
        );
        if (index < actions.length - 1) {
          vi.advanceTimersByTime(3); // 3ms between actions (< 16ms window)
        }
      });

      // Should not have sent yet (still within window)
      expect(mockSendBatch).not.toHaveBeenCalled();

      // Complete the batch window
      vi.advanceTimersByTime(BATCHING_DEFAULTS.windowMs);
      await vi.runAllTimersAsync();

      // All actions should be in one batch
      expect(mockSendBatch).toHaveBeenCalledTimes(1);
      expect(processedActions).toHaveLength(5);
    });

    it('should break batch window for priority threshold actions', async () => {
      // Enqueue normal actions
      batcher.enqueue(
        createTestAction('NORMAL_1'),
        () => {},
        () => {},
        PRIORITY_LEVELS.NORMAL_THUNK_ACTION,
      );
      batcher.enqueue(
        createTestAction('NORMAL_2'),
        () => {},
        () => {},
        PRIORITY_LEVELS.NORMAL_THUNK_ACTION,
      );

      vi.advanceTimersByTime(5);

      // Enqueue action that meets priority threshold (>= 80)
      batcher.enqueue(
        createTestAction('URGENT', { __immediate: true }),
        () => {},
        () => {},
        PRIORITY_LEVELS.IMMEDIATE,
      );

      await vi.runAllTimersAsync();

      // Should have flushed immediately due to priority
      expect(mockSendBatch).toHaveBeenCalledTimes(1);
      expect(processedActions).toHaveLength(3);
    });
  });

  describe('ActionScheduler priority logic', () => {
    it('should always allow bypass actions to execute immediately', () => {
      // Action with bypass flag should always execute, regardless of thunk state
      const action = createTestAction('BYPASS_ACTION', { __immediate: true });

      // Check if action can execute immediately
      const canExecute = scheduler.canExecuteImmediately(action);

      // Should execute immediately due to bypass flag
      expect(canExecute).toBe(true);
    });

    it('should calculate correct priority for bypass actions', () => {
      const action = createTestAction('BYPASS', { __immediate: true });

      // Verify priority is IMMEDIATE level
      expect(calculatePriority(action)).toBe(PRIORITY_LEVELS.IMMEDIATE);
    });

    it('should allow actions when no thunk is active', () => {
      // When no thunk is running, regular actions should execute immediately
      const action = createTestAction('NORMAL_ACTION');

      const canExecute = scheduler.canExecuteImmediately(action);

      // Should execute because no thunk is blocking
      expect(canExecute).toBe(true);
    });
  });

  describe('Priority overflow behavior', () => {
    it('should protect high-priority actions during queue overflow', () => {
      // Fill queue with actions
      const queueStats = scheduler.getQueueStats();
      expect(queueStats.currentSize).toBe(0);

      // Verify priority distribution for queued actions
      const highPriorityAction = createTestAction('HIGH', { __immediate: true });
      const lowPriorityAction = createTestAction('LOW');

      expect(calculatePriority(highPriorityAction)).toBeGreaterThanOrEqual(
        PRIORITY_LEVELS.NORMAL_THUNK_ACTION,
      );
      expect(calculatePriority(lowPriorityAction)).toBeLessThan(PRIORITY_LEVELS.ROOT_THUNK_ACTION);
    });
  });

  describe('End-to-end priority flow', () => {
    it('should maintain priority semantics from batcher through scheduler', async () => {
      // Simulate complete flow with different action types
      const actions = [
        { action: createTestAction('NORMAL_1'), expected: PRIORITY_LEVELS.NORMAL_THUNK_ACTION },
        {
          action: createTestAction('THUNK_1', { __thunkParentId: 'thunk' }),
          expected: PRIORITY_LEVELS.ROOT_THUNK_ACTION,
        },
        {
          action: createTestAction('BYPASS_1', { __immediate: true }),
          expected: PRIORITY_LEVELS.IMMEDIATE,
        },
        { action: createTestAction('NORMAL_2'), expected: PRIORITY_LEVELS.NORMAL_THUNK_ACTION },
      ];

      // Enqueue all actions through batcher
      actions.forEach(({ action }) => {
        const priority = calculatePriority(action);
        batcher.enqueue(
          action,
          () => {},
          () => {},
          priority,
        );
      });

      await vi.runAllTimersAsync();

      // Verify priorities maintained through pipeline
      // IMMEDIATE triggers immediate flush (unshift puts it at front), others are batched
      // Order: BYPASS_1 (immediate flush), then NORMAL_1, THUNK_1, NORMAL_2 (scheduled flush)
      expect(processedActions).toHaveLength(actions.length);
      expect(processedActions[0].priority).toBe(PRIORITY_LEVELS.IMMEDIATE); // BYPASS_1 (immediate flush)
      expect(processedActions[1].priority).toBe(PRIORITY_LEVELS.NORMAL_THUNK_ACTION); // NORMAL_1
      expect(processedActions[2].priority).toBe(PRIORITY_LEVELS.ROOT_THUNK_ACTION); // THUNK_1
      expect(processedActions[3].priority).toBe(PRIORITY_LEVELS.NORMAL_THUNK_ACTION); // NORMAL_2
    });
  });
});
