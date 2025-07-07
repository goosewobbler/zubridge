import { app, BrowserWindow, ipcMain } from 'electron';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createReduxBridge, type ZustandBridge, type ZubridgeMiddleware } from '@zubridge/electron/main';
import { State } from '../types.js';
import { createTray } from './tray/index.js';
import { createStore } from './store.js';
import type { Store } from 'redux';

const currentDir = dirname(fileURLToPath(import.meta.url));

// Process should be terminated when all windows are closed
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

type ZubridgeWindow = BrowserWindow & {
  windowId?: number;
  windowType?: string;
};

// Create windows side by side
const createWindows = (): BrowserWindow[] => {
  const windowWidth = 900;
  const windowHeight = 670;

  const mainWindow = new BrowserWindow({
    width: windowWidth,
    height: windowHeight,
    x: 0,
    y: 100,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(currentDir, '../preload/index.cjs'),
      sandbox: false,
    },
  }) as ZubridgeWindow;

  const secondWindow = new BrowserWindow({
    width: windowWidth,
    height: windowHeight,
    x: windowWidth,
    y: 100,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(currentDir, '../preload/index.cjs'),
      sandbox: false,
    },
  }) as ZubridgeWindow;

  // Set custom properties to identify windows
  mainWindow.windowId = 1;
  mainWindow.windowType = 'main';
  secondWindow.windowId = 2;
  secondWindow.windowType = 'secondary';

  // Show windows when ready
  mainWindow.on('ready-to-show', () => {
    mainWindow.show();
  });

  secondWindow.on('ready-to-show', () => {
    secondWindow.show();
  });

  const isDev = process.env.NODE_ENV === 'development';
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    secondWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
    secondWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(join(currentDir, '../renderer/index.html'));
    secondWindow.loadFile(join(currentDir, '../renderer/index.html'));
  }

  return [mainWindow, secondWindow];
};

/**
 * Creates a bridge using a Redux store
 * In this approach, we use Redux with Redux Toolkit to manage state
 */
const createReduxBridgeWithStore = (middleware?: ZubridgeMiddleware): { bridge: ZustandBridge; store: Store } => {
  console.log('[Redux Mode] Creating bridge with Redux store');

  // Create the Redux store
  const store = createStore();

  // Create bridge with Redux store and the createReduxBridge function from the library
  const bridge = createReduxBridge(store, {
    middleware,
  });

  return { bridge, store };
};

const createAndSubscribeWindows = (bridge: ZustandBridge) => {
  const [mainWindow, secondWindow] = createWindows();
  bridge.subscribe([mainWindow, secondWindow]);
  return [mainWindow, secondWindow];
};

// Initialize the app
app.whenReady().then(() => {
  // Create Redux bridge and store
  const { bridge, store } = createReduxBridgeWithStore();

  // Handle window info requests
  ipcMain.handle('get-window-info', (event) => {
    const sender = event.sender;
    const window = BrowserWindow.fromWebContents(sender) as ZubridgeWindow;

    return {
      type: window?.windowType || 'main',
      id: window?.windowId || 1,
    };
  });

  // Create both windows
  const windows = createAndSubscribeWindows(bridge);

  // Create and initialize tray with the shared store
  const tray = createTray(bridge, store, windows);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      const newWindows = createAndSubscribeWindows(bridge);
      tray.init(bridge, store, newWindows);
    }
  });
});
