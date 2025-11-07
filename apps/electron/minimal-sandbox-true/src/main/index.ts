import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow, ipcMain } from 'electron';
import { createBridge } from './bridge.js';
import { createStore } from './store.js';
import { createTray } from './tray/index.js';

// Add comprehensive crash handling and native debugging
console.log('[CRASH DEBUG] Setting up crash handlers and native debugging...');

// 1. Add crash handlers
process.on('uncaughtException', (error) => {
  console.error('[CRASH DEBUG] Uncaught Exception:', error);
  console.error('[CRASH DEBUG] Stack:', error.stack);
  console.error('[CRASH DEBUG] Process will exit...');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[CRASH DEBUG] Unhandled Rejection at:', promise, 'reason:', reason);
});

// 2. Add Electron crash detection
app.on('child-process-gone', (_event, details) => {
  console.error('[CRASH DEBUG] Child process gone:', details);
});

app.on('render-process-gone', (_event, _webContents, details) => {
  console.error('[CRASH DEBUG] Render process gone:', details);
});

// 3. Log detailed process info
console.log('[CRASH DEBUG] Process info:');
console.log('[CRASH DEBUG] - Platform:', process.platform);
console.log('[CRASH DEBUG] - Arch:', process.arch);
console.log('[CRASH DEBUG] - Node version:', process.version);
console.log('[CRASH DEBUG] - Electron version:', process.versions.electron);
console.log('[CRASH DEBUG] - Chrome version:', process.versions.chrome);
console.log('[CRASH DEBUG] - V8 version:', process.versions.v8);
console.log('[CRASH DEBUG] - Process ID:', process.pid);
console.log('[CRASH DEBUG] - Working directory:', process.cwd());
console.log('[CRASH DEBUG] - Environment DISPLAY:', process.env.DISPLAY);
console.log('[CRASH DEBUG] - Environment NODE_ENV:', process.env.NODE_ENV);

// 4. Add app-level crash debugging
app.on('before-quit', (_event) => {
  console.log('[CRASH DEBUG] App before-quit event fired');
});

app.on('will-quit', (_event) => {
  console.log('[CRASH DEBUG] App will-quit event fired');
});

app.on('ready', () => {
  console.log('[CRASH DEBUG] App ready event fired successfully');
});

console.log('[CRASH DEBUG] Crash handlers set up successfully');

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
      sandbox: true,
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
      sandbox: true,
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

const createAndSubscribeWindows = (bridge: ReturnType<typeof createBridge>) => {
  const [mainWindow, secondWindow] = createWindows();
  bridge.subscribe([mainWindow, secondWindow]);
  return [mainWindow, secondWindow];
};

// Initialize the app
app.whenReady().then(() => {
  // Create Zustand store
  const store = createStore();

  // Create bridge
  const bridge = createBridge(store);

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
