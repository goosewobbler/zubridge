import type { AnyState } from '@zubridge/types';
import { describe, expect, it, vi } from 'vitest';
import { createMiddlewareOptions, type ZubridgeMiddleware } from '../src/middleware.js';

// Mock the debug function
vi.mock('@zubridge/core', () => ({
  debug: vi.fn(),
}));

describe('Middleware', () => {
  describe('createMiddlewareOptions', () => {
    it('should create middleware options with all required functions', () => {
      const mockMiddleware: ZubridgeMiddleware = {
        processAction: vi.fn().mockResolvedValue(undefined),
        setState: vi.fn().mockResolvedValue(undefined),
        destroy: vi.fn().mockResolvedValue(undefined),
      };

      const options = createMiddlewareOptions(mockMiddleware);

      expect(options).toHaveProperty('beforeProcessAction');
      expect(options).toHaveProperty('afterStateChange');
      expect(options).toHaveProperty('onBridgeDestroy');
      expect(typeof options.beforeProcessAction).toBe('function');
      expect(typeof options.afterStateChange).toBe('function');
      expect(typeof options.onBridgeDestroy).toBe('function');
    });

    it('should handle beforeProcessAction with string payload', async () => {
      const mockMiddleware: ZubridgeMiddleware = {
        processAction: vi.fn().mockResolvedValue(undefined),
        setState: vi.fn().mockResolvedValue(undefined),
      };

      const options = createMiddlewareOptions(mockMiddleware);
      const action = {
        type: 'TEST_ACTION',
        payload: 'string payload',
        __id: 'test-id',
      };

      const result = await options.beforeProcessAction(action);

      expect(result).toBe(action); // Should return original action
      expect(mockMiddleware.processAction).toHaveBeenCalledWith({
        type: 'TEST_ACTION',
        payload: 'string payload',
      });
    });

    it('should handle beforeProcessAction with object payload', async () => {
      const mockMiddleware: ZubridgeMiddleware = {
        processAction: vi.fn().mockResolvedValue(undefined),
        setState: vi.fn().mockResolvedValue(undefined),
      };

      const options = createMiddlewareOptions(mockMiddleware);
      const action = {
        type: 'TEST_ACTION',
        payload: { key: 'value' },
        __id: 'test-id',
      };

      const result = await options.beforeProcessAction(action);

      expect(result).toBe(action);
      expect(mockMiddleware.processAction).toHaveBeenCalledWith({
        type: 'TEST_ACTION',
        payload: JSON.stringify({ key: 'value' }),
      });
    });

    it('should handle beforeProcessAction with no payload', async () => {
      const mockMiddleware: ZubridgeMiddleware = {
        processAction: vi.fn().mockResolvedValue(undefined),
        setState: vi.fn().mockResolvedValue(undefined),
      };

      const options = createMiddlewareOptions(mockMiddleware);
      const action = {
        type: 'TEST_ACTION',
        __id: 'test-id',
      };

      const result = await options.beforeProcessAction(action);

      expect(result).toBe(action);
      expect(mockMiddleware.processAction).toHaveBeenCalledWith({
        type: 'TEST_ACTION',
        payload: undefined,
      });
    });

    it('should handle beforeProcessAction with null payload', async () => {
      const mockMiddleware: ZubridgeMiddleware = {
        processAction: vi.fn().mockResolvedValue(undefined),
        setState: vi.fn().mockResolvedValue(undefined),
      };

      const options = createMiddlewareOptions(mockMiddleware);
      const action = {
        type: 'TEST_ACTION',
        payload: null,
        __id: 'test-id',
      };

      const result = await options.beforeProcessAction(action);

      expect(result).toBe(action);
      expect(mockMiddleware.processAction).toHaveBeenCalledWith({
        type: 'TEST_ACTION',
        payload: undefined,
      });
    });

    it('should handle JSON stringify errors in beforeProcessAction', async () => {
      const mockMiddleware: ZubridgeMiddleware = {
        processAction: vi.fn().mockResolvedValue(undefined),
        setState: vi.fn().mockResolvedValue(undefined),
      };

      const options = createMiddlewareOptions(mockMiddleware);

      // Create an object that will cause JSON.stringify to throw
      const circularObj = { prop: null } as AnyState;
      circularObj.prop = circularObj;

      const action = {
        type: 'TEST_ACTION',
        payload: circularObj,
        __id: 'test-id',
      };

      const result = await options.beforeProcessAction(action);

      expect(result).toBe(action);
      expect(mockMiddleware.processAction).toHaveBeenCalledWith({
        type: 'TEST_ACTION',
        payload: JSON.stringify({ error: 'Payload stringification failed' }),
      });
    });

    it('should handle middleware processAction errors gracefully', async () => {
      const mockMiddleware: ZubridgeMiddleware = {
        processAction: vi.fn().mockRejectedValue(new Error('Middleware error')),
        setState: vi.fn().mockResolvedValue(undefined),
      };

      const options = createMiddlewareOptions(mockMiddleware);
      const action = {
        type: 'TEST_ACTION',
        __id: 'test-id',
      };

      const result = await options.beforeProcessAction(action);

      expect(result).toBe(action);
      expect(mockMiddleware.processAction).toHaveBeenCalledWith({
        type: 'TEST_ACTION',
        payload: undefined,
      });
    });

    it('should handle afterStateChange with valid state', async () => {
      const mockMiddleware: ZubridgeMiddleware = {
        processAction: vi.fn().mockResolvedValue(undefined),
        setState: vi.fn().mockResolvedValue(undefined),
      };

      const options = createMiddlewareOptions(mockMiddleware);
      const state = { counter: 42, user: { name: 'test' } };

      await options.afterStateChange(state);

      expect(mockMiddleware.setState).toHaveBeenCalledWith(JSON.stringify(state));
    });

    it('should handle JSON stringify errors in afterStateChange', async () => {
      const mockMiddleware: ZubridgeMiddleware = {
        processAction: vi.fn().mockResolvedValue(undefined),
        setState: vi.fn().mockResolvedValue(undefined),
      };

      const options = createMiddlewareOptions(mockMiddleware);

      // Create circular reference
      const circularState = { prop: null } as AnyState;
      circularState.prop = circularState;

      await options.afterStateChange(circularState);

      expect(mockMiddleware.setState).toHaveBeenCalledWith(
        JSON.stringify({ error: 'State stringification failed' }),
      );
    });

    it('should handle middleware setState errors gracefully', async () => {
      const mockMiddleware: ZubridgeMiddleware = {
        processAction: vi.fn().mockResolvedValue(undefined),
        setState: vi.fn().mockRejectedValue(new Error('Middleware error')),
      };

      const options = createMiddlewareOptions(mockMiddleware);
      const state = { counter: 42 };

      await options.afterStateChange(state);

      expect(mockMiddleware.setState).toHaveBeenCalledWith(JSON.stringify(state));
    });

    it('should handle onBridgeDestroy with destroy method', async () => {
      const mockMiddleware: ZubridgeMiddleware = {
        processAction: vi.fn().mockResolvedValue(undefined),
        setState: vi.fn().mockResolvedValue(undefined),
        destroy: vi.fn().mockResolvedValue(undefined),
      };

      const options = createMiddlewareOptions(mockMiddleware);

      await options.onBridgeDestroy();

      expect(mockMiddleware.destroy).toHaveBeenCalled();
    });

    it('should handle onBridgeDestroy without destroy method', async () => {
      const mockMiddleware: ZubridgeMiddleware = {
        processAction: vi.fn().mockResolvedValue(undefined),
        setState: vi.fn().mockResolvedValue(undefined),
      };

      const options = createMiddlewareOptions(mockMiddleware);

      await options.onBridgeDestroy();

      expect(mockMiddleware.destroy).toBeUndefined();
    });

    it('should handle destroy method errors gracefully', async () => {
      const mockMiddleware: ZubridgeMiddleware = {
        processAction: vi.fn().mockResolvedValue(undefined),
        setState: vi.fn().mockResolvedValue(undefined),
        destroy: vi.fn().mockRejectedValue(new Error('Destroy error')),
      };

      const options = createMiddlewareOptions(mockMiddleware);

      await options.onBridgeDestroy();

      expect(mockMiddleware.destroy).toHaveBeenCalled();
    });

    it('should handle middleware with optional performance tracking methods', () => {
      const mockMiddleware: ZubridgeMiddleware = {
        processAction: vi.fn().mockResolvedValue(undefined),
        setState: vi.fn().mockResolvedValue(undefined),
        trackActionDispatch: vi.fn().mockResolvedValue(undefined),
        trackActionReceived: vi.fn().mockResolvedValue(undefined),
        trackStateUpdate: vi.fn().mockResolvedValue(undefined),
        trackActionAcknowledged: vi.fn().mockResolvedValue(undefined),
      };

      const options = createMiddlewareOptions(mockMiddleware);

      expect(options).toHaveProperty('beforeProcessAction');
      expect(options).toHaveProperty('afterStateChange');
      expect(options).toHaveProperty('onBridgeDestroy');

      expect(mockMiddleware.trackActionDispatch).toBeDefined();
      expect(mockMiddleware.trackActionReceived).toBeDefined();
      expect(mockMiddleware.trackStateUpdate).toBeDefined();
      expect(mockMiddleware.trackActionAcknowledged).toBeDefined();
    });
  });
});
