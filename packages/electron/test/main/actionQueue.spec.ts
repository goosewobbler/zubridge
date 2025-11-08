import type { Action, AnyState, StateManager } from '@zubridge/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock all the dependencies
vi.mock('@zubridge/core', () => ({
  debug: vi.fn(),
}));

vi.mock('node:crypto', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    randomUUID: vi.fn(() => 'mock-uuid'),
  };
});

vi.mock('../../src/constants.js', () => ({
  ThunkSchedulerEvents: {
    TASK_COMPLETED: 'taskCompleted',
    TASK_FAILED: 'taskFailed',
  },
}));

vi.mock('../../src/action/ActionExecutor.js', () => ({
  ActionExecutor: vi.fn().mockImplementation(() => ({
    executeAction: vi.fn(),
  })),
}));

vi.mock('../../src/thunk/init.js', () => ({
  actionScheduler: {
    setActionProcessor: vi.fn(),
    enqueueAction: vi.fn(),
    getScheduler: vi.fn(() => ({
      enqueue: vi.fn(),
      on: vi.fn(),
      removeListener: vi.fn(),
    })),
  },
  thunkManager: {
    hasThunk: vi.fn(),
    getActiveThunksSummary: vi.fn(),
  },
}));

vi.mock('../../src/thunk/registration/ThunkRegistrationQueue.js', () => ({
  ThunkRegistrationQueue: vi.fn().mockImplementation(() => ({
    registerThunk: vi.fn(),
  })),
}));

import { ActionExecutor } from '../../src/action/ActionExecutor.js';
// Import after mocking
import { ActionQueueManager, initActionQueue } from '../../src/main/actionQueue.js';
import { actionScheduler, thunkManager } from '../../src/thunk/init.js';
import { ThunkRegistrationQueue } from '../../src/thunk/registration/ThunkRegistrationQueue.js';
import type { ThunkScheduler } from '../../src/thunk/scheduling/ThunkScheduler.js';
import type { Thunk as ThunkClass } from '../../src/thunk/Thunk.js';

