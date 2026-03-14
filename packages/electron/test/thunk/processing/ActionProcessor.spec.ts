import type { Action } from '@zubridge/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ActionProcessor } from '../../../src/thunk/processing/ActionProcessor.js';
import type { ThunkScheduler } from '../../../src/thunk/scheduling/ThunkScheduler.js';
import { Thunk } from '../../../src/thunk/Thunk.js';

// Mock scheduler
const createMockScheduler = () => ({
  enqueue: vi.fn(),
  getQueueStatus: vi.fn(() => ({ isIdle: true })),
  processQueue: vi.fn(),
  getRunningTasks: vi.fn(() => []),
  removeTasks: vi.fn(),
});

// Helper function to create mock thunk
const createMockThunk = (overrides: Partial<Thunk> = {}): Thunk => {
  const thunk = new Thunk({
    id: 'test-thunk',
    sourceWindowId: 1,
    source: 'main',
  });

  // Apply overrides
  Object.assign(thunk, overrides);

  return thunk;
};

describe('ActionProcessor', () => {
  let processor: ActionProcessor;
  let mockScheduler: ReturnType<typeof createMockScheduler>;
  let mockStateManager: { processAction: (action: Action) => unknown };

  beforeEach(() => {
    mockScheduler = createMockScheduler();
    processor = new ActionProcessor(mockScheduler as unknown as ThunkScheduler);
    mockStateManager = {
      processAction: vi.fn().mockReturnValue({ counter: 42 }),
    };
    processor.setStateManager(mockStateManager);
    vi.clearAllMocks();
  });

  describe('setStateManager', () => {
    it('should set state manager', () => {
      const newStateManager = {
        processAction: vi.fn().mockReturnValue({ newValue: 123 }),
      };

      processor.setStateManager(newStateManager);
      // No direct way to verify, but should not throw
      expect(() => processor.setStateManager(newStateManager)).not.toThrow();
    });

    it('should handle null state manager', () => {
      expect(() => processor.setStateManager(null)).not.toThrow();
    });

    it('should handle undefined state manager', () => {
      expect(() => processor.setStateManager(undefined)).not.toThrow();
    });
  });

  describe('requiresQueue', () => {
    it('should return false for actions with bypass flag', () => {
      const action: Action = {
        type: 'TEST_ACTION',
        __bypassThunkLock: true,
      };

      expect(processor.requiresQueue(action)).toBe(false);
    });

    it('should return true for actions without bypass flag', () => {
      const action: Action = {
        type: 'TEST_ACTION',
      };

      expect(processor.requiresQueue(action)).toBe(true);
    });

    it('should return true for actions with bypass flag set to false', () => {
      const action: Action = {
        type: 'TEST_ACTION',
        __bypassThunkLock: false,
      };

      expect(processor.requiresQueue(action)).toBe(true);
    });
  });

  describe('processAction', () => {
    let mockThunk: Thunk;
    let onActionComplete: (actionId: string) => void;

    beforeEach(() => {
      mockThunk = new Thunk({
        id: 'test-thunk',
        sourceWindowId: 1,
        source: 'main',
      });
      onActionComplete = vi.fn();
    });

    it('should process action successfully', async () => {
      const action: Action = {
        type: 'TEST_ACTION',
        __id: 'action-1',
      };

      await processor.processAction('test-thunk', action, mockThunk, onActionComplete);

      expect(mockStateManager.processAction).toHaveBeenCalledWith(action);
      expect(onActionComplete).toHaveBeenCalledWith('action-1');
    });

    it('should handle action without __id by auto-generating one', async () => {
      const action: Action = {
        type: 'TEST_ACTION',
      };

      await processor.processAction('test-thunk', action, mockThunk, onActionComplete);

      expect(mockStateManager.processAction).toHaveBeenCalledWith(action);
      // Action should now have an auto-generated __id
      expect(action.__id).toBeDefined();
      expect(typeof action.__id).toBe('string');
      // onActionComplete should be called with the generated ID
      expect(onActionComplete).toHaveBeenCalledWith(action.__id);
    });

    it('should handle state manager errors', async () => {
      const action: Action = {
        type: 'TEST_ACTION',
        __id: 'action-1',
      };

      const error = new Error('State manager error');
      mockStateManager.processAction = vi.fn().mockImplementation(() => {
        throw error;
      });

      await expect(
        processor.processAction('test-thunk', action, mockThunk, onActionComplete),
      ).rejects.toThrow('State manager error');

      // onActionComplete should still be called even on error
      expect(onActionComplete).toHaveBeenCalledWith('action-1');
    });

    it('should throw error when state manager is missing', async () => {
      processor.setStateManager(null);

      const action: Action = {
        type: 'TEST_ACTION',
        __id: 'action-1',
      };

      await expect(
        processor.processAction('test-thunk', action, mockThunk, onActionComplete),
      ).rejects.toThrow('State manager not set');
    });
  });

  describe('handleActionComplete', () => {
    let thunks: Map<string, Thunk>;

    beforeEach(() => {
      thunks = new Map();
    });

    it('should return completed thunk IDs when all actions are done', () => {
      const thunk = new Thunk({
        id: 'thunk-1',
        sourceWindowId: 1,
        source: 'main',
      });
      thunk.activate();
      thunks.set('thunk-1', thunk);

      // Simulate tracking an action
      processor.thunkActions.set('thunk-1', new Set(['action-1']));

      const completed = processor.handleActionComplete('action-1', thunks);

      expect(completed).toEqual(['thunk-1']);
    });

    it('should not return thunk ID if more actions are pending', () => {
      const thunk = new Thunk({
        id: 'thunk-1',
        sourceWindowId: 1,
        source: 'main',
      });
      thunk.activate();
      thunks.set('thunk-1', thunk);

      // Simulate tracking multiple actions
      processor.thunkActions.set('thunk-1', new Set(['action-1', 'action-2']));

      const completed = processor.handleActionComplete('action-1', thunks);

      expect(completed).toEqual([]);
    });

    it('should not return completed ID for non-executing thunk', () => {
      const thunk = new Thunk({
        id: 'thunk-1',
        sourceWindowId: 1,
        source: 'main',
      });
      // Don't activate the thunk
      thunks.set('thunk-1', thunk);

      processor.thunkActions.set('thunk-1', new Set(['action-1']));

      const completed = processor.handleActionComplete('action-1', thunks);

      expect(completed).toEqual([]);
    });

    it('should handle unknown action ID', () => {
      const completed = processor.handleActionComplete('unknown-action', thunks);
      expect(completed).toEqual([]);
    });
  });

  describe('getPendingActions', () => {
    it('should return pending actions for thunk', () => {
      const actionSet = new Set(['action-1', 'action-2']);
      processor.thunkActions.set('thunk-1', actionSet);

      const pending = processor.getPendingActions('thunk-1');

      expect(pending).toBe(actionSet);
    });

    it('should return undefined for unknown thunk', () => {
      const pending = processor.getPendingActions('unknown-thunk');
      expect(pending).toBeUndefined();
    });
  });

  describe('cleanupThunkActions', () => {
    it('should clean up actions for a thunk', () => {
      processor.thunkActions.set('thunk-1', new Set(['action-1', 'action-2']));

      processor.cleanupThunkActions('thunk-1');

      expect(processor.getPendingActions('thunk-1')).toBeUndefined();
    });

    it('should handle cleanup of non-existent thunk', () => {
      expect(() => processor.cleanupThunkActions('unknown-thunk')).not.toThrow();
    });
  });

  describe('getCurrentThunkActionId', () => {
    it('should return current thunk action ID', () => {
      expect(processor.getCurrentThunkActionId()).toBeUndefined();

      processor.setCurrentThunkActionId('action-123');
      expect(processor.getCurrentThunkActionId()).toBe('action-123');
    });
  });

  describe('setCurrentThunkActionId', () => {
    it('should set current thunk action ID', () => {
      processor.setCurrentThunkActionId('action-456');
      expect(processor.getCurrentThunkActionId()).toBe('action-456');

      processor.setCurrentThunkActionId(undefined);
      expect(processor.getCurrentThunkActionId()).toBeUndefined();
    });
  });

  describe('getScheduler', () => {
    it('should return the scheduler instance', () => {
      const scheduler = processor.getScheduler();
      expect(scheduler).toBe(mockScheduler);
    });
  });

  describe('clear', () => {
    it('should clear all data', () => {
      processor.thunkActions.set('thunk-1', new Set(['action-1']));
      processor.setCurrentThunkActionId('current-action');

      processor.clear();

      expect(processor.getPendingActions('thunk-1')).toBeUndefined();
      expect(processor.getCurrentThunkActionId()).toBeUndefined();
    });
  });

  describe('event handling', () => {
    it('should be an event emitter', () => {
      const handler = vi.fn();

      processor.on('test-event', handler);
      processor.emit('test-event', 'test-data');

      expect(handler).toHaveBeenCalledWith('test-data');
    });

    it('should support removing event listeners', () => {
      const handler = vi.fn();

      processor.on('test-event', handler);
      processor.off('test-event', handler);
      processor.emit('test-event', 'test-data');

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('advanced processing scenarios', () => {
    it('should handle actions that return promises', async () => {
      const thunkId = 'promise-thunk';
      const action = { type: 'PROMISE_ACTION', __id: 'promise-id' };
      const mockThunk = createMockThunk({ id: thunkId });
      const onActionComplete = vi.fn();

      // Mock state manager to return a promise
      const mockStateManager = {
        processAction: vi.fn().mockResolvedValue('promise-result'),
      };
      processor.setStateManager(mockStateManager);

      await processor.processAction(thunkId, action, mockThunk, onActionComplete);

      expect(mockStateManager.processAction).toHaveBeenCalledWith(action);
      expect(onActionComplete).toHaveBeenCalledWith('promise-id');
    });

    it('should handle actions that return thunk results with promises', async () => {
      const thunkId = 'nested-thunk';
      const action = { type: 'NESTED_THUNK_ACTION', __id: 'nested-id' };
      const mockThunk = createMockThunk({ id: thunkId });
      const onActionComplete = vi.fn();

      // Mock state manager to return a thunk-like object with a promise
      const mockStateManager = {
        processAction: vi.fn().mockReturnValue({
          payload: Promise.resolve('nested-result'),
        }),
      };
      processor.setStateManager(mockStateManager);

      await processor.processAction(thunkId, action, mockThunk, onActionComplete);

      expect(mockStateManager.processAction).toHaveBeenCalledWith(action);
      expect(onActionComplete).toHaveBeenCalledWith('nested-id');
    });

    it('should handle actions that return direct promises (duck typing)', async () => {
      const thunkId = 'direct-promise-thunk';
      const action = { type: 'DIRECT_PROMISE_ACTION', __id: 'direct-id' };
      const mockThunk = createMockThunk({ id: thunkId });
      const onActionComplete = vi.fn();

      // Mock state manager to return something with a then method (promise-like)
      const mockPromiseLike = Promise.resolve('direct-result');
      const mockStateManager = {
        processAction: vi.fn().mockReturnValue(mockPromiseLike),
      };
      processor.setStateManager(mockStateManager);

      await processor.processAction(thunkId, action, mockThunk, onActionComplete);

      expect(mockStateManager.processAction).toHaveBeenCalledWith(action);
      expect(onActionComplete).toHaveBeenCalledWith('direct-id');
    });

    it('should handle hasPendingActions for thunk with actions', () => {
      const thunkId = 'pending-thunk';
      const action = { type: 'TEST_ACTION', __id: 'test-id' };
      const mockThunk = createMockThunk({ id: thunkId });

      const mockStateManager = {
        processAction: vi.fn().mockReturnValue('result'),
      };
      processor.setStateManager(mockStateManager);

      // Start processing (synchronously adds to pending set)
      processor.processAction(thunkId, action, mockThunk, vi.fn());

      // Before action completes, it should be pending
      const hasPending = processor.hasPendingActions?.(thunkId);
      expect(hasPending).toBe(true);
    });

    it('should handle hasPendingActions for thunk without actions', () => {
      const thunkId = 'empty-thunk';

      const hasPending = processor.hasPendingActions?.(thunkId);
      expect(hasPending).toBe(false);
    });

    it('should handle promise rejection in processAction', async () => {
      const thunkId = 'failing-thunk';
      const action = { type: 'FAILING_ACTION', __id: 'fail-id' };
      const mockThunk = createMockThunk({ id: thunkId });
      const onActionComplete = vi.fn();

      const mockStateManager = {
        processAction: vi.fn().mockRejectedValue(new Error('Processing failed')),
      };
      processor.setStateManager(mockStateManager);

      await expect(
        processor.processAction(thunkId, action, mockThunk, onActionComplete),
      ).rejects.toThrow('Processing failed');

      expect(mockStateManager.processAction).toHaveBeenCalledWith(action);
      expect(onActionComplete).toHaveBeenCalledWith('fail-id'); // Even errors complete the action
    });
  });
});
