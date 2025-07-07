import { app, BrowserWindow, ipcMain } from 'electron';
import { createReducersBridge } from '../bridge.js';
import { getReducersStore } from '../store.js';
import type { State } from '../features/index.js';
import type { StoreApi } from 'zustand';
import { createTray } from './tray/index.js';

// Extend BrowserWindow to include custom properties
interface ZubridgeWindow extends BrowserWindow {
  windowId?: number;
  windowType?: string;
}

let mainWindow: ZubridgeWindow | undefined;
let secondWindow: ZubridgeWindow | undefined;
let store: StoreApi<State>;
let bridge: ReturnType<typeof createReducersBridge>;

function createWindow() {
  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: new URL('../preload/index.js', import.meta.url).pathname,
    },
  }) as ZubridgeWindow;

  // Create second window
  secondWindow = new BrowserWindow({
    width: 800,
    height: 600,
    x: 800, // Position next to first window
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: new URL('../preload/index.js', import.meta.url).pathname,
    },
  }) as ZubridgeWindow;

  // Load the index.html of the app
  mainWindow.loadFile(new URL('../renderer/index.html', import.meta.url).pathname);
  secondWindow.loadFile(new URL('../renderer/index.html', import.meta.url).pathname);

  // Open DevTools in development
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
    secondWindow.webContents.openDevTools();
  }

  // Set window properties for IPC
  mainWindow.windowId = 1;
  mainWindow.windowType = 'main';
  secondWindow.windowId = 2;
  secondWindow.windowType = 'second';

  // Handle window closed
  mainWindow.on('closed', () => {
    mainWindow = undefined;
  });

  secondWindow.on('closed', () => {
    secondWindow = undefined;
  });
}

function initializeApp() {
  console.log('[Main] Initializing reducers-minimal app');

  // Create the Zustand store
  store = getReducersStore();

  // Create the bridge with reducers mode
  bridge = createReducersBridge(store);

  // Subscribe the bridge to the windows
  bridge.subscribe([mainWindow!, secondWindow!]);

  // Create and initialize the tray
  const tray = createTray(store, [mainWindow!, secondWindow!]);

  console.log('[Main] App initialized successfully');
}

// IPC handler for getting window info
ipcMain.handle('get-window-info', (event) => {
  const window = BrowserWindow.fromWebContents(event.sender) as ZubridgeWindow;
  if (window) {
    return {
      id: window.windowId,
      type: window.windowType,
    };
  }
  return { id: 0, type: 'unknown' };
});

// This method will be called when Electron has finished initialization
app.whenReady().then(() => {
  createWindow();
  initializeApp();

  app.on('activate', () => {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Quit when all windows are closed, except on macOS
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Handle app quit
app.on('before-quit', () => {
  console.log('[Main] App quitting');
});
