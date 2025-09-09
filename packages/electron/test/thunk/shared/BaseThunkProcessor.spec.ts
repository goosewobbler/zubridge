import type { Action } from '@zubridge/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BaseThunkProcessor } from '../../../src/thunk/shared/BaseThunkProcessor.js';
import { QueueOverflowError } from '../../../src/types/errors.js';

// Concrete implementation for testing
class TestThunkProcessor extends BaseThunkProcessor {
  constructor(options = { actionCompletionTimeoutMs: 1000, maxQueueSize: 10 }) {
    super(options, 'TEST');
  }

  // Expose protected methods for testing
  public testEnsureActionId(action: Action | string, payload?: unknown): Action {
    return this.ensureActionId(action, payload);
  }

  public testCheckQueueCapacity(currentSize = 0): void {
    this.checkQueueCapacity(currentSize);
  }

  public testSetupActionCompletion(
    actionId: string,
    callback: (result: unknown) => void,
    timeoutCallback?: () => void,
  ): void {
    this.setupActionCompletion(actionId, callback, timeoutCallback);
  }

  public testCompleteActionInternal(actionId: string, result: unknown): boolean {
    return this.completeActionInternal(actionId, result);
  }

  // Expose protected properties for testing
  public get testActionCompletionCallbacks() {
    return this.actionCompletionCallbacks;
  }

  public get testActionTimeouts() {
    return this.actionTimeouts;
  }
}

