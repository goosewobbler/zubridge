import { describe, expect, it, vi } from 'vitest';
import {
  ActionProcessingError,
  ConfigurationError,
  ensureZubridgeError,
  HandlerResolutionError,
  IpcCommunicationError,
  isErrorOfType,
  isZubridgeError,
  ResourceManagementError,
  SubscriptionError,
  ThunkExecutionError,
  ZubridgeError,
} from '../../src/errors/index.js';

// Mock Date.now to ensure consistent timestamps
const mockTimestamp = 1234567890123;
vi.mock('date', () => ({
  now: () => mockTimestamp,
}));

describe('Zubridge Errors', () => {
  describe('ZubridgeError (base class)', () => {
    it('should create error with message and timestamp', () => {
      const error = new ZubridgeError('Test error');

      expect(error.message).toBe('Test error');
      expect(error.name).toBe('ZubridgeError');
      expect(error.timestamp).toBeDefined();
    });

    it('should include context when provided', () => {
      const context = { userId: 123, action: 'test' };
      const error = new ZubridgeError('Context error', context);

      expect(error.context).toEqual(context);
    });

    it('should generate stack trace', () => {
      const error = new ZubridgeError('Stack test');

      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('Stack test');
    });

    it('should return error details', () => {
      const context = { key: 'value' };
      const error = new ZubridgeError('Details test', context);
      const details = error.getDetails();

      expect(details).toEqual({
        name: 'ZubridgeError',
        message: 'Details test',
        timestamp: expect.any(Number),
        context,
        stack: expect.any(String),
      });
    });

    it('should handle undefined context', () => {
      const error = new ZubridgeError('No context');
      const details = error.getDetails();

      expect(details.context).toBeUndefined();
    });
  });

  describe('IpcCommunicationError', () => {
    it('should create IPC error with channel and windowId', () => {
      const context = { channel: 'test-channel', windowId: 42 };
      const error = new IpcCommunicationError('IPC failed', context);

      expect(error.message).toBe('IPC failed');
      expect(error.name).toBe('IpcCommunicationError');
      expect(error.channel).toBe('test-channel');
      expect(error.windowId).toBe(42);
      expect(error.context).toEqual(context);
    });

    it('should handle missing channel and windowId', () => {
      const error = new IpcCommunicationError('IPC without context');

      expect(error.channel).toBeUndefined();
      expect(error.windowId).toBeUndefined();
    });

    it('should handle partial context', () => {
      const context = { channel: 'test-channel' };
      const error = new IpcCommunicationError('Partial context', context);

      expect(error.channel).toBe('test-channel');
      expect(error.windowId).toBeUndefined();
    });
  });

  describe('ThunkExecutionError', () => {
    it('should create thunk error with all properties', () => {
      const context = { thunkId: 'thunk-123', actionType: 'TEST_ACTION' };
      const error = new ThunkExecutionError('Thunk failed', 'execution', context);

      expect(error.message).toBe('Thunk failed');
      expect(error.name).toBe('ThunkExecutionError');
      expect(error.thunkId).toBe('thunk-123');
      expect(error.actionType).toBe('TEST_ACTION');
      expect(error.phase).toBe('execution');
    });

    it('should handle different phases', () => {
      const registrationError = new ThunkExecutionError('Registration failed', 'registration');
      const completionError = new ThunkExecutionError('Completion failed', 'completion');

      expect(registrationError.phase).toBe('registration');
      expect(completionError.phase).toBe('completion');
    });

    it('should handle missing optional properties', () => {
      const error = new ThunkExecutionError('Minimal thunk error', 'execution');

      expect(error.thunkId).toBeUndefined();
      expect(error.actionType).toBeUndefined();
    });
  });

  describe('ActionProcessingError', () => {
    it('should create action processing error with all properties', () => {
      const context = { handlerName: 'testHandler' };
      const error = new ActionProcessingError('Action failed', 'TEST_ACTION', 'redux', context);

      expect(error.message).toBe('Action failed');
      expect(error.name).toBe('ActionProcessingError');
      expect(error.actionType).toBe('TEST_ACTION');
      expect(error.adapter).toBe('redux');
      expect(error.handlerName).toBe('testHandler');
    });

    it('should handle different adapters', () => {
      const reduxError = new ActionProcessingError('Redux error', 'ACTION', 'redux');
      const zustandError = new ActionProcessingError('Zustand error', 'ACTION', 'zustand');

      expect(reduxError.adapter).toBe('redux');
      expect(zustandError.adapter).toBe('zustand');
    });

    it('should handle missing handler name', () => {
      const error = new ActionProcessingError('No handler', 'ACTION', 'redux');

      expect(error.handlerName).toBeUndefined();
    });
  });

  describe('SubscriptionError', () => {
    it('should create subscription error with all properties', () => {
      const context = { windowId: 123, keys: ['key1', 'key2'] };
      const error = new SubscriptionError('Subscription failed', 'subscribe', context);

      expect(error.message).toBe('Subscription failed');
      expect(error.name).toBe('SubscriptionError');
      expect(error.windowId).toBe(123);
      expect(error.keys).toEqual(['key1', 'key2']);
      expect(error.operation).toBe('subscribe');
    });

    it('should handle different operations', () => {
      const subscribeError = new SubscriptionError('Subscribe error', 'subscribe');
      const unsubscribeError = new SubscriptionError('Unsubscribe error', 'unsubscribe');
      const notifyError = new SubscriptionError('Notify error', 'notify');

      expect(subscribeError.operation).toBe('subscribe');
      expect(unsubscribeError.operation).toBe('unsubscribe');
      expect(notifyError.operation).toBe('notify');
    });

    it('should handle missing optional properties', () => {
      const error = new SubscriptionError('Minimal subscription error', 'subscribe');

      expect(error.windowId).toBeUndefined();
      expect(error.keys).toBeUndefined();
    });
  });

  describe('ResourceManagementError', () => {
    it('should create resource management error with all properties', () => {
      const context = { queueSize: 10, maxSize: 100 };
      const error = new ResourceManagementError(
        'Resource error',
        'action_queue',
        'overflow',
        context,
      );

      expect(error.message).toBe('Resource error');
      expect(error.name).toBe('ResourceManagementError');
      expect(error.resourceType).toBe('action_queue');
      expect(error.operation).toBe('overflow');
      expect(error.context).toEqual(context);
    });

    it('should handle different operations', () => {
      const createError = new ResourceManagementError('Create error', 'resource', 'create');
      const cleanupError = new ResourceManagementError('Cleanup error', 'resource', 'cleanup');
      const destroyError = new ResourceManagementError('Destroy error', 'resource', 'destroy');
      const enqueueError = new ResourceManagementError('Enqueue error', 'resource', 'enqueue');

      expect(createError.operation).toBe('create');
      expect(cleanupError.operation).toBe('cleanup');
      expect(destroyError.operation).toBe('destroy');
      expect(enqueueError.operation).toBe('enqueue');
    });
  });

  describe('HandlerResolutionError', () => {
    it('should create handler resolution error with all properties', () => {
      const context = { cacheHit: false };
      const error = new HandlerResolutionError(
        'Handler not found',
        'TEST_ACTION',
        'resolution',
        context,
      );

      expect(error.message).toBe('Handler not found');
      expect(error.name).toBe('HandlerResolutionError');
      expect(error.actionType).toBe('TEST_ACTION');
      expect(error.phase).toBe('resolution');
      expect(error.context).toEqual(context);
    });

    it('should handle different phases', () => {
      const resolutionError = new HandlerResolutionError(
        'Resolution error',
        'ACTION',
        'resolution',
      );
      const cacheError = new HandlerResolutionError('Cache error', 'ACTION', 'cache');
      const executionError = new HandlerResolutionError('Execution error', 'ACTION', 'execution');

      expect(resolutionError.phase).toBe('resolution');
      expect(cacheError.phase).toBe('cache');
      expect(executionError.phase).toBe('execution');
    });
  });

  describe('ConfigurationError', () => {
    it('should create configuration error with all properties', () => {
      const context = {
        configPath: 'app.settings.theme',
        expectedType: 'string',
        actualType: 'number',
      };
      const error = new ConfigurationError('Config validation failed', context);

      expect(error.message).toBe('Config validation failed');
      expect(error.name).toBe('ConfigurationError');
      expect(error.configPath).toBe('app.settings.theme');
      expect(error.expectedType).toBe('string');
      expect(error.actualType).toBe('number');
    });

    it('should handle missing optional properties', () => {
      const error = new ConfigurationError('Minimal config error');

      expect(error.configPath).toBeUndefined();
      expect(error.expectedType).toBeUndefined();
      expect(error.actualType).toBeUndefined();
    });
  });

  describe('Type Guards', () => {
    it('should identify ZubridgeError instances', () => {
      const zubridgeError = new ZubridgeError('Test');
      const regularError = new Error('Regular');
      const stringError = 'string error';

      expect(isZubridgeError(zubridgeError)).toBe(true);
      expect(isZubridgeError(regularError)).toBe(false);
      expect(isZubridgeError(stringError)).toBe(false);
      expect(isZubridgeError(null)).toBe(false);
      expect(isZubridgeError(undefined)).toBe(false);
    });

    it('should identify specific error types', () => {
      const ipcError = new IpcCommunicationError('IPC error');
      const thunkError = new ThunkExecutionError('Thunk error', 'execution');
      const actionError = new ActionProcessingError('Action error', 'TEST', 'redux');
      const zubridgeError = new ZubridgeError('Generic error');

      expect(isErrorOfType(ipcError, IpcCommunicationError)).toBe(true);
      expect(isErrorOfType(thunkError, ThunkExecutionError)).toBe(true);
      expect(isErrorOfType(actionError, ActionProcessingError)).toBe(true);
      expect(isErrorOfType(zubridgeError, IpcCommunicationError)).toBe(false);
      expect(isErrorOfType(new Error(), IpcCommunicationError)).toBe(false);
    });
  });

  describe('ensureZubridgeError', () => {
    it('should return ZubridgeError instances unchanged', () => {
      const originalError = new IpcCommunicationError('Original error');
      const result = ensureZubridgeError(originalError);

      expect(result).toBe(originalError);
      expect(result).toBeInstanceOf(IpcCommunicationError);
    });

    it('should convert regular Error to ZubridgeError', () => {
      const originalError = new Error('Regular error');
      originalError.name = 'CustomError';
      const result = ensureZubridgeError(originalError);

      expect(result).toBeInstanceOf(ZubridgeError);
      expect(result.message).toBe('Regular error');
      expect(result.name).toBe('CustomError');
      expect(result.stack).toBe(originalError.stack);
    });

    it('should convert string errors', () => {
      const result = ensureZubridgeError('String error message');

      expect(result).toBeInstanceOf(ZubridgeError);
      expect(result.message).toBe('String error message');
    });

    it('should convert non-string non-Error values', () => {
      const result = ensureZubridgeError({ custom: 'object' });

      expect(result).toBeInstanceOf(ZubridgeError);
      expect(result.message).toBe('Unknown error');
      expect(result.context).toEqual({
        originalError: { custom: 'object' },
        originalType: 'object',
      });
    });

    it('should convert null and undefined', () => {
      const nullResult = ensureZubridgeError(null);
      const undefinedResult = ensureZubridgeError(undefined);

      expect(nullResult).toBeInstanceOf(ZubridgeError);
      expect(nullResult.message).toBe('Unknown error');
      expect(nullResult.context?.originalError).toBe(null);
      expect(nullResult.context?.originalType).toBe('object');

      expect(undefinedResult).toBeInstanceOf(ZubridgeError);
      expect(undefinedResult.message).toBe('Unknown error');
    });

    it('should use custom fallback message', () => {
      const result = ensureZubridgeError(42, 'Custom fallback');

      expect(result).toBeInstanceOf(ZubridgeError);
      expect(result.message).toBe('Custom fallback');
    });
  });

  describe('Error Inheritance', () => {
    it('should maintain inheritance chain', () => {
      const ipcError = new IpcCommunicationError('Test');
      const thunkError = new ThunkExecutionError('Test', 'execution');
      const actionError = new ActionProcessingError('Test', 'ACTION', 'redux');

      // All should be instances of ZubridgeError
      expect(ipcError).toBeInstanceOf(ZubridgeError);
      expect(thunkError).toBeInstanceOf(ZubridgeError);
      expect(actionError).toBeInstanceOf(ZubridgeError);

      // Should be instances of Error
      expect(ipcError).toBeInstanceOf(Error);
      expect(thunkError).toBeInstanceOf(Error);
      expect(actionError).toBeInstanceOf(Error);
    });

    it('should preserve error names', () => {
      expect(new IpcCommunicationError('test').name).toBe('IpcCommunicationError');
      expect(new ThunkExecutionError('test', 'execution').name).toBe('ThunkExecutionError');
      expect(new ActionProcessingError('test', 'ACTION', 'redux').name).toBe(
        'ActionProcessingError',
      );
      expect(new SubscriptionError('test', 'subscribe').name).toBe('SubscriptionError');
      expect(new ResourceManagementError('test', 'resource', 'create').name).toBe(
        'ResourceManagementError',
      );
      expect(new HandlerResolutionError('test', 'ACTION', 'resolution').name).toBe(
        'HandlerResolutionError',
      );
      expect(new ConfigurationError('test').name).toBe('ConfigurationError');
    });
  });

  describe('Error Context Handling', () => {
    it('should merge additional context properties', () => {
      const context = {
        channel: 'test-channel',
        windowId: 42,
        extraProp: 'extra-value',
        nested: { key: 'value' },
      };
      const error = new IpcCommunicationError('Test', context);

      expect(error.context).toEqual(context);
      expect(error.channel).toBe('test-channel');
      expect(error.windowId).toBe(42);
    });

    it('should handle empty context objects', () => {
      const error = new ZubridgeError('Test', {});

      expect(error.context).toEqual({});
    });

    it('should handle context with undefined values', () => {
      const context = { defined: 'value', undefined: undefined };
      const error = new ZubridgeError('Test', context);

      expect(error.context).toEqual(context);
    });
  });
});
