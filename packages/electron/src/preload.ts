import { ipcRenderer } from 'electron';

import type { AnyState, Handlers, Action, Thunk } from '@zubridge/types';
import { v4 as uuidv4 } from 'uuid';

import { IpcChannel } from './constants.js';
import { debug } from './utils/debug.js';

export type PreloadZustandBridgeReturn<S extends AnyState> = {
  handlers: Handlers<S>;
};

/**
 * Modern preload bridge that implements the new backend contract
 */
export const preloadBridge = <S extends AnyState>(): PreloadZustandBridgeReturn<S> => {
  debug('core', 'Initializing preload bridge');

  const handlers: Handlers<S> = {
    subscribe(callback: (state: S) => void) {
      debug('ipc', 'Setting up subscription in preload');

      const listener = (_: unknown, state: S) => {
        debug('ipc', 'Received state update from main process');
        callback(state);
      };

      ipcRenderer.on(IpcChannel.SUBSCRIBE, listener);

      return () => {
        debug('ipc', 'Unsubscribing from state updates');
        ipcRenderer.removeListener(IpcChannel.SUBSCRIBE, listener);
      };
    },

    async getState() {
      debug('ipc', 'Getting initial state from main process');
      const state = (await ipcRenderer.invoke(IpcChannel.GET_STATE)) as Promise<S>;
      debug('ipc', 'Received initial state');
      return state;
    },

    dispatch(action: Thunk<S> | Action | string, payload?: unknown) {
      if (typeof action === 'function') {
        debug('ipc', 'Handling thunk action in preload (no-op)');
        // For thunks, we don't do anything in the preload
        // The renderer implementation will handle executing them
        // This just prevents an error from being thrown
        return Promise.resolve();
      } else if (typeof action === 'string') {
        // Create an action object
        const actionObj: Action = {
          type: action,
          payload: payload,
          // Generate a unique ID for this action to track acknowledgment
          id: uuidv4(),
        };

        debug('ipc', `Dispatching string action "${action}" with ID ${actionObj.id}`);

        // Return a promise that resolves when the action is acknowledged
        return new Promise<void>((resolve) => {
          // Set up one-time listener for acknowledgment with this action ID
          const ackListener = (_: unknown, ackId: string) => {
            if (ackId === actionObj.id) {
              debug('ipc', `Received acknowledgment for action ${ackId}`);
              ipcRenderer.removeListener(IpcChannel.DISPATCH_ACK, ackListener);
              resolve();
            }
          };

          ipcRenderer.on(IpcChannel.DISPATCH_ACK, ackListener);
          ipcRenderer.send(IpcChannel.DISPATCH, actionObj);
        });
      } else {
        // For regular action objects, add a unique ID if not already present
        const actionWithId: Action = {
          ...action,
          id: action.id || uuidv4(),
        };

        debug('ipc', `Dispatching object action "${actionWithId.type}" with ID ${actionWithId.id}`);

        // Return a promise that resolves when the action is acknowledged
        return new Promise<void>((resolve) => {
          // Set up one-time listener for acknowledgment with this action ID
          const ackListener = (_: unknown, ackId: string) => {
            if (ackId === actionWithId.id) {
              debug('ipc', `Received acknowledgment for action ${ackId}`);
              ipcRenderer.removeListener(IpcChannel.DISPATCH_ACK, ackListener);
              resolve();
            }
          };

          ipcRenderer.on(IpcChannel.DISPATCH_ACK, ackListener);
          ipcRenderer.send(IpcChannel.DISPATCH, actionWithId);
        });
      }
    },
  };

  debug('core', 'Preload bridge initialized');
  return { handlers };
};

/**
 * Legacy preload bridge for backward compatibility
 * @deprecated This is now an alias for preloadBridge and uses the new IPC channels.
 * Please update your code to use preloadBridge directly in the future.
 */
export const preloadZustandBridge = preloadBridge;

export type PreloadZustandBridge = typeof preloadZustandBridge;
export type PreloadBridge = typeof preloadBridge;
