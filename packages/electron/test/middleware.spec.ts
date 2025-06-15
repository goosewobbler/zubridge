import { describe, it, expect, vi } from 'vitest';
import { createMiddlewareOptions } from '../src/middleware.js';
import type { Action } from '@zubridge/types';

describe('middleware.ts', () => {
  // Create a mock middleware object
  const mockMiddleware = {
    processAction: vi.fn().mockResolvedValue(undefined),
    setState: vi.fn().mockResolvedValue(undefined),
    destroy: vi.fn().mockResolvedValue(undefined),
  };

  it('should create middleware options with all handlers', () => {
    const options = createMiddlewareOptions(mockMiddleware);

    expect(options).toHaveProperty('beforeProcessAction');
    expect(options).toHaveProperty('afterStateChange');
    expect(options).toHaveProperty('onBridgeDestroy');

    expect(typeof options.beforeProcessAction).toBe('function');
    expect(typeof options.afterStateChange).toBe('function');
    expect(typeof options.onBridgeDestroy).toBe('function');
  });

  it('should call processAction with string payload in beforeProcessAction', async () => {
    const options = createMiddlewareOptions(mockMiddleware);
    const action: Action = { type: 'TEST_ACTION', payload: 'test-payload' };

    await options.beforeProcessAction(action);

    expect(mockMiddleware.processAction).toHaveBeenCalledWith({
      type: 'TEST_ACTION',
      payload: 'test-payload',
    });
  });

  it('should stringify non-string payload in beforeProcessAction', async () => {
    const options = createMiddlewareOptions(mockMiddleware);
    const action: Action = { type: 'TEST_ACTION', payload: { foo: 'bar' } };

    await options.beforeProcessAction(action);

    expect(mockMiddleware.processAction).toHaveBeenCalledWith({
      type: 'TEST_ACTION',
      payload: JSON.stringify({ foo: 'bar' }),
    });
  });

  it('should handle undefined payload in beforeProcessAction', async () => {
    const options = createMiddlewareOptions(mockMiddleware);
    const action: Action = { type: 'TEST_ACTION' };

    await options.beforeProcessAction(action);

    expect(mockMiddleware.processAction).toHaveBeenCalledWith({
      type: 'TEST_ACTION',
      payload: undefined,
    });
  });

  it('should handle errors in beforeProcessAction', async () => {
    const options = createMiddlewareOptions(mockMiddleware);
    mockMiddleware.processAction.mockRejectedValueOnce(new Error('Test error'));

    const action: Action = { type: 'TEST_ACTION' };
    const result = await options.beforeProcessAction(action);

    // Should return the original action even if middleware throws
    expect(result).toBe(action);
  });

  it('should stringify state in afterStateChange', async () => {
    const options = createMiddlewareOptions(mockMiddleware);
    const state = { count: 42 };

    await options.afterStateChange(state);

    expect(mockMiddleware.setState).toHaveBeenCalledWith(JSON.stringify(state));
  });

  it('should handle errors in afterStateChange', async () => {
    const options = createMiddlewareOptions(mockMiddleware);
    mockMiddleware.setState.mockRejectedValueOnce(new Error('Test error'));

    // Should not throw
    await expect(options.afterStateChange({ count: 42 })).resolves.toBeUndefined();
  });

  it('should call destroy in onBridgeDestroy', async () => {
    const options = createMiddlewareOptions(mockMiddleware);

    await options.onBridgeDestroy();

    expect(mockMiddleware.destroy).toHaveBeenCalled();
  });

  it('should handle errors in onBridgeDestroy', async () => {
    const options = createMiddlewareOptions(mockMiddleware);
    mockMiddleware.destroy.mockRejectedValueOnce(new Error('Test error'));

    // Should not throw
    await expect(options.onBridgeDestroy()).resolves.toBeUndefined();
  });
});
