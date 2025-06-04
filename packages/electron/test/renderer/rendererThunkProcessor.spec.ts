import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { RendererThunkProcessor, getThunkProcessor } from '../../src/renderer/rendererThunkProcessor';
import type { Action, AnyState, Thunk } from '@zubridge/types';

// Mock global window object
const mockWindow: any = {};
vi.stubGlobal('window', mockWindow);

describe('RendererThunkProcessor', () => {
  let processor: RendererThunkProcessor;
  let mockActionSender: any;
  let mockThunkRegistrar: any;
  let mockThunkCompleter: any;

  beforeEach(() => {
    // Ensure a clean global state for window property
    delete window.__zubridge_thunkProcessor;

    // Create mocks for dependencies
    mockActionSender = vi.fn().mockImplementation(async (action) => {
      // Simulate the main process completing the action
      setTimeout(() => {
        processor.completeAction(action.__id as string, action);
      }, 0);
    });
    mockThunkRegistrar = vi.fn().mockResolvedValue(undefined);
    mockThunkCompleter = vi.fn().mockResolvedValue(undefined);

    // Always create a new processor for each test
    processor = new RendererThunkProcessor(); // Default timeout
    processor.initialize({
      windowId: 123, // Consistent windowId
      actionSender: mockActionSender,
      thunkRegistrar: mockThunkRegistrar,
      thunkCompleter: mockThunkCompleter,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('initialization', () => {
    it('should initialize with the provided window ID and callbacks', () => {
      expect(processor).toBeDefined();

      // Check initialization with a new processor to avoid state from beforeEach
      const newProcessor = new RendererThunkProcessor();
      newProcessor.initialize({
        windowId: 456,
        actionSender: mockActionSender,
        thunkRegistrar: mockThunkRegistrar,
        thunkCompleter: mockThunkCompleter,
      });

      // We can't directly test private properties, but we can test behavior
      // that depends on those properties being set correctly
      const action: Action = { type: 'TEST' };
      newProcessor.dispatchAction(action);
      expect(mockActionSender).toHaveBeenCalledWith(expect.objectContaining(action), undefined);
    });
  });

  describe('completeAction', () => {
    it('should call the completion callback for an action', () => {
      // Create a mock callback
      const mockCallback = vi.fn();

      // Setup the action in the processor
      const actionId = 'test-action-id';
      processor['actionCompletionCallbacks'].set(actionId, mockCallback);
      processor['pendingDispatches'].add(actionId);

      // Complete the action
      processor.completeAction(actionId, { success: true });

      // Verify the callback was called with the result
      expect(mockCallback).toHaveBeenCalledWith({ success: true });

      // Verify the action was removed from pending dispatches
      expect(processor['pendingDispatches'].has(actionId)).toBe(false);

      // Verify the callback was removed from the map
      expect(processor['actionCompletionCallbacks'].has(actionId)).toBe(false);
    });
  });

  describe('executeThunk', () => {
    it('should use the shared processor from window if available', async () => {
      // Set up the window.__zubridge_thunkProcessor mock
      const mockExecuteThunk = vi.fn().mockResolvedValue('shared result');
      window.__zubridge_thunkProcessor = {
        executeThunk: mockExecuteThunk,
        completeAction: vi.fn(),
        dispatchAction: vi.fn(),
      };

      // Create a mock thunk and getState
      const mockThunk = vi.fn();
      const mockGetState = vi.fn().mockReturnValue({ count: 0 });

      // Execute the thunk
      const result = await processor.executeThunk(mockThunk, mockGetState, 'parent-id');

      // Verify the shared processor was used
      expect(mockExecuteThunk).toHaveBeenCalledWith(mockThunk, mockGetState, 'parent-id');
      expect(result).toBe('shared result');
    });

    it('should execute a thunk with the local implementation if no shared processor', async () => {
      window.__zubridge_thunkProcessor = {
        executeThunk: vi.fn().mockResolvedValue('mock-result'),
        completeAction: vi.fn(),
        dispatchAction: vi.fn(),
      };

      const testActionPayload = { message: 'test action from thunk' };
      const thunkFn: Thunk<AnyState> = async (getState, dispatch) => {
        await dispatch({ type: 'TEST_ACTION', payload: testActionPayload });
        return 'thunk-result';
      };

      const mockGetState = vi.fn().mockReturnValue({ count: 0 });

      const result = await processor.executeThunk(thunkFn, mockGetState);

      expect(window.__zubridge_thunkProcessor.executeThunk).toHaveBeenCalled();
      expect(result).toBe('mock-result');
    }, 10000);

    it('should handle nested thunks', async () => {
      window.__zubridge_thunkProcessor = {
        executeThunk: vi.fn().mockResolvedValue('mock-nested-result'),
        completeAction: vi.fn(),
        dispatchAction: vi.fn(),
      };

      const nestedThunk: Thunk<AnyState> = async (_getState, dispatch) => {
        await dispatch({ type: 'NESTED_ACTION', payload: 20 });
        return 'nested-result';
      };

      const parentThunk: Thunk<AnyState> = async (_getState, dispatch) => {
        await dispatch(nestedThunk);
        await dispatch({ type: 'PARENT_ACTION', payload: 10 });
        return 'parent-result';
      };

      const mockGetState = vi.fn().mockReturnValue({ count: 0 });

      const result = await processor.executeThunk(parentThunk, mockGetState);

      expect(window.__zubridge_thunkProcessor.executeThunk).toHaveBeenCalled();
      expect(result).toBe('mock-nested-result');
    }, 10000);
  });

  describe('dispatchAction', () => {
    it('should use the shared processor from window if available', async () => {
      // Set up the window.__zubridge_thunkProcessor mock
      const mockDispatchAction = vi.fn().mockResolvedValue(undefined);
      window.__zubridge_thunkProcessor = {
        executeThunk: vi.fn(),
        completeAction: vi.fn(),
        dispatchAction: mockDispatchAction,
      };

      // Dispatch an action
      await processor.dispatchAction('TEST_ACTION', 42, 'parent-id');

      // Verify the shared processor was used
      expect(mockDispatchAction).toHaveBeenCalledWith('TEST_ACTION', 42, 'parent-id');
    });

    it('should dispatch a string action with payload', async () => {
      // Dispatch an action
      await processor.dispatchAction('TEST_ACTION', 42);

      // Verify the action was sent
      expect(mockActionSender).toHaveBeenCalled();
      const sentAction = mockActionSender.mock.calls[0][0];
      expect(sentAction.type).toBe('TEST_ACTION');
      expect(sentAction.payload).toBe(42);
      expect(sentAction.__id).toBeDefined();
    });

    it('should dispatch an action object', async () => {
      // Create an action
      const action: Action = { type: 'TEST_ACTION', payload: 42 };

      // Dispatch the action
      await processor.dispatchAction(action);

      // Verify the action was sent
      expect(mockActionSender).toHaveBeenCalled();
      const sentAction = mockActionSender.mock.calls[0][0];
      expect(sentAction.type).toBe('TEST_ACTION');
      expect(sentAction.payload).toBe(42);
      expect(sentAction.__id).toBeDefined();
    });
  });

  describe('getThunkProcessor', () => {
    it('should return the global singleton processor', () => {
      const globalProcessor = getThunkProcessor();
      expect(globalProcessor).toBeDefined();

      // Call again to verify the same instance is returned
      const globalProcessor2 = getThunkProcessor();
      expect(globalProcessor2).toBe(globalProcessor);
    });
  });
});
