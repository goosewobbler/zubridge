import { contextBridge, ipcRenderer } from 'electron';
import { preloadBridge } from '@zubridge/electron/preload';

console.log('[Preload] Script initializing');

// Simple state interface for basic mode
interface State {
  'counter': number;
  'theme': 'light' | 'dark';

  // Action handlers for basic mode
  'COUNTER:INCREMENT': () => void;
  'COUNTER:DECREMENT': () => void;
  'THEME:TOGGLE': () => void;

  // Index signature to satisfy AnyState requirement
  [key: string]: any;
}

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
