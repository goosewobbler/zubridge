import { contextBridge, ipcRenderer } from 'electron';
import { createUseStore } from '@zubridge/electron';
import type { State } from '../features/index.js';

console.log('[Preload] Script initializing');

// Index signature to satisfy AnyState requirement
interface AppState extends State {
  [key: string]: unknown;
}

// Create the store hook for the renderer
export const useStore = createUseStore<AppState>();

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  getWindowInfo: () => ipcRenderer.invoke('get-window-info'),
});

// Expose the store hook
contextBridge.exposeInMainWorld('zubridge', {
  useStore,
});

console.log('[Preload] Script initialized successfully');
