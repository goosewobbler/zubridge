import type { AnyState, StateManager } from '@zubridge/types';
import type { IpcMainEvent, IpcMainInvokeEvent, WebContents } from 'electron';
import { ipcMain } from 'electron';
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import { IpcHandler } from '../../../src/bridge/ipc/IpcHandler.js';
import type {
  MiddlewareCallbacks,
  ResourceManager,
} from '../../../src/bridge/resources/ResourceManager.js';
import { IpcChannel } from '../../../src/constants.js';
import { actionQueue } from '../../../src/main/actionQueue.js';
import { getPartialState } from '../../../src/subscription/SubscriptionManager.js';
import { thunkManager } from '../../../src/thunk/init.js';
import { ThunkRegistrationQueue } from '../../../src/thunk/registration/ThunkRegistrationQueue.js';
import { Thunk } from '../../../src/thunk/Thunk.js';
import { safelySendToWindow } from '../../../src/utils/windows.js';

// Mock dependencies
vi.mock('electron', () => ({
  ipcMain: {
    on: vi.fn(),
    handle: vi.fn(),
    removeHandler: vi.fn(),
    removeAllListeners: vi.fn(),
  },
}));

vi.mock('../../../src/thunk/init.js', () => ({
  thunkManager: {
    hasThunk: vi.fn(),
    getActiveThunksSummary: vi.fn(() => ({ version: 1, thunks: [] })),
    getCurrentThunkActionId: vi.fn(),
    acknowledgeStateUpdate: vi.fn(),
    isThunkActive: vi.fn(),
    getThunkState: vi.fn(() => ({ version: 1, thunks: [] })),
  },
}));

vi.mock('../../../src/main/actionQueue.js', () => ({
  actionQueue: {
    enqueueAction: vi.fn((_action, _windowId, _parentId, callback) => {
      // Call the callback immediately to simulate synchronous behavior for tests
      if (callback) {
        callback(null); // Simulate successful completion
      }
    }),
  },
}));

vi.mock('../../../src/thunk/Thunk.js', () => ({
  Thunk: vi.fn().mockImplementation((config) => ({
    id: config.id,
    sourceWindowId: config.sourceWindowId,
    source: config.source,
  })),
}));

vi.mock('../../../src/thunk/registration/ThunkRegistrationQueue.js', () => ({
  ThunkRegistrationQueue: vi.fn().mockImplementation(() => ({
    registerThunk: vi.fn(),
  })),
}));

vi.mock('../../../src/utils/windows.js', () => ({
  safelySendToWindow: vi.fn(),
  isDestroyed: vi.fn(() => false),
}));

vi.mock('../../../src/subscription/SubscriptionManager.js', () => ({
  getPartialState: vi.fn(),
}));

vi.mock('../../../src/utils/errorHandling.js', () => ({
  logZubridgeError: vi.fn(),
  serializeError: vi.fn(() => 'serialized error'),
}));

vi.mock('../../../src/utils/windows.js', () => ({
  safelySendToWindow: vi.fn(),
  isDestroyed: vi.fn(() => false),
}));

vi.mock('../../../src/utils/serialization.js', () => ({
  sanitizeState: vi.fn((state) => state),
}));

