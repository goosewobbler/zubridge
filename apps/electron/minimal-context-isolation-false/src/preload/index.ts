import { preloadBridge } from '@zubridge/electron/preload';
import { contextBridge, ipcRenderer } from 'electron';
import type { State } from '../features/index.js';

console.log('[Preload] Script initializing');
console.log('[Preload] Context isolation:', process.contextIsolated);

// Get handlers from the preload bridge
const { handlers } = preloadBridge<State>();

// Create electron API object
const electronAPI = {
  getWindowInfo: () => {
    console.log('[Preload] Invoking get-window-info');
    return ipcRenderer.invoke('get-window-info');
  },
};

// Define window interface for non-context-isolated environments
interface WindowWithAPIs extends Window {
  zubridge: typeof handlers;
  electronAPI: typeof electronAPI;
}

// Expose APIs based on context isolation setting
if (process.contextIsolated) {
  // Standard secure path: use contextBridge
  contextBridge.exposeInMainWorld('zubridge', handlers);
  contextBridge.exposeInMainWorld('electronAPI', electronAPI);
  console.log('[Preload] APIs exposed via contextBridge (contextIsolation: true)');
} else {
  // Legacy path: direct window assignment (SECURITY RISK)
  (window as WindowWithAPIs).zubridge = handlers;
  (window as WindowWithAPIs).electronAPI = electronAPI;
  console.log('[Preload] APIs exposed via window (contextIsolation: false - INSECURE)');
}

console.log('[Preload] Script initialized successfully');
