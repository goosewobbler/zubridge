import { debug } from '@zubridge/core';
import type { AnyState, StateManager, WrapperOrWebContents } from '@zubridge/types';
import type { WebContents } from 'electron';
import { v4 as uuidv4 } from 'uuid';
import { IpcChannel } from '../../constants.js';
import { SubscriptionManager } from '../../subscription/SubscriptionManager.js';
import { thunkManager } from '../../thunk/init.js';
import { sanitizeState } from '../../utils/serialization.js';
import {
  getWebContents,
  isDestroyed,
  safelySendToWindow,
  setupDestroyListener,
  type WebContentsTracker,
} from '../../utils/windows.js';
import type { ResourceManager } from '../resources/ResourceManager.js';

export class SubscriptionHandler<State extends AnyState> {
  constructor(
    private stateManager: StateManager<State>,
    private resourceManager: ResourceManager<State>,
    private windowTracker: WebContentsTracker,
    private serializationMaxDepth?: number,
  ) {}

  /**
   * Subscribe windows to state updates for specific keys.
   */
  selectiveSubscribe(
    windows: WrapperOrWebContents[] | WrapperOrWebContents,
    keys?: string[],
  ): { unsubscribe: () => void } {
    const wrappers = Array.isArray(windows) ? windows : [windows];
    const unsubs: Array<() => void> = [];
    const subscribedWebContents: WebContents[] = [];

    for (const wrapper of wrappers) {
      const webContents = getWebContents(wrapper);
      if (!webContents || isDestroyed(webContents)) continue;

      const tracked = this.windowTracker.track(webContents);
      subscribedWebContents.push(webContents);

      let subManager = this.resourceManager.getSubscriptionManager(webContents.id);
      if (!subManager) {
        subManager = new SubscriptionManager<State>();
        this.resourceManager.addSubscriptionManager(webContents.id, subManager);
      }

      // Set up a destroy listener to clean up subscriptions when the window is closed
      if (!this.resourceManager.hasDestroyListener(webContents.id)) {
        setupDestroyListener(webContents, () => {
          debug(
            'thunk',
            `Window ${webContents.id} destroyed, cleaning up subscriptions and pending state updates`,
          );
          this.resourceManager.removeSubscriptionManager(webContents.id);
          // Clean up dead renderer from pending state updates to prevent hanging acknowledgments
          thunkManager.cleanupDeadRenderer(webContents.id);
        });
        this.resourceManager.addDestroyListener(webContents.id);
      }

      // Register a subscription for the keys with an actual callback that sends state updates
      const unsubscribe = subManager.subscribe(
        keys,
        (state) => {
          debug('core', `Sending state update to window ${webContents.id}`);
          const serializationOptions =
            this.serializationMaxDepth !== undefined
              ? { maxDepth: this.serializationMaxDepth }
              : undefined;
          const sanitizedState = sanitizeState(state, serializationOptions);

          // Generate update ID and check if this state update is from a thunk action
          const updateId = uuidv4();
          const currentThunkId = thunkManager.getCurrentThunkActionId();

          // Only track state updates caused by thunk actions, not all updates while thunk is active
          if (currentThunkId) {
            thunkManager.trackStateUpdateForThunk(currentThunkId, updateId, [webContents.id]);
            debug(
              'core',
              `Tracking state update ${updateId} for thunk ${currentThunkId} (thunk-generated)`,
            );
          } else {
            debug('core', `State update ${updateId} not tracked (not from thunk action)`);
          }

          // Send enhanced state update with tracking information
          safelySendToWindow(webContents, IpcChannel.STATE_UPDATE, {
            updateId,
            state: sanitizedState,
            thunkId: currentThunkId,
          });
        },
        webContents.id,
      );
      unsubs.push(unsubscribe);

      if (tracked) {
        const serializationOptions =
          this.serializationMaxDepth !== undefined
            ? { maxDepth: this.serializationMaxDepth }
            : undefined;
        const initialState = sanitizeState(this.stateManager.getState(), serializationOptions);

        // Generate update ID for initial state
        const updateId = uuidv4();

        // Initial state is never from a thunk action, so don't track it
        debug('core', `Sending initial state update ${updateId} (not tracked - initial state)`);

        // Send initial state with tracking information
        safelySendToWindow(webContents, IpcChannel.STATE_UPDATE, {
          updateId,
          state: initialState,
          thunkId: undefined, // Initial state is never from a thunk
        });
      }
    }

    return {
      unsubscribe: () => {
        unsubs.forEach((fn) => {
          fn();
        });
        subscribedWebContents.forEach((webContents) => {
          this.windowTracker.untrack(webContents);
        });
      },
    };
  }

  /**
   * Subscribe windows to state updates.
   */
  subscribe(
    windows: WrapperOrWebContents[] | WrapperOrWebContents,
    keys?: string[],
  ): { unsubscribe: () => void } {
    debug(
      'core',
      `[subscribe] Called with windows and keys: ${keys ? JSON.stringify(keys) : 'undefined'}`,
    );

    // If windows is not provided, subscribe all windows to full state
    if (!windows) {
      const allWindows = this.windowTracker.getActiveWebContents();
      return this.selectiveSubscribe(allWindows);
    }

    // Pass keys as undefined (not []) when not specified to subscribe to all state
    // This ensures subscribe(windows) subscribes to all state
    return this.selectiveSubscribe(windows, keys);
  }

  /**
   * Unsubscribe windows from state updates.
   */
  unsubscribe(windows?: WrapperOrWebContents[] | WrapperOrWebContents, keys?: string[]): void {
    // If windows is not provided, unsubscribe all windows
    if (!windows) {
      this.resourceManager.clearAll();
      this.windowTracker.cleanup();
      return;
    }

    const wrappers = Array.isArray(windows) ? windows : [windows];
    for (const wrapper of wrappers) {
      const webContents = getWebContents(wrapper);
      if (!webContents) continue;
      const subManager = this.resourceManager.getSubscriptionManager(webContents.id);
      if (subManager) {
        subManager.unsubscribe(keys, () => {}, webContents.id);
        if (subManager.getCurrentSubscriptionKeys(webContents.id).length === 0) {
          this.resourceManager.removeSubscriptionManager(webContents.id);
        }
      }
      this.windowTracker.untrack(webContents);
    }
  }

  getWindowSubscriptions(windowId: number): string[] {
    const subManager = this.resourceManager.getSubscriptionManager(windowId);
    return subManager ? subManager.getCurrentSubscriptionKeys(windowId) : [];
  }
}
