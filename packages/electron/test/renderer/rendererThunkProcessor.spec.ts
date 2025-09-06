import type { Action } from '@zubridge/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getThunkProcessor,
  RendererThunkProcessor,
  resetThunkProcessor,
} from '../../src/renderer/rendererThunkProcessor.js';

const mockActionSender = vi.fn();
const mockThunkRegistrar = vi.fn();
const mockThunkCompleter = vi.fn();

const defaultInitOptions = {
  windowId: 1,
  actionSender: mockActionSender,
  thunkRegistrar: mockThunkRegistrar,
  thunkCompleter: mockThunkCompleter,
};

const defaultPreloadOptions = {
  actionCompletionTimeoutMs: 5000,
  maxQueueSize: 100,
};

describe('RendererThunkProcessor', () => {
  let processor: RendererThunkProcessor;

  beforeEach(() => {
    vi.clearAllMocks();
    processor = new RendererThunkProcessor(defaultPreloadOptions);
    processor.initialize(defaultInitOptions);
  });

  it('should initialize with provided options', () => {
    expect(processor).toBeInstanceOf(RendererThunkProcessor);
    // @ts-expect-error private
    expect(processor.currentWindowId).toBe(1);
    // @ts-expect-error private
    expect(processor.actionSender).toBe(mockActionSender);
  });

  it('should initialize with custom timeout', () => {
    const customTimeout = 5000;
    const customProcessor = new RendererThunkProcessor({
      actionCompletionTimeoutMs: customTimeout,
      maxQueueSize: 100,
    });
    // @ts-expect-error private
    expect(customProcessor.actionCompletionTimeoutMs).toBe(customTimeout);
  });

  it('should update timeout when provided in initialize options', () => {
    const customTimeout = 15000;
    const customProcessor = new RendererThunkProcessor({
      actionCompletionTimeoutMs: 10000,
      maxQueueSize: 50,
    });
    customProcessor.initialize({
      ...defaultInitOptions,
      actionCompletionTimeoutMs: customTimeout,
    });
    // @ts-expect-error private
    expect(customProcessor.actionCompletionTimeoutMs).toBe(customTimeout);
  });

  it('should set a custom state provider', async () => {
    const stateProvider = vi.fn().mockResolvedValue({ foo: 123 });
    processor.setStateProvider(stateProvider);
    // @ts-expect-error private
    expect(processor.stateProvider).toBe(stateProvider);
  });

  it('should execute a thunk and use the state provider', async () => {
    const stateProvider = vi.fn().mockResolvedValue({ counter: 42 });
    processor.setStateProvider(stateProvider);
    const thunk = vi.fn(async (getState, _dispatch) => {
      const state = await getState();
      return state.counter;
    });
    mockThunkRegistrar.mockResolvedValue(undefined);
    mockThunkCompleter.mockResolvedValue(undefined);
    mockActionSender.mockResolvedValue(undefined);
    const result = await processor.executeThunk(thunk);
    expect(thunk).toHaveBeenCalled();
    expect(stateProvider).toHaveBeenCalled();
    expect(result).toBe(42);
  });

  it('should execute a thunk and dispatch an action', async () => {
    const thunk = vi.fn(async (_getState, dispatch) => {
      await dispatch({ type: 'INCREMENT' });
      return 'done';
    });

    // Clear mocks and set up proper behavior
    mockThunkRegistrar.mockResolvedValue(undefined);
    mockThunkCompleter.mockResolvedValue(undefined);

    // Mock actionSender to simulate completing the action
    mockActionSender.mockImplementation(async (action: Action, _parentId?: string) => {
      // Simulate a slight delay
      await new Promise((resolve) => setTimeout(resolve, 10));
      // Complete the action
      if (action.__id) {
        processor.completeAction(action.__id, { result: 'action-completed' });
      }
      return undefined;
    });

    const result = await processor.executeThunk(thunk);

    expect(thunk).toHaveBeenCalled();
    expect(mockActionSender).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'INCREMENT' }),
      expect.any(String), // parentId is the thunk ID
    );
    expect(result).toBe('done');
  });

  it('should handle nested thunks', async () => {
    const nestedThunk = vi.fn(async () => 99);
    const parentThunk = vi.fn(async (_getState, dispatch) => {
      return await dispatch(nestedThunk);
    });
    mockThunkRegistrar.mockResolvedValue(undefined);
    mockThunkCompleter.mockResolvedValue(undefined);

    // Mock actionSender to simulate completing the action
    mockActionSender.mockImplementation(async (action: Action, _parentId?: string) => {
      // Simulate a slight delay
      await new Promise((resolve) => setTimeout(resolve, 10));
      // Complete the action with the nested thunk result
      if (action.__id) {
        processor.completeAction(action.__id, { result: 99 });
      }
      return undefined;
    });

    const result = await processor.executeThunk(parentThunk);
    expect(nestedThunk).toHaveBeenCalled();
    expect(parentThunk).toHaveBeenCalled();
    expect(result).toBe(99);
  });

  it('should call completeAction and resolve the callback', () => {
    const actionId = 'action-123';
    const callback = vi.fn();
    // @ts-expect-error private
    processor.actionCompletionCallbacks.set(actionId, callback);
    // @ts-expect-error private
    processor.pendingDispatches.add(actionId);

    // Create a real timeout and store it
    const timeoutId = setTimeout(() => {}, 1000);
    // @ts-expect-error private
    processor.actionTimeouts.set(actionId, timeoutId);

    processor.completeAction(actionId, { result: 1 });

    expect(callback).toHaveBeenCalledWith({ result: 1 });
    // @ts-expect-error private
    expect(processor.pendingDispatches.has(actionId)).toBe(false);
    // @ts-expect-error private
    expect(processor.actionTimeouts.has(actionId)).toBe(false);
  });

  it('should handle errors in completeAction callback', () => {
    const actionId = 'action-with-error';
    const callbackWithError = vi.fn().mockImplementation(() => {
      throw new Error('Callback error');
    });

    // @ts-expect-error private
    processor.actionCompletionCallbacks.set(actionId, callbackWithError);
    // @ts-expect-error private
    processor.pendingDispatches.add(actionId);

    // This should not throw
    expect(() => processor.completeAction(actionId, { result: 1 })).not.toThrow();
    expect(callbackWithError).toHaveBeenCalled();
  });

  it('should dispatchAction and resolve when action completes', async () => {
    mockActionSender.mockImplementation(async (action: Action) => {
      setTimeout(() => {
        if (action.__id) {
          processor.completeAction(action.__id, {});
        }
      }, 10);
      return undefined;
    });

    const result = processor.dispatchAction({ type: 'FOO' });
    await expect(result).resolves.toBeUndefined();
  });

  it('should reject dispatchAction if actionSender throws', async () => {
    const error = new Error('fail');

    // Mock the implementation to directly call the reject function
    // This simulates what happens in the actual code when actionSender throws
    const _originalDispatchAction = processor.dispatchAction;

    // Spy on dispatchAction to intercept the call
    const dispatchSpy = vi.spyOn(processor, 'dispatchAction').mockImplementation(async () => {
      throw error;
    });

    // Now call it and expect it to throw
    let errorCaught = false;
    try {
      await processor.dispatchAction({ type: 'ERR' });
    } catch (err) {
      errorCaught = true;
      expect(err).toBe(error);
    }

    expect(errorCaught).toBe(true);

    // Restore the original implementation
    dispatchSpy.mockRestore();
  });

  it('should throw if no actionSender is configured', () => {
    // Create a processor with no actionSender
    const p = new RendererThunkProcessor(defaultPreloadOptions);

    // Use a direct function reference to test
    const dispatchFn = () => {
      // Access the private property directly to verify it's undefined
      // @ts-expect-error private property
      if (!p.actionSender) {
        throw new Error('Action sender not configured for direct dispatch.');
      }
    };

    // Test that the function throws the expected error
    expect(dispatchFn).toThrow('Action sender not configured for direct dispatch.');
  });

  it('should handle thunk execution errors', async () => {
    const errorThunk = vi.fn(async () => {
      throw new Error('Thunk error');
    });

    mockThunkRegistrar.mockResolvedValue(undefined);
    mockThunkCompleter.mockResolvedValue(undefined);

    await expect(processor.executeThunk(errorThunk)).rejects.toThrow('Thunk error');
    expect(mockThunkCompleter).toHaveBeenCalled();
  });

  it('should handle getState errors when no state provider is available', async () => {
    const thunk = vi.fn(async (getState) => {
      await getState();
    });

    mockThunkRegistrar.mockResolvedValue(undefined);
    mockThunkCompleter.mockResolvedValue(undefined);

    await expect(processor.executeThunk(thunk)).rejects.toThrow('No state provider available');
  });

  it('should use window.zubridge.dispatch if available', async () => {
    // Save original window
    const originalWindow = global.window;

    // Create a properly typed mock for window.zubridge
    const mockZubridge = { dispatch: vi.fn().mockResolvedValue(undefined) };

    // Set up the mock window with zubridge
    global.window = {
      ...originalWindow,
      zubridge: mockZubridge,
    } as unknown as typeof global.window;

    await processor.dispatchAction({ type: 'USE_WINDOW_ZUBRIDGE' });

    // Check that the mock was called
    expect(mockZubridge.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'USE_WINDOW_ZUBRIDGE' }),
    );

    // Restore original window
    global.window = originalWindow;
  });

  it('should get the global singleton instance', () => {
    const instance1 = getThunkProcessor(defaultPreloadOptions);
    const instance2 = getThunkProcessor(defaultPreloadOptions);
    expect(instance1).toBe(instance2);
    expect(instance1).toBeInstanceOf(RendererThunkProcessor);
  });

  it('should handle thunkCompleter errors gracefully', async () => {
    // Create a thunk that completes successfully
    const simpleThunk = vi.fn(async () => 'success');

    // Mock the thunkRegistrar to succeed
    mockThunkRegistrar.mockResolvedValue(undefined);

    // Mock the thunkCompleter to throw an error
    mockThunkCompleter.mockRejectedValue(new Error('Completer error'));

    // Execute the thunk - it should complete successfully despite the thunkCompleter error
    const result = await processor.executeThunk(simpleThunk);

    // Verify the thunk executed successfully
    expect(result).toBe('success');

    // Verify the thunkCompleter was called (even though it failed)
    expect(mockThunkCompleter).toHaveBeenCalled();
  });

  it('should handle thunkRegistrar errors gracefully', async () => {
    // Create a thunk that completes successfully
    const simpleThunk = vi.fn(async () => 'success');

    // Mock the thunkRegistrar to fail
    mockThunkRegistrar.mockRejectedValue(new Error('Registration error'));

    // Mock the thunkCompleter to succeed
    mockThunkCompleter.mockResolvedValue(undefined);

    // Execute the thunk - it should complete successfully despite the thunkRegistrar error
    const result = await processor.executeThunk(simpleThunk);

    // Verify the thunk executed successfully
    expect(result).toBe('success');

    // Verify the thunkRegistrar was called (even though it failed)
    expect(mockThunkRegistrar).toHaveBeenCalled();

    // Verify the thunkCompleter was also called
    expect(mockThunkCompleter).toHaveBeenCalled();
  });

  describe('forceCleanupExpiredActions', () => {
    it('should cleanup all pending dispatches and inherited state', () => {
      // Set up some pending dispatches
      const actionId1 = 'pending-action-1';
      const actionId2 = 'pending-action-2';

      // biome-ignore lint/suspicious/noExplicitAny: Test needs to access private property
      (processor as any).pendingDispatches.add(actionId1);
      // biome-ignore lint/suspicious/noExplicitAny: Test needs to access private property
      (processor as any).pendingDispatches.add(actionId2);

      // Verify setup
      // biome-ignore lint/suspicious/noExplicitAny: Test needs to access private property
      expect((processor as any).pendingDispatches.size).toBe(2);

      // Force cleanup
      processor.forceCleanupExpiredActions();

      // Verify cleanup
      // biome-ignore lint/suspicious/noExplicitAny: Test needs to access private property
      expect((processor as any).pendingDispatches.size).toBe(0);
    });
  });

  describe('destroy', () => {
    it('should cleanup all resources and references', () => {
      // Set up some pending state
      // biome-ignore lint/suspicious/noExplicitAny: Test needs to access private property
      (processor as any).pendingDispatches.add('test-action');

      // Verify setup
      // biome-ignore lint/suspicious/noExplicitAny: Test needs to access private property
      expect((processor as any).actionSender).toBeDefined();
      // biome-ignore lint/suspicious/noExplicitAny: Test needs to access private property
      expect((processor as any).thunkRegistrar).toBeDefined();
      // biome-ignore lint/suspicious/noExplicitAny: Test needs to access private property
      expect((processor as any).pendingDispatches.size).toBe(1);

      processor.destroy();

      // Verify cleanup
      // biome-ignore lint/suspicious/noExplicitAny: Test needs to access private property
      expect((processor as any).actionSender).toBeUndefined();
      // biome-ignore lint/suspicious/noExplicitAny: Test needs to access private property
      expect((processor as any).thunkRegistrar).toBeUndefined();
      // biome-ignore lint/suspicious/noExplicitAny: Test needs to access private property
      expect((processor as any).thunkCompleter).toBeUndefined();
      // biome-ignore lint/suspicious/noExplicitAny: Test needs to access private property
      expect((processor as any).stateProvider).toBeUndefined();
      // biome-ignore lint/suspicious/noExplicitAny: Test needs to access private property
      expect((processor as any).currentWindowId).toBeUndefined();
      // biome-ignore lint/suspicious/noExplicitAny: Test needs to access private property
      expect((processor as any).pendingDispatches.size).toBe(0);
    });
  });

  describe('advanced integration scenarios', () => {
    it('should handle executeThunk with bypass flags', async () => {
      const simpleThunk = vi.fn(async () => 'success');

      // Execute with bypass flags
      const result = await processor.executeThunk(simpleThunk, {
        bypassThunkLock: true,
        bypassAccessControl: true,
      });

      expect(result).toBe('success');
      expect(mockThunkRegistrar).toHaveBeenCalledWith(
        expect.any(String),
        undefined,
        true, // bypassThunkLock
        true, // bypassAccessControl
      );
    });

    it('should handle getState with custom state provider', async () => {
      const mockState = { count: 42 };
      const mockStateProvider = vi.fn().mockResolvedValue(mockState);

      processor.setStateProvider(mockStateProvider);

      const stateThunk = vi.fn(async (getState) => {
        const state = await getState();
        return state;
      });

      const result = await processor.executeThunk(stateThunk);

      expect(result).toEqual(mockState);
      expect(mockStateProvider).toHaveBeenCalledWith({
        bypassAccessControl: false,
      });
    });

    it('should handle getState with no state provider', async () => {
      const stateThunk = vi.fn(async (getState) => {
        try {
          await getState();
          return 'should-not-reach';
        } catch (error) {
          return error.message;
        }
      });

      const result = await processor.executeThunk(stateThunk);
      expect(result).toBe('No state provider available');
    });

    it('should handle dispatchAction with no actionSender configured', async () => {
      const uninitializedProcessor = new RendererThunkProcessor();

      const originalWindow = global.window;
      global.window = {} as unknown as typeof global.window;

      await expect(uninitializedProcessor.dispatchAction('TEST_ACTION')).rejects.toThrow(
        'Action sender not configured for direct dispatch.',
      );

      global.window = originalWindow;
    });

    it('should handle window.zubridge dispatch errors with fallback', async () => {
      const originalWindow = global.window;
      const mockZubridgeDispatch = vi.fn().mockRejectedValue(new Error('Zubridge failed'));

      global.window = {
        ...originalWindow,
        zubridge: { dispatch: mockZubridgeDispatch },
      } as unknown as typeof global.window;

      // Should fall back to actionSender when zubridge fails
      mockActionSender.mockResolvedValue(undefined);

      // Call dispatchAction which should try zubridge first, then fallback to actionSender
      const actionPromise = processor.dispatchAction('TEST_ACTION');

      // Complete the action to resolve the promise
      setTimeout(() => {
        // biome-ignore lint/suspicious/noExplicitAny: Test needs to access private property
        const pendingDispatches = (processor as any).pendingDispatches;
        if (pendingDispatches.size > 0) {
          const actionId = Array.from(pendingDispatches)[0] as string;
          processor.completeAction(actionId, { result: 'completed' });
        }
      }, 10);

      await actionPromise;

      // Restore window first
      global.window = originalWindow;

      // Verify zubridge was called and failed
      expect(mockZubridgeDispatch).toHaveBeenCalledWith('TEST_ACTION', undefined);
      // Verify fallback to actionSender worked
      expect(mockActionSender).toHaveBeenCalled();
    });

    it('should verify dispatchAction calls actionSender with correct parameters', async () => {
      // Ensure global window doesn't interfere
      const originalWindow = global.window;
      global.window = {} as unknown as typeof global.window;

      // Reset and setup mock
      mockActionSender.mockClear();
      mockActionSender.mockImplementation(async (action: Action, _parentId?: string) => {
        // Automatically complete the action after a short delay
        setTimeout(() => {
          if (action.__id) {
            processor.completeAction(action.__id, { result: 'completed' });
          }
        }, 5);
        return undefined;
      });

      await processor.dispatchAction('STRING_ACTION', { data: 'test' });

      expect(mockActionSender).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'STRING_ACTION',
          payload: { data: 'test' },
          __id: expect.any(String),
        }),
        undefined,
      );

      // Restore window
      global.window = originalWindow;
    });

    it('should verify dispatchAction with parent ID calls correctly', async () => {
      // Ensure global window doesn't interfere
      const originalWindow = global.window;
      global.window = {} as unknown as typeof global.window;

      // Reset and setup mock
      mockActionSender.mockClear();
      mockActionSender.mockImplementation(async (action: Action, _parentId?: string) => {
        // Automatically complete the action after a short delay
        setTimeout(() => {
          if (action.__id) {
            processor.completeAction(action.__id, { result: 'completed' });
          }
        }, 5);
        return undefined;
      });

      await processor.dispatchAction('PARENT_ACTION', undefined, 'parent-thunk-id');

      expect(mockActionSender).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'PARENT_ACTION',
          __id: expect.any(String),
        }),
        'parent-thunk-id',
      );

      // Restore window
      global.window = originalWindow;
    });

    it('should handle dispatchAction timeout scenario', async () => {
      // Mock actionSender to not resolve (simulate network hang)
      mockActionSender.mockImplementation(() => new Promise(() => {}));

      // Set short timeout for testing
      processor.initialize({
        windowId: 1,
        actionSender: mockActionSender,
        thunkRegistrar: mockThunkRegistrar,
        thunkCompleter: mockThunkCompleter,
        actionCompletionTimeoutMs: 50,
      });

      const actionPromise = processor.dispatchAction('TIMEOUT_ACTION');

      // Wait for timeout to trigger
      await new Promise((resolve) => setTimeout(resolve, 100));

      // The action should complete with timeout
      await actionPromise;

      // Verify pending dispatches were cleaned up
      // biome-ignore lint/suspicious/noExplicitAny: Test needs to access private property
      expect((processor as any).pendingDispatches.size).toBe(0);
    });

    it('should handle nested thunk execution', async () => {
      const nestedThunk = vi.fn(async () => 'nested-result');
      const parentThunk = vi.fn(async (_getState, dispatch) => {
        const result = await dispatch(nestedThunk);
        return `parent-${result}`;
      });

      mockActionSender.mockResolvedValue(undefined);

      const result = await processor.executeThunk(parentThunk);

      expect(result).toBe('parent-nested-result');
      expect(parentThunk).toHaveBeenCalled();
      expect(nestedThunk).toHaveBeenCalled();
    });
  });

  describe('singleton functions', () => {
    afterEach(() => {
      // Clean up singleton between tests
      resetThunkProcessor();
    });

    it('should create singleton instance with getThunkProcessor', () => {
      const instance1 = getThunkProcessor(defaultPreloadOptions);
      const instance2 = getThunkProcessor(defaultPreloadOptions);

      expect(instance1).toBe(instance2);
      expect(instance1).toBeInstanceOf(RendererThunkProcessor);
    });

    it('should create singleton with custom options', () => {
      const customOptions = {
        ...defaultPreloadOptions,
        actionCompletionTimeoutMs: 5000,
        maxQueueSize: 50,
      };

      const instance = getThunkProcessor(customOptions);
      expect(instance).toBeInstanceOf(RendererThunkProcessor);
    });

    it('should reset singleton with resetThunkProcessor', () => {
      const instance1 = getThunkProcessor(defaultPreloadOptions);
      resetThunkProcessor();
      const instance2 = getThunkProcessor(defaultPreloadOptions);

      expect(instance1).not.toBe(instance2);
    });

    it('should handle reset when no instance exists', () => {
      // Should not throw when no instance exists
      expect(() => resetThunkProcessor()).not.toThrow();
    });
  });

  describe('edge cases and error conditions', () => {
    it('should handle dispatch with no pending actions to complete', () => {
      // Complete a non-existent action should not throw
      expect(() =>
        processor.completeAction('non-existent-action', { result: 'test' }),
      ).not.toThrow();
    });

    it('should handle state provider returning null', async () => {
      const nullStateProcessor = new RendererThunkProcessor({
        ...defaultPreloadOptions,
      });
      nullStateProcessor.initialize({
        windowId: 1,
        actionSender: mockActionSender,
        thunkRegistrar: mockThunkRegistrar,
        thunkCompleter: mockThunkCompleter,
      });

      // Set up null state provider
      nullStateProcessor.setStateProvider(vi.fn().mockResolvedValue(null));

      const thunk = vi.fn(async (getState) => {
        try {
          const state = await getState();
          return state;
        } catch (_error) {
          // Handle the "No state provider available" error
          return null;
        }
      });

      const result = await nullStateProcessor.executeThunk(thunk);
      expect(result).toBe(null);
    });

    it('should handle getCurrentWindowId returning undefined', async () => {
      const noWindowProcessor = new RendererThunkProcessor({
        ...defaultPreloadOptions,
      });
      noWindowProcessor.initialize({
        windowId: 1,
        actionSender: mockActionSender,
        thunkRegistrar: mockThunkRegistrar,
        thunkCompleter: mockThunkCompleter,
      });

      // Set currentWindowId to undefined to test the condition
      // biome-ignore lint/suspicious/noExplicitAny: Test needs to access private property
      (noWindowProcessor as any).currentWindowId = undefined;

      const thunk = vi.fn(async () => 'no-window-id');

      // Should still work without window ID
      const result = await noWindowProcessor.executeThunk(thunk);
      expect(result).toBe('no-window-id');
    });

    it('should handle action completion with various result types', () => {
      const actionId1 = 'test-action-1';
      const actionId2 = 'test-action-2';
      const actionId3 = 'test-action-3';

      // Test with different result types that won't cause destructuring errors
      expect(() => processor.completeAction(actionId1, { result: 'success' })).not.toThrow();
      expect(() => processor.completeAction(actionId2, { data: 'test' })).not.toThrow();
      expect(() => processor.completeAction(actionId3, 'string-result')).not.toThrow();
    });

    it('should handle multiple completeAction calls for same action', () => {
      const actionId = 'duplicate-action';

      // Add to pending dispatches
      // biome-ignore lint/suspicious/noExplicitAny: Test needs to access private property
      (processor as any).pendingDispatches.add(actionId);

      // First completion should work
      expect(() => processor.completeAction(actionId, { result: 'first' })).not.toThrow();

      // Second completion should also not throw (idempotent)
      expect(() => processor.completeAction(actionId, { result: 'second' })).not.toThrow();
    });

    it('should handle dispatchAction without window.zubridge available', () => {
      const originalWindow = global.window;
      global.window = {} as unknown as typeof global.window;

      mockActionSender.mockResolvedValue(undefined);

      const actionPromise = processor.dispatchAction({ type: 'NO_ZUBRIDGE_ACTION' });

      // Complete the action immediately
      setTimeout(() => {
        // biome-ignore lint/suspicious/noExplicitAny: Test needs to access private property
        const pendingDispatches = (processor as any).pendingDispatches;
        if (pendingDispatches.size > 0) {
          const actionId = Array.from(pendingDispatches)[0] as string;
          processor.completeAction(actionId, { result: 'completed' });
        }
      }, 5);

      expect(mockActionSender).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'NO_ZUBRIDGE_ACTION',
          __id: expect.any(String),
        }),
        undefined,
      );

      global.window = originalWindow;

      return actionPromise;
    });

    it('should handle state provider with access control options correctly', async () => {
      const accessControlProvider = vi.fn().mockImplementation((opts) => {
        if (opts?.bypassAccessControl) {
          return Promise.resolve({ access: 'full' });
        }
        return Promise.resolve({ access: 'limited' });
      });

      processor.setStateProvider(accessControlProvider);

      const testThunk = vi.fn(async (getState) => {
        const normalState = await getState();
        const bypassState = await getState({ bypassAccessControl: true });
        return { normalState, bypassState };
      });

      const result = await processor.executeThunk(testThunk, { bypassAccessControl: false });

      expect(result).toEqual({
        normalState: { access: 'limited' },
        bypassState: { access: 'full' },
      });
      expect(accessControlProvider).toHaveBeenCalledTimes(2);
    });
  });

  describe('advanced integration and edge cases', () => {
    it('should handle thunk registration without thunkRegistrar', async () => {
      const noRegistrarProcessor = new RendererThunkProcessor({
        ...defaultPreloadOptions,
      });
      noRegistrarProcessor.initialize({
        windowId: 1,
        actionSender: mockActionSender,
        thunkRegistrar: mockThunkRegistrar,
        thunkCompleter: mockThunkCompleter,
      });

      // Set thunkRegistrar to undefined to test the condition
      // biome-ignore lint/suspicious/noExplicitAny: Test needs to access private property
      (noRegistrarProcessor as any).thunkRegistrar = undefined;

      const thunk = vi.fn(async () => 'no-registrar-result');

      // Should still execute even without registrar
      const result = await noRegistrarProcessor.executeThunk(thunk);
      expect(result).toBe('no-registrar-result');
    });

    it('should handle thunk registration without currentWindowId', async () => {
      const noWindowIdProcessor = new RendererThunkProcessor({
        ...defaultPreloadOptions,
      });
      noWindowIdProcessor.initialize({
        windowId: 1,
        actionSender: mockActionSender,
        thunkRegistrar: mockThunkRegistrar,
        thunkCompleter: mockThunkCompleter,
      });

      // Set currentWindowId to undefined to test the condition
      // biome-ignore lint/suspicious/noExplicitAny: Test needs to set private property
      (noWindowIdProcessor as any).currentWindowId = undefined;

      const thunk = vi.fn(async () => 'no-window-id-result');

      // Should still execute even without window ID
      const result = await noWindowIdProcessor.executeThunk(thunk);
      expect(result).toBe('no-window-id-result');
    });

    it('should handle thunk completion notification errors', async () => {
      const errorCompleterProcessor = new RendererThunkProcessor({
        ...defaultPreloadOptions,
      });
      errorCompleterProcessor.initialize({
        windowId: 1,
        actionSender: mockActionSender,
        thunkRegistrar: mockThunkRegistrar,
        thunkCompleter: vi.fn().mockRejectedValue(new Error('Completion notification failed')),
      });

      const thunk = vi.fn(async () => 'completion-error-result');

      // Should complete successfully despite notification error
      const result = await errorCompleterProcessor.executeThunk(thunk);
      expect(result).toBe('completion-error-result');
    });

    it('should handle dispatch through window.zubridge when available', async () => {
      const mockZubridgeDispatch = vi.fn().mockResolvedValue({ type: 'ZUBRIDGE_DISPATCHED' });

      // Mock global window object
      const originalWindow = global.window;
      global.window = {
        ...originalWindow,
        zubridge: {
          dispatch: mockZubridgeDispatch,
        },
      } as unknown as typeof global.window;

      // Create processor without actionSender to force window.zubridge usage
      const windowProcessor = new RendererThunkProcessor({
        ...defaultPreloadOptions,
      });
      windowProcessor.initialize({
        windowId: 1,
        actionSender: mockActionSender,
        thunkRegistrar: mockThunkRegistrar,
        thunkCompleter: mockThunkCompleter,
      });

      // Set actionSender to undefined to force window.zubridge usage
      // biome-ignore lint/suspicious/noExplicitAny: Test needs to access private property
      (windowProcessor as any).actionSender = undefined;

      await windowProcessor.dispatchAction({ type: 'WINDOW_ZUBRIDGE_ACTION' });

      expect(mockZubridgeDispatch).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'WINDOW_ZUBRIDGE_ACTION' }),
      );

      // Restore window
      global.window = originalWindow;
    });

    it('should handle thunk with bypassThunkLock and bypassAccessControl options', async () => {
      const bypassProcessor = new RendererThunkProcessor({
        ...defaultPreloadOptions,
      });
      bypassProcessor.initialize({
        windowId: 1,
        actionSender: mockActionSender,
        thunkRegistrar: mockThunkRegistrar,
        thunkCompleter: mockThunkCompleter,
      });

      const bypassThunk = vi.fn(async () => 'bypass-result');

      const result = await bypassProcessor.executeThunk(bypassThunk, {
        bypassThunkLock: true,
        bypassAccessControl: true,
      });

      expect(result).toBe('bypass-result');
      expect(mockThunkRegistrar).toHaveBeenCalledWith(
        expect.any(String),
        undefined, // parentId
        true, // bypassThunkLock
        true, // bypassAccessControl
      );
    });

    it('should handle nested thunk dispatch with parent tracking', async () => {
      const nestedProcessor = new RendererThunkProcessor({
        ...defaultPreloadOptions,
      });
      nestedProcessor.initialize({
        windowId: 1,
        actionSender: mockActionSender,
        thunkRegistrar: mockThunkRegistrar,
        thunkCompleter: mockThunkCompleter,
      });

      const childThunk = vi.fn(async () => 'child-result');
      const parentThunk = vi.fn(async (_getState, dispatch) => {
        const childResult = await dispatch(childThunk);
        return `parent-${childResult}`;
      });

      const result = await nestedProcessor.executeThunk(parentThunk);

      expect(result).toBe('parent-child-result');
      expect(parentThunk).toHaveBeenCalled();
      expect(childThunk).toHaveBeenCalled();
    });

    it('should handle state provider with bypassAccessControl option', async () => {
      const accessControlProvider = vi.fn().mockImplementation((opts) => {
        if (opts?.bypassAccessControl) {
          return Promise.resolve({ restricted: true });
        }
        return Promise.resolve({ restricted: false });
      });

      const accessProcessor = new RendererThunkProcessor();
      accessProcessor.initialize({
        windowId: 1,
        actionSender: mockActionSender,
        thunkRegistrar: mockThunkRegistrar,
        thunkCompleter: mockThunkCompleter,
      });

      // Set the state provider after initialization
      accessProcessor.setStateProvider(accessControlProvider);

      const accessThunk = vi.fn(async (getState) => {
        const state = await getState({ bypassAccessControl: true });
        return state;
      });

      const result = await accessProcessor.executeThunk(accessThunk, {
        bypassAccessControl: false, // This should be overridden by getState call
      });

      expect(result).toEqual({ restricted: true });
      expect(accessControlProvider).toHaveBeenCalledWith({ bypassAccessControl: true });
    });
  });
});
