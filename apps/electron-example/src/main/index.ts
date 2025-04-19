import path from 'node:path';
import process from 'node:process';
import { BrowserWindow, type BrowserWindowConstructorOptions, app, ipcMain } from 'electron';

import { isDev } from '@zubridge/electron';
import 'wdio-electron-service/main';

import { store, initStore } from './store.js';
import { tray } from './tray/index.js';
import { createBridge } from './bridge.js';
import { getModeName, getZubridgeMode } from '../utils/mode.js';
import { getPreloadPath } from '../utils/path.js';

// Ensure NODE_ENV is always set
process.env.NODE_ENV = process.env.NODE_ENV || (app.isPackaged ? 'production' : 'development');

// Check if we're in development mode using the shared utility
const isDevMode = await isDev();

const icon = path.join(__dirname, '..', '..', 'resources', 'images', 'icon.png');

const mode = getZubridgeMode();
const modeName = getModeName();

// Ensure we always use the absolute path for the preload script
const preloadPath = getPreloadPath(__dirname);
console.log('Using preload path:', preloadPath);

const windowOptions: BrowserWindowConstructorOptions = {
  show: false,
  icon,
  title: `Zubridge Electron Example (${modeName}) - Main Window`,
  width: 800,
  height: 600,
  webPreferences: {
    contextIsolation: true,
    scrollBounce: true,
    sandbox: true,
    nodeIntegration: false,
    preload: preloadPath,
  },
};

// Flag to track when app is explicitly being quit
let isAppQuitting = false;

// Keep track of the main window and the secondary window
let mainWindow: BrowserWindow | null = null;
let secondaryWindow: BrowserWindow | null = null;
// Track runtime windows that need cleanup
const runtimeWindows: BrowserWindow[] = [];

function initMainWindow(): BrowserWindow {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
    return mainWindow;
  }

  mainWindow = new BrowserWindow({
    ...windowOptions,
    title: `Zubridge Electron Example (${modeName}) - Main Window`,
  });

  mainWindow.setTitle(`Zubridge Electron Example (${modeName}) - Main Window`);
  console.log('Set main window title:', mainWindow.getTitle());

  if (isDevMode) {
    mainWindow.loadURL('http://localhost:5173/');
  } else {
    const htmlPath = path.join(__dirname, '..', 'renderer', 'index.html');
    mainWindow.loadFile(htmlPath);
  }

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.on('close', (event) => {
    if (isAppQuitting || (secondaryWindow && !secondaryWindow.isDestroyed())) {
      mainWindow = null; // Allow GC
      return; // Allow closing if quitting or other primary window exists
    }
    event.preventDefault();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.hide();
    }
  });

  return mainWindow;
}

// Function to initialize the secondary window
function initSecondaryWindow(): BrowserWindow {
  if (secondaryWindow && !secondaryWindow.isDestroyed()) {
    secondaryWindow.show();
    return secondaryWindow;
  }

  secondaryWindow = new BrowserWindow({
    ...windowOptions, // Use base options
    title: `Zubridge Electron Example (${modeName}) - Secondary Window`, // Specific title
    width: 700, // Different size
    height: 500,
    x: windowOptions.x ? windowOptions.x + 50 : 100, // Offset position
    y: windowOptions.y ? windowOptions.y + 50 : 100,
  });

  secondaryWindow.setTitle(`Zubridge Electron Example (${modeName}) - Secondary Window`);

  if (isDevMode) {
    secondaryWindow.loadURL('http://localhost:5173/');
    // Optionally open DevTools for the second window too
    // secondaryWindow.webContents.openDevTools();
  } else {
    const htmlPath = path.join(__dirname, '..', 'renderer', 'index.html');
    secondaryWindow.loadFile(htmlPath);
  }

  secondaryWindow.on('ready-to-show', () => {
    secondaryWindow?.show(); // Use optional chaining
  });

  // Allow secondary window to close normally, but nullify reference
  secondaryWindow.on('close', () => {
    secondaryWindow = null;
  });

  return secondaryWindow;
}