describe('ActionQueueManager', () => {
  let mockStateManager: StateManager<AnyState>;
  let mockActionExecutor: {
    executeAction: ReturnType<typeof vi.fn>;
  };
  let mockThunkRegistrationQueue: {
    registerThunk: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Create mock state manager
    mockStateManager = {
      getState: vi.fn(),
      processAction: vi.fn(),
      subscribe: vi.fn(),
    } as unknown as StateManager<AnyState>;

    // Mock the ActionExecutor constructor
    mockActionExecutor = {
      executeAction: vi.fn(),
    };
    vi.mocked(ActionExecutor).mockReturnValue(
      mockActionExecutor as unknown as ActionExecutor<AnyState>,
    );

    // Mock the ThunkRegistrationQueue constructor
    mockThunkRegistrationQueue = {
      registerThunk: vi.fn(),
    };
    vi.mocked(ThunkRegistrationQueue).mockReturnValue(
      mockThunkRegistrationQueue as unknown as ThunkRegistrationQueue,
    );

    // Mock thunkManager
    vi.mocked(thunkManager.hasThunk).mockReturnValue(true);
    vi.mocked(thunkManager.getActiveThunksSummary).mockReturnValue({
      version: 1,
      thunks: [],
    });
  });

  describe('constructor', () => {
    it('should initialize with state manager', () => {
      new ActionQueueManager(mockStateManager);

      expect(ActionExecutor).toHaveBeenCalledWith(mockStateManager);
      expect(ThunkRegistrationQueue).toHaveBeenCalledWith(thunkManager);
      expect(actionScheduler.setActionProcessor).toHaveBeenCalledWith(expect.any(Function));
    });

    it('should create action processor that calls processAction', () => {
      new ActionQueueManager(mockStateManager);
      const mockAction: Action = { type: 'TEST_ACTION', __id: 'test-id' };

      // Get the processor function that was set
      const processorFunction = vi.mocked(actionScheduler.setActionProcessor).mock.calls[0][0];

      // Call it with an action
      const result = processorFunction(mockAction);

      expect(result).toBeDefined();
    });
  });

  describe('processAction', () => {
    beforeEach(() => {
      new ActionQueueManager(mockStateManager);
    });

    it('should process non-thunk actions directly', async () => {
      const action: Action = { type: 'INCREMENT', __id: 'test-id' };

      mockActionExecutor.executeAction.mockResolvedValue('result');

      // Get the processor and call it
      const processorFunction = vi.mocked(actionScheduler.setActionProcessor).mock.calls[0][0];
      const result = await processorFunction(action);

      expect(mockActionExecutor.executeAction).toHaveBeenCalledWith(action);
      expect(result).toBe('result');
    });

    it('should process thunk actions through scheduler', () => {
      const action: Action = {
        type: 'ASYNC_INCREMENT',
        __id: 'test-id',
        __thunkParentId: 'thunk-123',
      };

      // Mock the scheduler
      const mockScheduler = {
        enqueue: vi.fn().mockReturnValue('task-id'),
        on: vi.fn(),
        removeListener: vi.fn(),
      };

      vi.mocked(actionScheduler.getScheduler).mockReturnValue(
        mockScheduler as unknown as ThunkScheduler,
      );

      // Get the processor and call it
      const processorFunction = vi.mocked(actionScheduler.setActionProcessor).mock.calls[0][0];
      const resultPromise = processorFunction(action);

      // Should return a promise (we don't await to avoid timeout)
      expect(resultPromise).toBeInstanceOf(Promise);
      expect(mockScheduler.enqueue).toHaveBeenCalled();
    });

    it('should process bypass actions directly', async () => {
      const action: Action = {
        type: 'BYPASS_ACTION',
        __id: 'test-id',
        __thunkParentId: 'thunk-123',
        __bypassThunkLock: true,
      };

      mockActionExecutor.executeAction.mockResolvedValue('bypass-result');

      // Get the processor and call it
      const processorFunction = vi.mocked(actionScheduler.setActionProcessor).mock.calls[0][0];
      const result = await processorFunction(action);

      expect(mockActionExecutor.executeAction).toHaveBeenCalledWith(action);
      expect(result).toBe('bypass-result');
    });

    it('should throw error for missing thunk', async () => {
      const action: Action = {
        type: 'THUNK_ACTION',
        __id: 'test-id',
        __thunkParentId: 'missing-thunk',
      };

      vi.mocked(thunkManager.hasThunk).mockReturnValue(false);

      // Get the processor and call it
      const processorFunction = vi.mocked(actionScheduler.setActionProcessor).mock.calls[0][0];

      await expect(processorFunction(action)).rejects.toThrow('Thunk missing-thunk not found');
    });
  });

  describe('getThunkState', () => {
    it('should return thunk state summary', () => {
      const queueManager = new ActionQueueManager(mockStateManager);
      const expectedSummary = {
        version: 1,
        thunks: [],
      };

      vi.mocked(thunkManager.getActiveThunksSummary).mockReturnValue(expectedSummary);

      const result = queueManager.getThunkState();

      expect(result).toEqual(expectedSummary);
      expect(thunkManager.getActiveThunksSummary).toHaveBeenCalled();
    });
  });

  describe('registerThunkQueued', () => {
    it('should delegate to thunk registration queue', async () => {
      const queueManager = new ActionQueueManager(mockStateManager);
      const mockThunk = { id: 'test-thunk' } as unknown as InstanceType<typeof ThunkClass>;
      const expectedResult = 'registration-result';

      mockThunkRegistrationQueue.registerThunk.mockResolvedValue(expectedResult);

      const result = await queueManager.registerThunkQueued(mockThunk);

      expect(mockThunkRegistrationQueue.registerThunk).toHaveBeenCalledWith(
        mockThunk,
        undefined,
        undefined,
      );
      expect(result).toBe(expectedResult);
    });
  });

  describe('enqueueAction', () => {
    let queueManager: ActionQueueManager<AnyState>;

    beforeEach(() => {
      queueManager = new ActionQueueManager(mockStateManager);
    });

    it('should enqueue action without parent thunk', () => {
      const action: Action = { type: 'TEST_ACTION', __id: 'test-id' };
      const sourceWindowId = 1;

      queueManager.enqueueAction(action, sourceWindowId);

      expect(actionScheduler.enqueueAction).toHaveBeenCalledWith(action, {
        sourceWindowId: 1,
        onComplete: undefined,
      });
      expect(action.__sourceWindowId).toBe(sourceWindowId);
    });

    it('should enqueue action with parent thunk', () => {
      const action: Action = { type: 'THUNK_ACTION', __id: 'test-id' };
      const sourceWindowId = 1;
      const parentThunkId = 'parent-thunk-123';

      queueManager.enqueueAction(action, sourceWindowId, parentThunkId);

      expect(action.__thunkParentId).toBe(parentThunkId);
      expect(action.__sourceWindowId).toBe(sourceWindowId);
      expect(actionScheduler.enqueueAction).toHaveBeenCalledWith(action, {
        sourceWindowId: 1,
        onComplete: undefined,
      });
    });

    it('should handle completion callback', () => {
      const action: Action = { type: 'CALLBACK_ACTION', __id: 'test-id' };
      const sourceWindowId = 1;
      const onComplete = vi.fn();

      queueManager.enqueueAction(action, sourceWindowId, undefined, onComplete);

      expect(actionScheduler.enqueueAction).toHaveBeenCalledWith(action, {
        sourceWindowId: 1,
        onComplete,
      });
    });
  });

  describe('initActionQueue', () => {
    it('should create and return ActionQueueManager instance', () => {
      const result = initActionQueue(mockStateManager);

      expect(result).toBeInstanceOf(ActionQueueManager);
      expect(ActionExecutor).toHaveBeenCalledWith(mockStateManager);
    });
  });
});
