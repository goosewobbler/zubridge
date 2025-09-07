import { preloadBridge } from '@zubridge/electron/preload';
import { contextBridge, ipcRenderer } from 'electron';
import type { State } from '../features/index.js';

console.log('[Preload] Script initializing');

// Get handlers from the preload bridge
const { handlers } = preloadBridge<State>();

// Expose Zubridge handlers directly without wrapping
contextBridge.exposeInMainWorld('zubridge', handlers);

// Expose simple Electron API
contextBridge.exposeInMainWorld('electronAPI', {
  getWindowInfo: () => {
    console.log('[Preload] Invoking get-window-info');
    return ipcRenderer.invoke('get-window-info');
  },
});

console.log('[Preload] Script initialized successfully');
