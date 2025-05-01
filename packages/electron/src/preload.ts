import { ipcRenderer } from 'electron';
import type { AnyState, Handlers, Action, Thunk } from '@zubridge/types';

import { IpcChannel } from './constants';

export type PreloadZustandBridgeReturn<S extends AnyState> = {
  handlers: Handlers<S>;
};

/**
 * Modern preload bridge that implements the new backend contract
 */
export const preloadBridge = <S extends AnyState>(): PreloadZustandBridgeReturn<S> => {
  const handlers: Handlers<S> = {
    subscribe(callback: (state: S) => void) {
      const listener = (_: unknown, state: S) => callback(state);
      ipcRenderer.on(IpcChannel.SUBSCRIBE, listener);
      return () => {
        ipcRenderer.removeListener(IpcChannel.SUBSCRIBE, listener);
      };
    },

    async getState() {
      return ipcRenderer.invoke(IpcChannel.GET_STATE) as Promise<S>;
    },

    dispatch(action: Thunk<S> | Action | string, payload?: unknown) {
      if (typeof action === 'function') {
        // For thunks, we don't do anything in the preload
        // The renderer implementation will handle executing them
        // This just prevents an error from being thrown
        return;
      } else if (typeof action === 'string') {
        // Create an action object
        const actionObj: Action = {
          type: action,
          payload: payload,
          // Generate a unique ID for this action to track acknowledgment
          id: `${Date.now()}_${Math.random().toString(36).slice(2)}`,
        };

        // Return a promise that resolves when the action is acknowledged
        return new Promise<void>((resolve) => {
          // Set up one-time listener for acknowledgment with this action ID
          const ackListener = (_: unknown, ackId: string) => {
            if (ackId === actionObj.id) {
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
          id: action.id || `${Date.now()}_${Math.random().toString(36).slice(2)}`,
        };

        // Return a promise that resolves when the action is acknowledged
        return new Promise<void>((resolve) => {
          // Set up one-time listener for acknowledgment with this action ID
          const ackListener = (_: unknown, ackId: string) => {
            if (ackId === actionWithId.id) {
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
