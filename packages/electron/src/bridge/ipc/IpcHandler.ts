import type { Action, AnyState, StateManager } from '@zubridge/types';
import { debug } from '@zubridge/utils';
import type { IpcMainEvent, IpcMainInvokeEvent } from 'electron';
import { ipcMain } from 'electron';
import { IpcChannel } from '../../constants.js';
import { IpcCommunicationError } from '../../errors/index.js';
import { actionQueue } from '../../main/actionQueue.js';
import { getPartialState } from '../../subscription/SubscriptionManager.js';
import { thunkManager } from '../../thunk/init.js';
import { ThunkRegistrationQueue } from '../../thunk/registration/ThunkRegistrationQueue.js';
import { Thunk as ThunkClass } from '../../thunk/Thunk.js';
import { logZubridgeError, serializeError } from '../../utils/errorHandling.js';
import { sanitizeState } from '../../utils/serialization.js';
import { isDestroyed, safelySendToWindow } from '../../utils/windows.js';
import type { ResourceManager } from '../resources/ResourceManager.js';

export class IpcHandler<State extends AnyState> {
  private thunkRegistrationQueue: ThunkRegistrationQueue;

  constructor(
    private stateManager: StateManager<State>,
    private resourceManager: ResourceManager<State>,
  ) {
    this.thunkRegistrationQueue = new ThunkRegistrationQueue(thunkManager);
    this.setupHandlers();
  }

  private setupHandlers(): void {
    // Handle dispatch events from renderers
    ipcMain.on(IpcChannel.DISPATCH, this.handleDispatch.bind(this));

    // Handle track_action_dispatch events from renderers
    ipcMain.on(IpcChannel.TRACK_ACTION_DISPATCH, this.handleTrackActionDispatch.bind(this));

    // Handle getState requests from renderers
    ipcMain.handle(IpcChannel.GET_STATE, this.handleGetState.bind(this));

    // Handle thunk registration from renderers
    ipcMain.on(IpcChannel.REGISTER_THUNK, this.handleRegisterThunk.bind(this));

    // Handle thunk completion from renderers
    ipcMain.on(IpcChannel.COMPLETE_THUNK, this.handleCompleteThunk.bind(this));

    // Handle state update acknowledgments from renderers
    ipcMain.on(IpcChannel.STATE_UPDATE_ACK, this.handleStateUpdateAck.bind(this));

    // Handle registering and accessing WebContents IDs
    ipcMain.handle(IpcChannel.GET_WINDOW_ID, this.handleGetWindowId.bind(this));

    // Handle requests for window subscriptions
    ipcMain.handle(
      IpcChannel.GET_WINDOW_SUBSCRIPTIONS,
      this.handleGetWindowSubscriptions.bind(this),
    );

    // Handle requests for current global thunk state
    ipcMain.handle(IpcChannel.GET_THUNK_STATE, this.handleGetThunkState.bind(this));
  }

