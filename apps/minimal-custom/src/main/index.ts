import { app, BrowserWindow, ipcMain } from 'electron';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createCoreBridge, createDispatch, type ZustandBridge, type ZubridgeMiddleware } from '@zubridge/electron/main';
import { State } from '../types.js';
import { createTray } from './tray/index.js';
import { getCustomStore } from './store.js';
import type { StateManager, AnyState } from '@zubridge/types';

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
 * Creates a bridge using the custom store approach
 * This demonstrates how to use createCoreBridge with a custom state manager
 */
const createCustomBridge = (
  middleware?: ZubridgeMiddleware,
): { bridge: ZustandBridge; store: StateManager<AnyState> } => {
  console.log('[Custom Mode] Creating bridge with custom state manager');

  // Get a CustomStore instance from our implementation
  const customStore = getCustomStore();

  // Create the core bridge with our custom store
  const coreBridge = createCoreBridge(customStore, { middleware });

  // Create a dispatch function that works with our store
  const dispatchFn = createDispatch(customStore);

  // Log initial state for debugging
  console.log('[Custom Mode] Initial state:', customStore.getState());

  // Return the bridge interface that matches other bridge implementations
  const bridge = {
    subscribe: coreBridge.subscribe,
    unsubscribe: coreBridge.unsubscribe,
    getSubscribedWindows: coreBridge.getSubscribedWindows,
    destroy: coreBridge.destroy,
    dispatch: dispatchFn,
    getWindowSubscriptions: coreBridge.getWindowSubscriptions,
  };

  return { bridge, store: customStore };
};

const createAndSubscribeWindows = (bridge: ZustandBridge) => {
  const [mainWindow, secondWindow] = createWindows();
  bridge.subscribe([mainWindow, secondWindow]);
  return [mainWindow, secondWindow];
};

// Initialize the app
app.whenReady().then(() => {
  // Create custom bridge and store
  const { bridge, store } = createCustomBridge();

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
