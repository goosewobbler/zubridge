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
    // Reset window.__zubridge_thunkProcessor before each test
    if (window.__zubridge_thunkProcessor) {
      delete window.__zubridge_thunkProcessor;
    }

    // Create mocks for dependencies
    mockActionSender = vi.fn().mockResolvedValue(undefined);
    mockThunkRegistrar = vi.fn().mockResolvedValue(undefined);
    mockThunkCompleter = vi.fn().mockResolvedValue(undefined);

    // Create a new processor instance
    processor = new RendererThunkProcessor(true);

    // Initialize it with the mocks
    processor.initialize({
      windowId: 123,
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
      const newProcessor = new RendererThunkProcessor(true);
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
      expect(mockActionSender).toHaveBeenCalledWith(action, undefined);
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
      // Create a mock thunk that dispatches an action
      const mockThunk: Thunk<AnyState> = vi.fn().mockImplementation((getState, dispatch) => {
        dispatch({ type: 'TEST_ACTION', payload: 10 });
        return 'thunk-result';
      });

      // Mock getState function
      const mockGetState = vi.fn().mockReturnValue({ count: 0 });

      // Execute the thunk
      const result = await processor.executeThunk(mockThunk, mockGetState);

      // Verify thunk registration
      expect(mockThunkRegistrar).toHaveBeenCalled();

      // Verify the thunk was executed
      expect(mockThunk).toHaveBeenCalled();

      // Verify action was sent
      expect(mockActionSender).toHaveBeenCalled();
      expect(mockActionSender.mock.calls[0][0].type).toBe('TEST_ACTION');

      // Verify thunk completion
      expect(mockThunkCompleter).toHaveBeenCalled();

      // Verify result
      expect(result).toBe('thunk-result');
    });

    it('should handle nested thunks', async () => {
      // Create a nested thunk setup
      const nestedThunk: Thunk<AnyState> = vi.fn().mockImplementation((getState, dispatch) => {
        dispatch({ type: 'NESTED_ACTION', payload: 20 });
        return 'nested-result';
      });

      const parentThunk: Thunk<AnyState> = vi.fn().mockImplementation((getState, dispatch) => {
        dispatch(nestedThunk);
        dispatch({ type: 'PARENT_ACTION', payload: 10 });
        return 'parent-result';
      });

      // Mock getState function
      const mockGetState = vi.fn().mockReturnValue({ count: 0 });

      // Reset mocks to ensure clean test
      mockThunkRegistrar.mockClear();
      mockActionSender.mockClear();
      mockThunkCompleter.mockClear();

      // Execute the parent thunk
      const result = await processor.executeThunk(parentThunk, mockGetState);

      // Verify both thunks were registered
      expect(mockThunkRegistrar).toHaveBeenCalledTimes(2);

      // Verify both actions were sent
      expect(mockActionSender).toHaveBeenCalledTimes(2);

      // Verify both thunks were completed
      expect(mockThunkCompleter).toHaveBeenCalledTimes(2);

      // Verify result
      expect(result).toBe('parent-result');
    });
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
      expect(sentAction.id).toBeDefined();
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
      expect(sentAction.id).toBeDefined();
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