// Function to create a new runtime window
function createRuntimeWindow(): BrowserWindow {
  const runtimeWindow = new BrowserWindow({
    ...windowOptions, // Use base options
    width: 450, // Maybe different size for runtime
    height: 350,
    title: `Zubridge Electron Example (${modeName}) - Runtime Window`,
    // Ensure webPreferences are set correctly!
    webPreferences: {
      ...windowOptions.webPreferences, // Inherit base prefs (includes preload)
      // any runtime-specific overrides?
    },
  });

  // Track this window
  runtimeWindows.push(runtimeWindow);
  console.log(`Runtime window ${runtimeWindow.id} created and tracked.`);

  if (isDevMode) {
    runtimeWindow.loadURL('http://localhost:5173/');
    // Optionally open DevTools
    // runtimeWindow.webContents.openDevTools();
  } else {
    const htmlPath = path.join(__dirname, '..', 'renderer', 'index.html');
    runtimeWindow.loadFile(htmlPath);
  }

  runtimeWindow.on('ready-to-show', () => {
    runtimeWindow.show();
  });

  // Important: Clean up from runtimeWindows array when closed
  runtimeWindow.once('closed', () => {
    const index = runtimeWindows.findIndex((w) => w.id === runtimeWindow.id);
    if (index !== -1) {
      runtimeWindows.splice(index, 1);
      console.log(`Runtime window ${runtimeWindow.id} removed from tracking.`);
    }
    // Note: bridge subscription cleanup is handled by trackNewWindows listener
  });

  return runtimeWindow;
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    isAppQuitting = true;
    app.quit();
  }
});

app.on('before-quit', () => {
  isAppQuitting = true;
});

