import { contextBridge, ipcRenderer } from 'electron';

import { preloadBridge } from '@zubridge/electron/preload';
import 'wdio-electron-service/preload';

import type { State } from '../types/index.js';

console.log('[Preload] Script initializing');

const { handlers } = preloadBridge<State>();

// Add debugging to handlers
const wrappedHandlers = {
  ...handlers,
  dispatch: (action: any, payload?: any) => {
    console.log('[Preload] Dispatching to main process:', action, payload);
    return handlers.dispatch(action, payload);
  },
  getState: async () => {
    console.log('[Preload] Getting state from main process');
    const state = await handlers.getState();
    console.log('[Preload] Received state:', state);
    return state;
  },
  subscribe: (callback: any) => {
    console.log('[Preload] Setting up subscription');
    return handlers.subscribe((state) => {
      console.log('[Preload] Subscription update received');
      callback(state);
    });
  },
};

// Expose Zubridge handlers
contextBridge.exposeInMainWorld('zubridge', wrappedHandlers);

// Expose window control API
contextBridge.exposeInMainWorld('electronAPI', {
  closeCurrentWindow: () => {
    console.log('[Preload] Invoking closeCurrentWindow');
    return ipcRenderer.invoke('closeCurrentWindow');
  },
  getWindowInfo: () => {
    console.log('[Preload] Invoking get-window-info');
    return ipcRenderer.invoke('get-window-info');
  },
  getMode: () => {
    console.log('[Preload] Invoking getMode');
    return ipcRenderer.invoke('get-mode');
  },
  quitApp: () => {
    console.log('[Preload] Invoking quitApp');
    return ipcRenderer.invoke('quitApp');
  },
  createRuntimeWindow: () => {
    console.log('[Preload] Invoking create-runtime-window');
    return ipcRenderer.invoke('create-runtime-window');
  },
});

// Signal window creation when DOM content is loaded
window.addEventListener('DOMContentLoaded', () => {
  console.log('[Preload] DOM content loaded');
  setTimeout(() => {
    console.log('[Preload] Sending window-created signal');
    ipcRenderer.invoke('window-created').catch((err) => {
      console.error('[Preload] Error signaling window creation:', err);
    });
  }, 200);
});
