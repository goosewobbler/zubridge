import { app, BrowserWindow, ipcMain } from 'electron';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createZustandBridge, type ZustandBridge } from '@zubridge/electron/main';
import { create } from 'zustand';
import { State } from '../types.js';
import { createTray } from './tray/index.js';

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

const createAndSubscribeWindows = (bridge: ZustandBridge) => {
  const [mainWindow, secondWindow] = createWindows();
  bridge.subscribe([mainWindow, secondWindow]);
  return [mainWindow, secondWindow];
};

// Initialize the app
app.whenReady().then(() => {
  // Create initial state
  const initialState: State = {
    'counter': 0,
    'theme': 'dark',
    'COUNTER:INCREMENT': () => {},
    'COUNTER:DECREMENT': () => {},
    'THEME:TOGGLE': () => {},
  };

  // Create Zustand store
  const store = create<State>()(() => initialState);

  // Attach action handlers to the store (basic mode pattern)
  store.setState((state) => ({
    ...state,
    'COUNTER:INCREMENT': () => {
      console.log('[Basic] Incrementing counter');
      store.setState((state) => ({
        ...state,
        counter: state.counter + 1,
      }));
    },
    'COUNTER:DECREMENT': () => {
      console.log('[Basic] Decrementing counter');
      store.setState((state) => ({
        ...state,
        counter: state.counter - 1,
      }));
    },
    'THEME:TOGGLE': () => {
      console.log('[Basic] Toggling theme');
      store.setState((state) => ({
        ...state,
        theme: state.theme === 'dark' ? 'light' : 'dark',
      }));
    },
  }));

  // Create bridge
  const bridge = createZustandBridge(store);

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

  // Create and initialize tray
  const tray = createTray(store, windows);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      const newWindows = createAndSubscribeWindows(bridge);
      tray.init(store, newWindows);
    }
  });
});
