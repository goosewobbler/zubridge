import { contextBridge, ipcRenderer } from 'electron';

import { preloadBridge } from '@zubridge/electron/preload';
import 'wdio-electron-service/preload';

import type { State } from '../types.js';
import { AppIpcChannel } from '../constants.js';

console.log('[Preload] Script initializing');

// Get handlers from the preload bridge
const { handlers } = preloadBridge<State>();

// Expose Zubridge handlers directly without wrapping
contextBridge.exposeInMainWorld('zubridge', handlers);

// Expose window control API
contextBridge.exposeInMainWorld('electronAPI', {
  closeCurrentWindow: () => {
    console.log('[Preload] Invoking closeCurrentWindow');
    return ipcRenderer.invoke(AppIpcChannel.CLOSE_CURRENT_WINDOW);
  },
  getWindowInfo: () => {
    console.log('[Preload] Invoking get-window-info');
    return ipcRenderer.invoke(AppIpcChannel.GET_WINDOW_INFO);
  },
  getMode: () => {
    console.log('[Preload] Invoking getMode');
    return ipcRenderer.invoke(AppIpcChannel.GET_MODE);
  },
  quitApp: () => {
    console.log('[Preload] Invoking quitApp');
    return ipcRenderer.invoke(AppIpcChannel.QUIT_APP);
  },
  createRuntimeWindow: () => {
    console.log('[Preload] Invoking create-runtime-window');
    return ipcRenderer.invoke(AppIpcChannel.CREATE_RUNTIME_WINDOW);
  },
  subscribe: (keys: string[]) => {
    console.log('[Preload] Invoking subscribe');
    return ipcRenderer.invoke(AppIpcChannel.SUBSCRIBE, keys);
  },
  unsubscribe: (keys: string[]) => {
    console.log('[Preload] Invoking unsubscribe');
    return ipcRenderer.invoke(AppIpcChannel.UNSUBSCRIBE, keys);
  },
});

// Expose counter API
contextBridge.exposeInMainWorld('counter', {
  executeMainThunk: () => {
    return ipcRenderer.invoke(AppIpcChannel.EXECUTE_MAIN_THUNK);
  },
  executeMainThunkSlow: () => {
    return ipcRenderer.invoke(AppIpcChannel.EXECUTE_MAIN_THUNK_SLOW);
  },
});

// Signal window creation when DOM content is loaded
window.addEventListener('DOMContentLoaded', () => {
  console.log('[Preload] DOM content loaded');
  setTimeout(() => {
    console.log('[Preload] Sending window-created signal');
    ipcRenderer.invoke(AppIpcChannel.WINDOW_CREATED).catch((err) => {
      console.error('[Preload] Error signaling window creation:', err);
    });
  }, 200);
});