app
  .whenReady()
  .then(async () => {
    // Initialize the store
    await initStore();

    // Create both windows
    const initialMainWindow = initMainWindow();
    const initialSecondaryWindow = initSecondaryWindow();

    // Create the bridge, passing both initial windows for synchronization
    const bridge = await createBridge(store, [initialMainWindow, initialSecondaryWindow]);

    // Initialize the system tray - pass main window for potential interaction logic
    const trayInstance = tray(store, initialMainWindow);

    // Get the subscribe function from the bridge
    const { subscribe } = bridge;

    // On macOS activate, ensure both primary windows are handled
    app.on('activate', () => {
      // Use optional chaining and null checks
      const hasMainWindow = mainWindow && !mainWindow.isDestroyed();
      const hasSecondaryWindow = secondaryWindow && !secondaryWindow.isDestroyed();

      let windowToFocus: BrowserWindow | null = null;

      if (!hasMainWindow) {
        const newMainWindow = initMainWindow();
        subscribe([newMainWindow]); // Subscribe new main window
        windowToFocus = newMainWindow;
      } else if (!mainWindow?.isVisible()) {
        mainWindow?.show();
        windowToFocus = mainWindow;
      } else {
        windowToFocus = mainWindow;
      }

      if (!hasSecondaryWindow) {
        const newSecondaryWindow = initSecondaryWindow();
        subscribe([newSecondaryWindow]);
      } else if (!secondaryWindow?.isVisible()) {
        secondaryWindow?.show();
      }

      // Focus the determined window (use optional chaining)
      windowToFocus?.focus();
    });

    // Function to track and subscribe new windows to the bridge
    const trackNewWindows = () => {
      try {
        const allWindows = BrowserWindow.getAllWindows();
        for (const win of allWindows) {
          // Ensure we skip mainWindow and secondaryWindow correctly
          if (!win || win.isDestroyed() || win === mainWindow || win === secondaryWindow) {
            continue;
          }

          const isTracked = runtimeWindows.some((w) => w === win);
          if (!isTracked) {
            runtimeWindows.push(win);
            const subscription = subscribe([win]);
            win.once('closed', () => {
              const index = runtimeWindows.indexOf(win);
              if (index !== -1) runtimeWindows.splice(index, 1);
              subscription.unsubscribe();
              console.log(`Window ${win.id} closed and unsubscribed`);
            });
          }
        }

        // Clean up destroyed windows from runtimeWindows
        for (let i = runtimeWindows.length - 1; i >= 0; i--) {
          if (runtimeWindows[i]?.isDestroyed()) {
            // Optional chaining for safety
            runtimeWindows.splice(i, 1);
          }
        }
      } catch (error) {
        console.error('Error tracking windows:', error);
      }
    };

    // Run the tracker when the app starts
    trackNewWindows();

    // Poll for new windows every second to catch any windows created by child windows
    const windowTrackingInterval = setInterval(trackNewWindows, 1000);

    // Modify quit handler to clean up both windows if they exist
    app.on('quit', () => {
      try {
        clearInterval(windowTrackingInterval);
        trayInstance.destroy();
        bridge.unsubscribe();

        // Close runtime windows
        runtimeWindows.forEach((window) => {
          if (window && !window.isDestroyed()) {
            window.removeAllListeners('closed'); // Prevent listener leaks
            window.close();
          }
        });
        runtimeWindows.length = 0;

        // Explicitly destroy main and secondary if they weren't closed
        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.destroy();
        if (secondaryWindow && !secondaryWindow.isDestroyed()) secondaryWindow.destroy();
      } catch (error) {
        console.error('Error during cleanup:', error);
      }
    });

    app.focus({ steal: true });
    mainWindow?.focus();

    // Set up the handler for closeCurrentWindow
    ipcMain.handle('closeCurrentWindow', async (event) => {
      try {
        // Get the window that sent this message
        const window = BrowserWindow.fromWebContents(event.sender);

        if (window) {
          // If this is the main window, just minimize it
          if (window === mainWindow) {
            if (!window.isDestroyed()) {
              window.minimize();
            }
          } else {
            // Common close logic for all modes
            console.log(`Closing window ${window.id}`);

            // In all modes, just close the window directly
            window.isFocused() && window.close();
          }
        }
        return true;
      } catch (error) {
        console.error('Error handling closeCurrentWindow:', error);
        return false;
      }
    });

    // Set up handler for window-created event
    ipcMain.handle('window-created', (_event) => {
      // Immediately track the new window
      trackNewWindows();
      return true;
    });

    // Set up handler to check if the window is the main window
    ipcMain.handle('is-main-window', (event) => {
      const window = BrowserWindow.fromWebContents(event.sender);
      // Check if this is the main window
      return window === mainWindow;
    });

    // Set up handler to get the window ID
    ipcMain.handle('get-window-id', (event) => {
      const window = BrowserWindow.fromWebContents(event.sender);
      return window ? window.id : null;
    });

    // Set up handler to get window type (main, secondary, runtime) and ID
    ipcMain.handle('get-window-info', (event) => {
      const window = BrowserWindow.fromWebContents(event.sender);
      if (!window) {
        return null;
      }
      const windowId = window.id;
      let windowType: 'main' | 'secondary' | 'runtime' = 'runtime'; // Default to runtime

      if (window === mainWindow) {
        windowType = 'main';
      } else if (window === secondaryWindow) {
        windowType = 'secondary';
      }
      // No need to check runtimeWindows array explicitly, default handles it

      return { type: windowType, id: windowId };
    });

    // --> NEW: IPC Handler for creating runtime windows <--
    ipcMain.handle('create-runtime-window', (event) => {
      console.log(`IPC: Received request to create runtime window from sender ${event.sender.id}`);
      const newWindow = createRuntimeWindow();
      // Subscribe the new window immediately
      subscribe([newWindow]);
      return { success: true, windowId: newWindow.id };
    });
    // --> END NEW HANDLER <--

    // Set up handler to get the current mode
    ipcMain.handle('get-mode', () => {
      return {
        mode,
        modeName,
      };
    });

    // Set up handler to quit the app
    ipcMain.handle('quitApp', () => {
      isAppQuitting = true;
      app.quit();
      return true;
    });
  })
  .catch((error) => {
    console.error('Error during app initialization:', error);
  });

// For testing and debugging
console.log('App starting in environment:', process.env.NODE_ENV);
console.log('isDev:', isDevMode);
console.log(`Using Zubridge mode: ${modeName}`);
console.log('electron/index.ts is loaded');