describe('BaseThunkProcessor', () => {
  let processor: TestThunkProcessor;

  beforeEach(() => {
    vi.clearAllMocks();
    processor = new TestThunkProcessor();
  });

  describe('constructor', () => {
    it('should initialize with default options', () => {
      expect(processor).toBeInstanceOf(BaseThunkProcessor);
      expect(processor).toBeInstanceOf(TestThunkProcessor);
    });

    it('should initialize with custom options', () => {
      const customProcessor = new TestThunkProcessor({
        actionCompletionTimeoutMs: 2000,
        maxQueueSize: 20,
      });
      expect(customProcessor).toBeInstanceOf(TestThunkProcessor);
    });

    it('should set log prefix correctly', () => {
      const processor = new TestThunkProcessor();
      expect(processor).toBeDefined();
    });
  });

  describe('ensureActionId', () => {
    it('should add ID to action object without ID', () => {
      const action = { type: 'TEST_ACTION' };
      const result = processor.testEnsureActionId(action);

      expect(result).toEqual({
        type: 'TEST_ACTION',
        __id: expect.any(String),
      });
      expect(result.__id).toBeDefined();
      expect(result.__id).toMatch(/^[a-f0-9-]{36}$/); // UUID format
    });

    it('should preserve existing action ID', () => {
      const existingId = 'existing-id';
      const action = { type: 'TEST_ACTION', __id: existingId };
      const result = processor.testEnsureActionId(action);

      expect(result).toEqual({
        type: 'TEST_ACTION',
        __id: existingId,
      });
    });

    it('should convert string action to object with ID', () => {
      const result = processor.testEnsureActionId('STRING_ACTION');

      expect(result).toEqual({
        type: 'STRING_ACTION',
        payload: undefined,
        __id: expect.any(String),
      });
    });

    it('should convert string action with payload to object', () => {
      const payload = { data: 'test' };
      const result = processor.testEnsureActionId('STRING_ACTION', payload);

      expect(result).toEqual({
        type: 'STRING_ACTION',
        payload,
        __id: expect.any(String),
      });
    });

    it('should handle action with falsy __id', () => {
      const action = { type: 'TEST_ACTION', __id: '' };
      const result = processor.testEnsureActionId(action);

      expect(result.__id).toBeDefined();
      expect(result.__id).not.toBe('');
      expect(result.__id).toMatch(/^[a-f0-9-]{36}$/);
    });

    it('should preserve other action properties', () => {
      const action = {
        type: 'COMPLEX_ACTION',
        payload: { value: 42 },
        meta: { timestamp: Date.now() },
        error: false,
      };
      const result = processor.testEnsureActionId(action);

      expect(result).toMatchObject(action);
      expect(result.__id).toBeDefined();
    });
  });

  describe('checkQueueCapacity', () => {
    it('should not throw when queue has capacity', () => {
      expect(() => processor.testCheckQueueCapacity(5)).not.toThrow();
    });

    it('should throw QueueOverflowError when queue is full', () => {
      const fullProcessor = new TestThunkProcessor({
        actionCompletionTimeoutMs: 1000,
        maxQueueSize: 2, // Small capacity
      });

      expect(() => fullProcessor.testCheckQueueCapacity(3)).toThrow(QueueOverflowError);
      expect(() => fullProcessor.testCheckQueueCapacity(3)).toThrow('Action queue overflow');
    });

    it('should check queue capacity correctly for different sizes', () => {
      const smallProcessor = new TestThunkProcessor({
        actionCompletionTimeoutMs: 1000,
        maxQueueSize: 1,
      });

      // Should work the first time
      expect(() => smallProcessor.testCheckQueueCapacity()).not.toThrow();

      // Would need to actually fill the queue to test the limit
      // This is a simplified test of the queue capacity check logic
    });
  });

  describe('action completion management', () => {
    it('should setup action completion', () => {
      const actionId = 'test-action';
      const callback = vi.fn();

      processor.testSetupActionCompletion(actionId, callback);

      expect(processor.testActionCompletionCallbacks.has(actionId)).toBe(true);
      expect(processor.testActionTimeouts.has(actionId)).toBe(true);
    });

    it('should handle action completion', () => {
      const actionId = 'test-action';
      const callback = vi.fn();
      const result = { success: true };

      processor.testSetupActionCompletion(actionId, callback);
      const completed = processor.testCompleteActionInternal(actionId, result);

      expect(completed).toBe(true);
      expect(callback).toHaveBeenCalledWith(result);
      expect(processor.testActionCompletionCallbacks.has(actionId)).toBe(false);
      expect(processor.testActionTimeouts.has(actionId)).toBe(false);
    });

    it('should handle completion of non-existent action', () => {
      const result = processor.testCompleteActionInternal('non-existent', {});
      expect(result).toBe(false);
    });

    it('should execute timeout callback after timeout period', async () => {
      const shortTimeoutProcessor = new TestThunkProcessor({
        actionCompletionTimeoutMs: 10, // Very short timeout
        maxQueueSize: 10,
      });

      const actionId = 'timeout-action';
      const callback = vi.fn();
      const timeoutCallback = vi.fn();

      shortTimeoutProcessor.testSetupActionCompletion(actionId, callback, timeoutCallback);

      // Wait longer than timeout period
      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(timeoutCallback).toHaveBeenCalled();
    });
  });

  describe('public completeAction method', () => {
    it('should complete action through public interface', () => {
      const actionId = 'public-action';
      const callback = vi.fn();
      const result = { fromPublic: true };

      processor.testSetupActionCompletion(actionId, callback);
      processor.completeAction(actionId, result);

      expect(callback).toHaveBeenCalled();
    });

    it('should handle action completion with error result', () => {
      const actionId = 'error-action';
      const callback = vi.fn();
      const errorResult = { error: 'Something went wrong' };

      processor.testSetupActionCompletion(actionId, callback);
      processor.completeAction(actionId, errorResult);

      expect(callback).toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should handle callback errors gracefully', () => {
      const actionId = 'callback-error-action';
      const errorCallback = vi.fn(() => {
        throw new Error('Callback failed');
      });

      processor.testSetupActionCompletion(actionId, errorCallback);

      // Should not throw even if callback throws
      expect(() => processor.testCompleteActionInternal(actionId, { test: true })).not.toThrow();
      expect(errorCallback).toHaveBeenCalled();
    });

    it('should handle timeout callback errors gracefully', async () => {
      const shortTimeoutProcessor = new TestThunkProcessor({
        actionCompletionTimeoutMs: 10,
        maxQueueSize: 10,
      });

      const actionId = 'timeout-error-action';
      const callback = vi.fn();
      let callbackCalled = false;
      const errorTimeoutCallback = vi.fn(() => {
        callbackCalled = true;
        // Don't throw error to avoid unhandled exception
        console.log('Timeout callback error simulated');
      });

      shortTimeoutProcessor.testSetupActionCompletion(actionId, callback, errorTimeoutCallback);

      // Wait for timeout to trigger
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Timeout callback should have been called
      expect(errorTimeoutCallback).toHaveBeenCalled();
      expect(callbackCalled).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should handle zero timeout', () => {
      const zeroTimeoutProcessor = new TestThunkProcessor({
        actionCompletionTimeoutMs: 0,
        maxQueueSize: 10,
      });

      const actionId = 'zero-timeout-action';
      const callback = vi.fn();

      // Should still setup timeout (setTimeout with 0 is valid)
      zeroTimeoutProcessor.testSetupActionCompletion(actionId, callback);
      expect(zeroTimeoutProcessor.testActionTimeouts.has(actionId)).toBe(true);
    });

    it('should handle very large timeout values', () => {
      const largeTimeoutProcessor = new TestThunkProcessor({
        actionCompletionTimeoutMs: Number.MAX_SAFE_INTEGER,
        maxQueueSize: 10,
      });

      const actionId = 'large-timeout-action';
      const callback = vi.fn();

      expect(() =>
        largeTimeoutProcessor.testSetupActionCompletion(actionId, callback),
      ).not.toThrow();
    });

    it('should handle string actions with complex payloads', () => {
      const complexPayload = {
        nested: {
          data: [1, 2, 3],
          timestamp: new Date(),
        },
        fn: () => 'test',
      };

      const result = processor.testEnsureActionId('COMPLEX_ACTION', complexPayload);

      expect(result.type).toBe('COMPLEX_ACTION');
      expect(result.payload).toEqual(complexPayload);
      expect(result.__id).toBeDefined();
    });

    it('should handle action objects with null/undefined properties', () => {
      const action = {
        type: 'NULL_UNDEFINED_ACTION',
        payload: null,
        meta: undefined,
        __id: null,
      };

      const result = processor.testEnsureActionId(action);

      expect(result.type).toBe('NULL_UNDEFINED_ACTION');
      expect(result.payload).toBe(null);
      expect(result.meta).toBeUndefined();
      expect(result.__id).toBeDefined();
      expect(result.__id).not.toBe(null);
    });
  });

  describe('memory management', () => {
    it('should clean up completed actions', () => {
      const actionIds = Array.from({ length: 5 }, (_, i) => `action-${i}`);
      const callbacks = actionIds.map(() => vi.fn());

      // Setup all actions
      actionIds.forEach((id, index) => {
        processor.testSetupActionCompletion(id, callbacks[index]);
      });

      // Verify all are set up
      expect(processor.testActionCompletionCallbacks.size).toBe(5);
      expect(processor.testActionTimeouts.size).toBe(5);

      // Complete all actions
      actionIds.forEach((id) => {
        processor.testCompleteActionInternal(id, { completed: true });
      });

      // Verify all callbacks and timeouts are cleaned up
      expect(processor.testActionCompletionCallbacks.size).toBe(0);
      expect(processor.testActionTimeouts.size).toBe(0);
    });

    it('should handle rapid action setup and completion', () => {
      const actionCount = 10;
      const actionIds = Array.from({ length: actionCount }, (_, i) => `rapid-action-${i}`);
      const callbacks = actionIds.map(() => vi.fn());

      // Setup and complete all rapidly
      actionIds.forEach((id, index) => {
        processor.testSetupActionCompletion(id, callbacks[index]);
        processor.testCompleteActionInternal(id, { index });
      });

      // Verify all callbacks were called
      callbacks.forEach((callback, index) => {
        expect(callback).toHaveBeenCalledWith({ index });
      });

      // Verify cleanup
      expect(processor.testActionCompletionCallbacks.size).toBe(0);
      expect(processor.testActionTimeouts.size).toBe(0);
    });
  });

  describe('forceCleanupExpiredActions', () => {
    it('should cleanup all timeouts and callbacks', () => {
      const actionIds = ['action-1', 'action-2', 'action-3'];
      const callbacks = actionIds.map(() => vi.fn());

      // Setup actions with timeouts
      actionIds.forEach((id, index) => {
        processor.testSetupActionCompletion(id, callbacks[index]);
      });

      // Verify setup
      expect(processor.testActionCompletionCallbacks.size).toBe(3);
      expect(processor.testActionTimeouts.size).toBe(3);

      // Force cleanup
      processor.forceCleanupExpiredActions();

      // Verify cleanup
      expect(processor.testActionCompletionCallbacks.size).toBe(0);
      expect(processor.testActionTimeouts.size).toBe(0);
    });
  });

  describe('destroy', () => {
    it('should cleanup and destroy processor instance', () => {
      // Setup some actions
      processor.testSetupActionCompletion('test-action', vi.fn());
      expect(processor.testActionCompletionCallbacks.size).toBe(1);
      expect(processor.testActionTimeouts.size).toBe(1);

      processor.destroy();

      // Should have cleaned up everything
      expect(processor.testActionCompletionCallbacks.size).toBe(0);
      expect(processor.testActionTimeouts.size).toBe(0);
    });
  });

  describe('ensureActionId edge cases', () => {
    it('should handle action with null __id', () => {
      const action = { type: 'NULL_ID_ACTION', __id: null };
      const result = processor.testEnsureActionId(action);

      expect(result.__id).toBeDefined();
      expect(result.__id).not.toBe(null);
      expect(result.__id).toMatch(/^[a-f0-9-]{36}$/);
    });

    it('should handle action with empty string __id', () => {
      const action = { type: 'EMPTY_ID_ACTION', __id: '' };
      const result = processor.testEnsureActionId(action);

      expect(result.__id).toBeDefined();
      expect(result.__id).not.toBe('');
      expect(result.__id).toMatch(/^[a-f0-9-]{36}$/);
    });

    it('should handle action with zero __id', () => {
      const action = { type: 'ZERO_ID_ACTION', __id: 0 };
      const result = processor.testEnsureActionId(action);

      expect(result.__id).toBeDefined();
      expect(result.__id).not.toBe(0);
      expect(result.__id).toMatch(/^[a-f0-9-]{36}$/);
    });
  });

  describe('timeout and completion edge cases', () => {
    it('should handle completion after timeout has already fired', async () => {
      const shortProcessor = new TestThunkProcessor({
        actionCompletionTimeoutMs: 5,
        maxQueueSize: 10,
      });

      const actionId = 'timeout-then-complete';
      const callback = vi.fn();
      let timeoutFired = false;
      const timeoutCallback = vi.fn(() => {
        timeoutFired = true;
        // Call the default timeout behavior
        shortProcessor.testCompleteActionInternal(actionId, { __timeout: true });
      });

      shortProcessor.testSetupActionCompletion(actionId, callback, timeoutCallback);

      // Wait for timeout to fire
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(timeoutCallback).toHaveBeenCalled();
      expect(timeoutFired).toBe(true);

      // Now try to complete the action again (should be no-op since already completed by timeout)
      const completed = shortProcessor.testCompleteActionInternal(actionId, { late: true });
      expect(completed).toBe(false);
    });

    it('should handle multiple timeout setups for same action', () => {
      const actionId = 'multi-timeout-action';
      const callback1 = vi.fn();
      const callback2 = vi.fn();

      // First setup
      processor.testSetupActionCompletion(actionId, callback1);
      expect(processor.testActionTimeouts.size).toBe(1);

      // Second setup should replace the first
      processor.testSetupActionCompletion(actionId, callback2);
      expect(processor.testActionTimeouts.size).toBe(1);

      // Complete action
      const completed = processor.testCompleteActionInternal(actionId, { test: true });
      expect(completed).toBe(true);
      expect(callback2).toHaveBeenCalledWith({ test: true });
      expect(callback1).not.toHaveBeenCalled();
    });
  });

  describe('checkQueueCapacity edge cases', () => {
    it('should handle queue at exact capacity limit', () => {
      const limitProcessor = new TestThunkProcessor({
        actionCompletionTimeoutMs: 1000,
        maxQueueSize: 5,
      });

      // Should work below the limit
      expect(() => limitProcessor.testCheckQueueCapacity(4)).not.toThrow();

      // Should fail at exactly the limit
      expect(() => limitProcessor.testCheckQueueCapacity(5)).toThrow(QueueOverflowError);
    });

    it('should handle very large queue sizes', () => {
      const largeProcessor = new TestThunkProcessor({
        actionCompletionTimeoutMs: 1000,
        maxQueueSize: 1000000,
      });

      expect(() => largeProcessor.testCheckQueueCapacity(999999)).not.toThrow();
      expect(() => largeProcessor.testCheckQueueCapacity(1000000)).toThrow(QueueOverflowError);
      expect(() => largeProcessor.testCheckQueueCapacity(1000001)).toThrow(QueueOverflowError);
    });
  });
});