  public async handleDispatch(event: IpcMainEvent, data: unknown): Promise<void> {
    try {
      debug('ipc', `Received action data from renderer ${event.sender.id}:`, data);

      // Extract the action from the wrapper object
      const actionData = data as { action?: unknown; parentId?: string };
      const { action, parentId } = actionData || {};

      if (!action || typeof action !== 'object') {
        debug('ipc', '[BRIDGE DEBUG] Invalid action received:', data);
        return;
      }

      // Cast action to Action type after validation
      const actionObj = action as Action;

      debug('ipc', `[BRIDGE DEBUG] Received action from renderer ${event.sender.id}:`, {
        type: actionObj.type,
        id: actionObj.__id,
        payload: actionObj.payload,
        parentId: parentId,
      });

      if (!actionObj.type) {
        debug('ipc', '[BRIDGE DEBUG] Action missing type:', data);
        return;
      }

      // Add the source window ID to the action for acknowledgment purposes
      const actionWithSource: Action = {
        ...actionObj,
        __sourceWindowId: event.sender.id,
      };

      // If this is a thunk action, ensure the thunk is registered before enqueueing
      if (parentId && !thunkManager.hasThunk(parentId)) {
        debug(
          'ipc',
          `[BRIDGE DEBUG] Registering thunk ${parentId} before enqueueing action ${actionObj.__id}`,
        );
        const thunkObj = new ThunkClass({
          id: parentId,
          sourceWindowId: event.sender.id,
          source: 'renderer',
        });
        await this.thunkRegistrationQueue.registerThunk(thunkObj);
      }

      // Queue the action for processing
      actionQueue.enqueueAction(actionWithSource, event.sender.id, parentId, (error) => {
        // This callback is called when the action is completed (successfully or with error)
        debug(
          'ipc',
          `[BRIDGE DEBUG] Action ${actionObj.__id} completed with ${error ? 'error' : 'success'}`,
        );

        if (error) {
          debug(
            'ipc:error',
            `[BRIDGE DEBUG] Error details for action ${actionObj.__id}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
          debug(
            'ipc:error',
            `[BRIDGE DEBUG] Error object type: ${typeof error}, instanceof Error: ${error instanceof Error}`,
          );
          debug(
            'ipc:error',
            `[BRIDGE DEBUG] Error stack: ${error instanceof Error ? error.stack : 'No stack available'}`,
          );
        }

        try {
          if (!isDestroyed(event.sender)) {
            // Get current thunk state to piggyback with acknowledgment
            const thunkState = thunkManager.getActiveThunksSummary();

            // Send acknowledgment with thunk state and error information
            safelySendToWindow(event.sender, IpcChannel.DISPATCH_ACK, {
              actionId: actionObj.__id,
              thunkState,
              // Include error information if there was an error
              error: error ? (error instanceof Error ? error.message : String(error)) : null,
            });

            debug(
              'ipc',
              `[BRIDGE DEBUG] Acknowledgment sent for action ${actionObj.__id} to window ${event.sender.id}`,
            );

            // Track action acknowledged with middleware
            const middlewareCallbacks = this.resourceManager.getMiddlewareCallbacks();
            if (middlewareCallbacks.trackActionAcknowledged && actionObj.__id) {
              // Use void to indicate we're intentionally not awaiting
              void middlewareCallbacks.trackActionAcknowledged(actionObj.__id);
            }
          }
        } catch (ackError) {
          const ipcError = new IpcCommunicationError('Failed to send action acknowledgment', {
            channel: IpcChannel.DISPATCH_ACK,
            windowId: event.sender.id,
            originalError: ackError,
          });
          logZubridgeError(ipcError);
        }
      });
    } catch (error) {
      const ipcError = new IpcCommunicationError('Error handling IPC dispatch', {
        channel: IpcChannel.DISPATCH,
        windowId: event.sender.id,
        originalError: error,
      });
      logZubridgeError(ipcError);

      // Even on error, we should acknowledge the action was processed
      try {
        const actionData = data as { action?: { __id?: string } };
        const { action } = actionData || {};
        if (action?.__id) {
          debug('ipc', `Sending acknowledgment for action ${action.__id} despite error`);
          debug(
            'ipc',
            `[BRIDGE DEBUG] Sending acknowledgment for action ${action.__id} despite error`,
          );
          if (!isDestroyed(event.sender)) {
            safelySendToWindow(event.sender, IpcChannel.DISPATCH_ACK, {
              actionId: action.__id,
              thunkState: { version: 0, thunks: [] },
              error: serializeError(ipcError),
            });
            debug('ipc', `[BRIDGE DEBUG] Error acknowledgment sent for action ${action.__id}`);
          }
        }
      } catch (ackError) {
        const ackIpcError = new IpcCommunicationError('Failed to send error acknowledgment', {
          channel: IpcChannel.DISPATCH_ACK,
          windowId: event.sender.id,
          originalError: ackError,
        });
        logZubridgeError(ackIpcError);
      }
    }
  }

  public async handleTrackActionDispatch(event: IpcMainEvent, data: unknown): Promise<void> {
    try {
      const actionData = data as { action?: unknown };
      const { action } = actionData || {};
      if (!action || typeof action !== 'object') {
        debug('middleware:error', 'Invalid action tracking data received');
        return;
      }

      // Cast action to Action type after validation
      const actionObj = action as Action;

      if (!actionObj.type) {
        debug('middleware:error', 'Action missing type field');
        return;
      }

      debug(
        'middleware',
        `Received action dispatch tracking for ${actionObj.type} (ID: ${actionObj.__id})`,
      );

      // Add source window ID to the action
      const actionWithSource: Action = {
        ...actionObj,
        __sourceWindowId: event.sender.id,
        type: actionObj.type, // Ensure type is not undefined
      };

      // Call middleware tracking function if available
      const middlewareCallbacks = this.resourceManager.getMiddlewareCallbacks();
      if (middlewareCallbacks.trackActionDispatch) {
        // Ensure payload is a string for Rust middleware
        if (
          actionWithSource.payload !== undefined &&
          typeof actionWithSource.payload !== 'string'
        ) {
          actionWithSource.payload = JSON.stringify(actionWithSource.payload);
        }
        await middlewareCallbacks.trackActionDispatch(actionWithSource);
      }
    } catch (error) {
      const ipcError = new IpcCommunicationError('Error handling action dispatch tracking', {
        channel: IpcChannel.TRACK_ACTION_DISPATCH,
        windowId: event.sender.id,
        originalError: error,
      });
      logZubridgeError(ipcError);
    }
  }

  public handleGetState(
    event: IpcMainInvokeEvent,
    options: { bypassAccessControl?: boolean; keys?: string[] },
  ): Partial<State> {
    try {
      debug('ipc', 'Handling getState request');
      debug('ipc', `[BRIDGE DEBUG] Handling getState request from renderer ${event.sender.id}`);

      if (!this.stateManager) {
        debug('core', '[BRIDGE DEBUG] State manager is undefined or null in getState handler');
        return {};
      }
      if (!this.stateManager.getState) {
        debug('core', '[BRIDGE DEBUG] State manager missing getState method');
        return {};
      }

      const rawState = this.stateManager.getState();
      debug(
        'store',
        '[BRIDGE DEBUG] Raw state retrieved:',
        typeof rawState === 'object' ? Object.keys(rawState) : typeof rawState,
      );
      const state = sanitizeState(rawState);

      // Get window ID and subscriptions
      const windowId = event.sender.id;
      const subManager = this.resourceManager.getSubscriptionManager(windowId);
      const subscriptions = subManager ? subManager.getCurrentSubscriptionKeys(windowId) : [];

      // Check for bypassAccessControl in options or '*' subscription
      if (options?.bypassAccessControl || subscriptions.includes('*')) {
        debug(
          'ipc',
          `[BRIDGE DEBUG] Returning full state to renderer ${windowId} (bypass access control)`,
        );
        return state as Partial<State>;
      }

      // If no subscription manager exists yet, we're in initialization phase
      // Return full state to avoid race condition where getState() is called before subscription setup
      if (!subManager) {
        debug(
          'ipc',
          `[BRIDGE DEBUG] No subscription manager for window ${windowId} yet (initialization phase), returning full state`,
        );
        return state as Partial<State>;
      }

      // Otherwise, filter state by subscriptions
      debug(
        'ipc',
        `[BRIDGE DEBUG] Filtering state for renderer ${windowId} with subscriptions: ${subscriptions}`,
      );
      const filteredState = getPartialState(state, subscriptions);
      debug(
        'ipc',
        `[BRIDGE DEBUG] Returning filtered state to renderer ${windowId}: ${JSON.stringify(filteredState)}`,
      );
      return filteredState as Partial<State>;
    } catch (error) {
      const ipcError = new IpcCommunicationError('Error handling getState request', {
        channel: IpcChannel.GET_STATE,
        windowId: event.sender.id,
        originalError: error,
      });
      logZubridgeError(ipcError);
      return {};
    }
  }

  public async handleRegisterThunk(event: IpcMainEvent, data: unknown): Promise<void> {
    debug('core', '[BRIDGE DEBUG] REGISTER_THUNK IPC handler called');
    debug('core', `[BRIDGE DEBUG] Event sender ID: ${event.sender.id}`);
    debug('core', '[BRIDGE DEBUG] Data received:', data);

    try {
      const thunkData = data as {
        thunkId?: string;
        parentId?: string;
        bypassThunkLock?: boolean;
        bypassAccessControl?: boolean;
      };
      const { thunkId, parentId, bypassThunkLock, bypassAccessControl } = thunkData;
      const sourceWindowId = event.sender.id;

      debug(
        'core',
        `[BRIDGE DEBUG] Registering thunk ${thunkId} from window ${sourceWindowId}${
          parentId ? ` with parent ${parentId}` : ''
        }`,
      );

      // Use ThunkRegistrationQueue to register the thunk with proper global locking
      const thunkObj = new ThunkClass({
        id: thunkId,
        sourceWindowId: sourceWindowId,
        source: 'renderer',
        parentId: parentId,
        bypassThunkLock,
        bypassAccessControl,
      });
      await this.thunkRegistrationQueue.registerThunk(thunkObj);
      debug('core', `[BRIDGE DEBUG] Thunk ${thunkId} registration queued successfully`);

      // Send ack to renderer
      event.sender &&
        safelySendToWindow(event.sender, IpcChannel.REGISTER_THUNK_ACK, { thunkId, success: true });
    } catch (error) {
      const ipcError = new IpcCommunicationError('Error handling thunk registration', {
        channel: IpcChannel.REGISTER_THUNK,
        windowId: event.sender.id,
        originalError: error,
      });
      logZubridgeError(ipcError);

      // Send failure ack
      const errorData = data as { thunkId?: string };
      const { thunkId } = errorData || {};
      event.sender &&
        safelySendToWindow(event.sender, IpcChannel.REGISTER_THUNK_ACK, {
          thunkId,
          success: false,
          error: serializeError(ipcError),
        });
    }
  }

  public handleCompleteThunk(_event: IpcMainEvent, data: unknown): void {
    try {
      const completeData = data as { thunkId?: string };
      const { thunkId } = completeData;
      debug('ipc', `[BRIDGE DEBUG] Received thunk completion notification for ${thunkId}`);

      if (!thunkId) {
        debug('core', '[BRIDGE DEBUG] Missing thunkId in thunk completion notification');
        return;
      }

      const wasActive = thunkManager.isThunkActive(thunkId);
      thunkManager.completeThunk(thunkId);
      debug(
        'core',
        `[BRIDGE DEBUG] Thunk ${thunkId} marked for completion (was active: ${wasActive})`,
      );

      // The ThunkTracker will notify ActionQueueManager via state change listener
      debug(
        'core',
        '[BRIDGE DEBUG] ActionQueue will be notified via ThunkTracker state change listener',
      );
    } catch (error) {
      const ipcError = new IpcCommunicationError('Error handling thunk completion', {
        channel: IpcChannel.COMPLETE_THUNK,
        originalError: error,
      });
      logZubridgeError(ipcError);
    }
  }

  public handleStateUpdateAck(event: IpcMainEvent, data: unknown): void {
    try {
      const ackData = data as { updateId?: string; thunkId?: string };
      const { updateId, thunkId } = ackData || {};
      debug(
        'thunk',
        `Received state update acknowledgment for ${updateId} from renderer ${event.sender.id}`,
      );

      if (!updateId) {
        debug('thunk:warn', 'Missing updateId in state update acknowledgment');
        return;
      }

      // Mark this renderer as having acknowledged the update
      const allAcknowledged = thunkManager.acknowledgeStateUpdate(updateId, event.sender.id);

      if (allAcknowledged && thunkId) {
        debug('thunk', `All renderers acknowledged update ${updateId} for thunk ${thunkId}`);
        // The thunk completion will be checked by MainThunkProcessor polling
      }
    } catch (error) {
      const ipcError = new IpcCommunicationError('Error handling state update acknowledgment', {
        channel: IpcChannel.STATE_UPDATE_ACK,
        windowId: event.sender.id,
        originalError: error,
      });
      logZubridgeError(ipcError);
    }
  }

  public handleGetWindowId(event: IpcMainInvokeEvent): number {
    return event.sender.id;
  }

  public handleGetWindowSubscriptions(event: IpcMainInvokeEvent, windowId?: number): string[] {
    try {
      // If no explicit windowId is provided, use the sender's ID
      const targetWindowId = windowId || event.sender.id;
      const subManager = this.resourceManager.getSubscriptionManager(targetWindowId);
      const subscriptions = subManager ? subManager.getCurrentSubscriptionKeys(targetWindowId) : [];
      debug(
        'subscription',
        `[GET_WINDOW_SUBSCRIPTIONS] Window ${targetWindowId} subscriptions: ${subscriptions}`,
      );
      return subscriptions;
    } catch (error) {
      debug('subscription:error', '[GET_WINDOW_SUBSCRIPTIONS] Error getting subscriptions:', error);
      return [];
    }
  }

  public handleGetThunkState(): {
    version: number;
    thunks: Array<{ id: string; windowId: number; parentId?: string }>;
  } {
    try {
      const thunkState = thunkManager.getActiveThunksSummary();
      debug(
        'core',
        `[BRIDGE DEBUG] Returning thunk state with version ${thunkState.version} and ${thunkState.thunks.length} active thunks`,
      );
      return thunkState;
    } catch (error) {
      debug('core:error', '[BRIDGE DEBUG] Error getting thunk state:', error);
      return { version: 1, thunks: [] };
    }
  }

  cleanup(): void {
    debug('core', 'Removing all IPC handlers');
    ipcMain.removeHandler(IpcChannel.GET_WINDOW_ID);
    ipcMain.removeHandler(IpcChannel.GET_THUNK_STATE);
    ipcMain.removeHandler(IpcChannel.GET_STATE);
    ipcMain.removeHandler(IpcChannel.GET_WINDOW_SUBSCRIPTIONS);
    ipcMain.removeAllListeners(IpcChannel.DISPATCH);
    ipcMain.removeAllListeners(IpcChannel.TRACK_ACTION_DISPATCH);
    ipcMain.removeAllListeners(IpcChannel.REGISTER_THUNK);
    ipcMain.removeAllListeners(IpcChannel.COMPLETE_THUNK);
  }
}