describe('IpcHandler', () => {
  let mockStateManager: StateManager<AnyState>;
  let mockResourceManager: {
    getSubscriptionManager: () => Mock;
    getMiddlewareCallbacks: () => MiddlewareCallbacks;
  };
  let ipcHandler: IpcHandler<AnyState>;
  let mockWebContents: WebContents;

  beforeEach(() => {
    vi.clearAllMocks();

    // Create mock state manager
    mockStateManager = {
      getState: vi.fn(() => ({ counter: 42, user: { name: 'test' } })),
      subscribe: vi.fn(),
      processAction: vi.fn(),
    };

    // Create mock resource manager
    mockResourceManager = {
      getSubscriptionManager: vi.fn(),
      getMiddlewareCallbacks: vi.fn(() => ({})),
    };

    // Create mock WebContents
    mockWebContents = {
      id: 123,
      send: vi.fn(),
      isDestroyed: vi.fn(() => false),
    } as unknown as WebContents;

    // Create IPC handler
    ipcHandler = new IpcHandler(
      mockStateManager,
      mockResourceManager as unknown as ResourceManager<AnyState>,
    );
  });

  describe('initialization', () => {
    it('should register all IPC handlers during construction', () => {
      expect(ipcMain.on).toHaveBeenCalledWith(IpcChannel.DISPATCH, expect.any(Function));
      expect(ipcMain.on).toHaveBeenCalledWith(
        IpcChannel.TRACK_ACTION_DISPATCH,
        expect.any(Function),
      );
      expect(ipcMain.on).toHaveBeenCalledWith(IpcChannel.REGISTER_THUNK, expect.any(Function));
      expect(ipcMain.on).toHaveBeenCalledWith(IpcChannel.COMPLETE_THUNK, expect.any(Function));
      expect(ipcMain.on).toHaveBeenCalledWith(IpcChannel.STATE_UPDATE_ACK, expect.any(Function));
      expect(ipcMain.handle).toHaveBeenCalledWith(IpcChannel.GET_STATE, expect.any(Function));
      expect(ipcMain.handle).toHaveBeenCalledWith(IpcChannel.GET_WINDOW_ID, expect.any(Function));
      expect(ipcMain.handle).toHaveBeenCalledWith(
        IpcChannel.GET_WINDOW_SUBSCRIPTIONS,
        expect.any(Function),
      );
      expect(ipcMain.handle).toHaveBeenCalledWith(IpcChannel.GET_THUNK_STATE, expect.any(Function));
    });

    it('should create ThunkRegistrationQueue with thunkManager', () => {
      expect(ThunkRegistrationQueue).toHaveBeenCalledWith(thunkManager);
    });
  });

  describe('handleDispatch', () => {
    let mockEvent: IpcMainEvent;

    beforeEach(() => {
      mockEvent = {
        sender: mockWebContents,
      } as IpcMainEvent;
    });

    it('should handle valid action dispatch', async () => {
      const actionData = {
        action: { type: 'TEST_ACTION', __id: 'action-123' },
        parentId: undefined,
      };

      await ipcHandler.handleDispatch(mockEvent, actionData);

      expect(actionQueue.enqueueAction).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'TEST_ACTION',
          __id: 'action-123',
          __sourceWindowId: 123,
        }),
        123,
        undefined,
        expect.any(Function),
      );

      expect(safelySendToWindow).toHaveBeenCalled();
    });

    it('should handle action with parent thunk', async () => {
      const actionData = {
        action: { type: 'THUNK_ACTION', __id: 'action-456' },
        parentId: 'parent-thunk',
      };

      (thunkManager.hasThunk as Mock).mockReturnValue(true);

      await ipcHandler.handleDispatch(mockEvent, actionData);

      expect(thunkManager.hasThunk).toHaveBeenCalledWith('parent-thunk');
      expect(actionQueue.enqueueAction).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'THUNK_ACTION',
          __id: 'action-456',
          __sourceWindowId: 123,
        }),
        123,
        'parent-thunk',
        expect.any(Function),
      );
    });

    it('should register thunk if parent thunk does not exist', async () => {
      const actionData = {
        action: { type: 'NEW_THUNK_ACTION', __id: 'action-789' },
        parentId: 'new-thunk',
      };

      (thunkManager.hasThunk as Mock).mockReturnValue(false);

      // Get the mocked ThunkRegistrationQueue instance
      const mockRegistrationQueue = vi.mocked(ThunkRegistrationQueue).mock.results[0]?.value;

      await ipcHandler.handleDispatch(mockEvent, actionData);

      expect(Thunk).toHaveBeenCalledWith({
        id: 'new-thunk',
        sourceWindowId: 123,
        source: 'renderer',
      });
      expect(mockRegistrationQueue.registerThunk).toHaveBeenCalled();
    });

    it('should handle invalid action data gracefully', async () => {
      const invalidData = { action: null };

      await expect(ipcHandler.handleDispatch(mockEvent, invalidData)).resolves.not.toThrow();
    });

    it('should handle action without type gracefully', async () => {
      const invalidActionData = {
        action: { __id: 'invalid-action' },
      };

      await expect(ipcHandler.handleDispatch(mockEvent, invalidActionData)).resolves.not.toThrow();
    });

    it('should send acknowledgment with thunk state', async () => {
      const actionData = {
        action: { type: 'ACK_TEST', __id: 'ack-123' },
      };

      (thunkManager.getActiveThunksSummary as Mock).mockReturnValue({
        version: 2,
        thunks: [{ id: 'active-thunk', windowId: 123, parentId: undefined }],
      });

      await ipcHandler.handleDispatch(mockEvent, actionData);

      expect(safelySendToWindow).toHaveBeenCalledWith(mockWebContents, IpcChannel.DISPATCH_ACK, {
        actionId: 'ack-123',
        thunkState: {
          version: 2,
          thunks: [{ id: 'active-thunk', windowId: 123, parentId: undefined }],
        },
        error: null,
      });
    });

    it('should handle action dispatch errors gracefully', async () => {
      const actionData = {
        action: { type: 'ERROR_ACTION', __id: 'error-123' },
      };

      (actionQueue.enqueueAction as Mock).mockImplementation(() => {
        throw new Error('Queue error');
      });

      await ipcHandler.handleDispatch(mockEvent, actionData);

      expect(safelySendToWindow).toHaveBeenCalledWith(mockWebContents, IpcChannel.DISPATCH_ACK, {
        actionId: 'error-123',
        thunkState: { version: 0, thunks: [] },
        error: 'serialized error',
      });
    });
  });

  describe('handleTrackActionDispatch', () => {
    let mockEvent: IpcMainEvent;

    beforeEach(() => {
      mockEvent = {
        sender: mockWebContents,
      } as IpcMainEvent;
    });

    it('should handle valid action tracking', async () => {
      const actionData = {
        action: { type: 'TRACK_TEST', __id: 'track-123' },
      };

      (mockResourceManager.getMiddlewareCallbacks as Mock).mockReturnValue({
        trackActionDispatch: vi.fn(),
      });

      await ipcHandler.handleTrackActionDispatch(mockEvent, actionData);

      const middlewareCallbacks = mockResourceManager.getMiddlewareCallbacks();
      expect(middlewareCallbacks.trackActionDispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'TRACK_TEST',
          __id: 'track-123',
          __sourceWindowId: 123,
        }),
      );
    });

    it('should handle invalid action tracking data gracefully', async () => {
      const invalidData = { action: null };

      await expect(
        ipcHandler.handleTrackActionDispatch(mockEvent, invalidData),
      ).resolves.not.toThrow();
    });

    it('should handle action without type gracefully', async () => {
      const invalidActionData = {
        action: { __id: 'invalid-track' },
      };

      await expect(
        ipcHandler.handleTrackActionDispatch(mockEvent, invalidActionData),
      ).resolves.not.toThrow();
    });

    it('should serialize action payload for middleware', async () => {
      const actionData = {
        action: {
          type: 'PAYLOAD_TEST',
          __id: 'payload-123',
          payload: { complex: 'data' },
        },
      };

      (mockResourceManager.getMiddlewareCallbacks as Mock).mockReturnValue({
        trackActionDispatch: vi.fn(),
      });

      await ipcHandler.handleTrackActionDispatch(mockEvent, actionData);

      const middlewareCallbacks =
        mockResourceManager.getMiddlewareCallbacks() as MiddlewareCallbacks;
      expect(middlewareCallbacks.trackActionDispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'PAYLOAD_TEST',
          __id: 'payload-123',
          payload: '{"complex":"data"}', // Should be serialized
        }),
      );
    });
  });

  describe('handleGetState', () => {
    let mockInvokeEvent: IpcMainInvokeEvent;

    beforeEach(() => {
      mockInvokeEvent = {
        sender: mockWebContents,
      } as IpcMainInvokeEvent;
    });

    it('should return full state for bypass access control', () => {
      const options = { bypassAccessControl: true };
      (mockResourceManager.getSubscriptionManager as Mock).mockReturnValue(null);

      const result = ipcHandler.handleGetState(mockInvokeEvent, options);

      expect(mockStateManager.getState).toHaveBeenCalled();
      expect(result).toEqual({ counter: 42, user: { name: 'test' } });
    });

    it('should return full state for wildcard subscription', () => {
      const options = {};
      const mockSubManager = {
        getCurrentSubscriptionKeys: vi.fn(() => ['*']),
      };
      (mockResourceManager.getSubscriptionManager as Mock).mockReturnValue(mockSubManager);

      const result = ipcHandler.handleGetState(mockInvokeEvent, options);

      expect(result).toEqual({ counter: 42, user: { name: 'test' } });
    });

    it('should filter state by subscriptions', () => {
      const options = {};
      const mockSubManager = {
        getCurrentSubscriptionKeys: vi.fn(() => ['counter']),
      };
      (mockResourceManager.getSubscriptionManager as Mock).mockReturnValue(mockSubManager);

      (getPartialState as Mock).mockReturnValue({ counter: 42 });

      const result = ipcHandler.handleGetState(mockInvokeEvent, options);

      expect(getPartialState).toHaveBeenCalledWith({ counter: 42, user: { name: 'test' } }, [
        'counter',
      ]);
      expect(result).toEqual({ counter: 42 });
    });

    it('should return full state when no subscription manager exists', () => {
      const options = {};
      (mockResourceManager.getSubscriptionManager as Mock).mockReturnValue(null);

      const result = ipcHandler.handleGetState(mockInvokeEvent, options);

      expect(result).toEqual({ counter: 42, user: { name: 'test' } });
    });

    it('should handle state manager errors gracefully', () => {
      (mockStateManager.getState as Mock).mockImplementation(() => {
        throw new Error('State error');
      });

      const result = ipcHandler.handleGetState(mockInvokeEvent, {});

      expect(result).toEqual({});
    });
  });

  describe('handleRegisterThunk', () => {
    let mockEvent: IpcMainEvent;

    beforeEach(() => {
      mockEvent = {
        sender: mockWebContents,
      } as IpcMainEvent;
    });

    it('should register thunk successfully', async () => {
      const thunkData = {
        thunkId: 'test-thunk',
        parentId: 'parent-thunk',
        bypassThunkLock: true,
        bypassAccessControl: false,
      };

      // Get the mocked ThunkRegistrationQueue instance
      const mockRegistrationQueue = vi.mocked(ThunkRegistrationQueue).mock.results[0]?.value;

      await ipcHandler.handleRegisterThunk(mockEvent, thunkData);

      expect(Thunk).toHaveBeenCalledWith({
        id: 'test-thunk',
        sourceWindowId: 123,
        source: 'renderer',
        parentId: 'parent-thunk',
        bypassThunkLock: true,
        bypassAccessControl: false,
      });
      expect(mockRegistrationQueue.registerThunk).toHaveBeenCalled();
      expect(safelySendToWindow).toHaveBeenCalledWith(
        mockWebContents,
        IpcChannel.REGISTER_THUNK_ACK,
        { thunkId: 'test-thunk', success: true },
      );
    });

    it('should handle thunk registration errors', async () => {
      const thunkData = {
        thunkId: 'error-thunk',
      };

      // Get the mocked ThunkRegistrationQueue instance and set it up to reject
      const mockRegistrationQueue = vi.mocked(ThunkRegistrationQueue).mock.results[0]?.value;
      mockRegistrationQueue.registerThunk.mockRejectedValue(new Error('Registration failed'));

      await ipcHandler.handleRegisterThunk(mockEvent, thunkData);

      expect(safelySendToWindow).toHaveBeenCalledWith(
        mockWebContents,
        IpcChannel.REGISTER_THUNK_ACK,
        {
          thunkId: 'error-thunk',
          success: false,
          error: 'serialized error',
        },
      );
    });
  });

  describe('handleCompleteThunk', () => {
    it('should complete thunk successfully', () => {
      const thunkData = { thunkId: 'complete-thunk' };

      (thunkManager.isThunkActive as Mock).mockReturnValue(true);

      ipcHandler.handleCompleteThunk({} as IpcMainEvent, thunkData);

      expect(thunkManager.isThunkActive).toHaveBeenCalledWith('complete-thunk');
    });

    it('should handle missing thunkId gracefully', () => {
      const thunkData = {};

      ipcHandler.handleCompleteThunk({} as IpcMainEvent, thunkData);

      // Should not throw or call any methods
    });
  });

  describe('handleStateUpdateAck', () => {
    it('should acknowledge state updates', () => {
      const ackData = { updateId: 'update-123', thunkId: 'thunk-456' };

      ipcHandler.handleStateUpdateAck(
        {
          sender: mockWebContents,
        } as IpcMainEvent,
        ackData,
      );

      expect(thunkManager.acknowledgeStateUpdate).toHaveBeenCalledWith('update-123', 123);
    });

    it('should handle missing updateId gracefully', () => {
      const ackData = { thunkId: 'thunk-456' };

      ipcHandler.handleStateUpdateAck(
        {
          sender: mockWebContents,
        } as IpcMainEvent,
        ackData,
      );

      expect(thunkManager.acknowledgeStateUpdate).not.toHaveBeenCalled();
    });
  });

  describe('handleGetWindowId', () => {
    it('should return sender window ID', () => {
      const mockInvokeEvent = {
        sender: { id: 456 },
      } as IpcMainInvokeEvent;

      const result = ipcHandler.handleGetWindowId(mockInvokeEvent);

      expect(result).toBe(456);
    });
  });

  describe('handleGetWindowSubscriptions', () => {
    it('should return subscriptions for specified window', () => {
      const mockSubManager = {
        getCurrentSubscriptionKeys: vi.fn(() => ['counter', 'user']),
      };
      (mockResourceManager.getSubscriptionManager as Mock).mockReturnValue(mockSubManager);

      const result = ipcHandler.handleGetWindowSubscriptions(
        {
          sender: mockWebContents,
        } as IpcMainInvokeEvent,
        123,
      );

      expect(result).toEqual(['counter', 'user']);
      expect(mockSubManager.getCurrentSubscriptionKeys).toHaveBeenCalledWith(123);
    });

    it('should use sender ID when no windowId provided', () => {
      const mockSubManager = {
        getCurrentSubscriptionKeys: vi.fn(() => ['counter']),
      };
      (mockResourceManager.getSubscriptionManager as Mock).mockReturnValue(mockSubManager);

      ipcHandler.handleGetWindowSubscriptions({
        sender: mockWebContents,
      } as IpcMainInvokeEvent);

      expect(mockSubManager.getCurrentSubscriptionKeys).toHaveBeenCalledWith(123);
    });

    it('should return empty array when no subscription manager exists', () => {
      (mockResourceManager.getSubscriptionManager as Mock).mockReturnValue(null);

      const result = ipcHandler.handleGetWindowSubscriptions({
        sender: mockWebContents,
      } as IpcMainInvokeEvent);

      expect(result).toEqual([]);
    });
  });

  describe('handleGetThunkState', () => {
    it('should return active thunk summary', () => {
      (thunkManager.getActiveThunksSummary as Mock).mockReturnValue({
        version: 3,
        thunks: [
          { id: 'thunk-1', windowId: 123, parentId: undefined },
          { id: 'thunk-2', windowId: 456, parentId: 'thunk-1' },
        ],
      });

      const result = ipcHandler.handleGetThunkState();

      expect(result).toEqual({
        version: 3,
        thunks: [
          { id: 'thunk-1', windowId: 123, parentId: undefined },
          { id: 'thunk-2', windowId: 456, parentId: 'thunk-1' },
        ],
      });
    });

    it('should handle thunk state retrieval errors', () => {
      (thunkManager.getActiveThunksSummary as Mock).mockImplementation(() => {
        throw new Error('Thunk state error');
      });

      const result = ipcHandler.handleGetThunkState();

      expect(result).toEqual({ version: 1, thunks: [] });
    });
  });

  describe('cleanup', () => {
    it('should remove all IPC handlers and listeners', () => {
      ipcHandler.cleanup();

      expect(ipcMain.removeHandler).toHaveBeenCalledWith(IpcChannel.GET_WINDOW_ID);
      expect(ipcMain.removeHandler).toHaveBeenCalledWith(IpcChannel.GET_THUNK_STATE);
      expect(ipcMain.removeHandler).toHaveBeenCalledWith(IpcChannel.GET_STATE);
      expect(ipcMain.removeHandler).toHaveBeenCalledWith(IpcChannel.GET_WINDOW_SUBSCRIPTIONS);
      expect(ipcMain.removeAllListeners).toHaveBeenCalledWith(IpcChannel.DISPATCH);
      expect(ipcMain.removeAllListeners).toHaveBeenCalledWith(IpcChannel.TRACK_ACTION_DISPATCH);
      expect(ipcMain.removeAllListeners).toHaveBeenCalledWith(IpcChannel.REGISTER_THUNK);
      expect(ipcMain.removeAllListeners).toHaveBeenCalledWith(IpcChannel.COMPLETE_THUNK);
    });
  });

  describe('serialization maxDepth configuration', () => {
    it('should pass serializationMaxDepth to sanitizeState when getting state', async () => {
      // Create deep nested state
      const deepState = {
        level1: {
          level2: {
            level3: {
              level4: {
                level5: 'deep',
              },
            },
          },
        },
      };

      mockStateManager.getState = vi.fn(() => deepState);

      // Create subscription manager that returns subscriptions
      const mockSubManager = {
        getCurrentSubscriptionKeys: vi.fn(() => ['*']),
      };
      mockResourceManager.getSubscriptionManager = vi.fn(() => mockSubManager);

      // Create IpcHandler with maxDepth: 3
      new IpcHandler(mockStateManager, mockResourceManager, 3);

      // Create mock invoke event
      const mockInvokeEvent = {
        sender: mockWebContents,
      } as IpcMainInvokeEvent;

      // Get the LAST registered GET_STATE handler (from our new IpcHandler instance)
      const getStateCalls = (ipcMain.handle as Mock).mock.calls.filter(
        (call) => call[0] === IpcChannel.GET_STATE,
      );
      const handleGetState = getStateCalls[getStateCalls.length - 1]?.[1];

      expect(handleGetState).toBeDefined();

      // Get the mocked sanitizeState
      const { sanitizeState } = await import('../../../src/utils/serialization.js');

      // Clear previous calls
      (sanitizeState as Mock).mockClear();

      // Call the handler
      await handleGetState(mockInvokeEvent);

      // Verify sanitizeState was called with maxDepth: 3
      expect(sanitizeState).toHaveBeenCalledWith(deepState, { maxDepth: 3 });
    });

    it('should pass undefined to sanitizeState when serializationMaxDepth is not provided', async () => {
      // Create deep nested state (11 levels - deeper than default maxDepth of 10)
      let deepState: Record<string, unknown> = { value: 'deepest' };
      for (let i = 0; i < 11; i++) {
        deepState = { [`level${11 - i}`]: deepState };
      }

      mockStateManager.getState = vi.fn(() => deepState);

      // Create subscription manager
      const mockSubManager = {
        getCurrentSubscriptionKeys: vi.fn(() => ['*']),
      };
      mockResourceManager.getSubscriptionManager = vi.fn(() => mockSubManager);

      // Create IpcHandler without maxDepth (should use default of 10)
      new IpcHandler(mockStateManager, mockResourceManager);

      // Create mock invoke event
      const mockInvokeEvent = {
        sender: mockWebContents,
      } as IpcMainInvokeEvent;

      // Get the LAST registered GET_STATE handler (from our new IpcHandler instance)
      const getStateCalls = (ipcMain.handle as Mock).mock.calls.filter(
        (call) => call[0] === IpcChannel.GET_STATE,
      );
      const handleGetState = getStateCalls[getStateCalls.length - 1]?.[1];

      expect(handleGetState).toBeDefined();

      // Get the mocked sanitizeState
      const { sanitizeState } = await import('../../../src/utils/serialization.js');

      // Clear previous calls
      (sanitizeState as Mock).mockClear();

      // Call the handler
      await handleGetState(mockInvokeEvent);

      // Verify sanitizeState was called with undefined (no maxDepth)
      expect(sanitizeState).toHaveBeenCalledWith(deepState, undefined);
    });
  });
});
