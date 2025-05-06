import process from 'node:process';
import { BrowserWindow, app, ipcMain } from 'electron';

import { isDev } from '@zubridge/electron';
import { createDispatch } from '@zubridge/electron/main';
import type { WrapperOrWebContents } from '@zubridge/types';
import 'wdio-electron-service/main';

import { createMainProcessThunk } from './actions.js';
import { store, initStore } from './store.js';
import { tray } from './tray/index.js';
import { createBridge } from './bridge.js';
import { getModeName, getZubridgeMode } from '../utils/mode.js';
import { getPreloadPath } from '../utils/path.js';
import * as windows from './window.js';

// Debug logger
function debug(message: string) {
  const timestamp = new Date().toISOString();
  console.log(`[DEBUG ${timestamp}] ${message}`);
}

debug('Starting app initialization');

// Ensure NODE_ENV is always set
process.env.NODE_ENV = process.env.NODE_ENV || (app.isPackaged ? 'production' : 'development');

// Check if we're in development mode using the shared utility
debug('Checking dev mode');
const isDevMode = await isDev();
debug(`Dev mode: ${isDevMode}`);

// Check if we're in test mode
const isTestMode = process.env.TEST === 'true';
debug(`Test mode: ${isTestMode}`);

// Disable GPU acceleration
if (!isTestMode && process.platform === 'darwin') {
  app.disableHardwareAcceleration();
  app.commandLine.appendSwitch('disable-gpu');
}

const mode = getZubridgeMode();
const modeName = getModeName();
debug(`Using Zubridge mode: ${modeName}`);

// Ensure we always use the absolute path for the preload script
const preloadPath = getPreloadPath();
debug(`Using preload path: ${preloadPath}`);

// Flag to track when app is explicitly being quit
let isAppQuitting = false;

app.on('window-all-closed', () => {
  debug('All windows closed event');
  if (process.platform !== 'darwin') {
    isAppQuitting = true;
    app.quit();
  }
});

app.on('before-quit', () => {
  debug('App before-quit event');
  isAppQuitting = true;
});

app
  .whenReady()
  .then(async () => {
    debug('App is ready, initializing windows');

    // Initialize all windows
    debug('Initializing main window');
    const initialMainWindow = windows.initMainWindow(isAppQuitting);
    debug(`Main window created with ID: ${initialMainWindow.id}`);

    debug('Initializing direct WebContents window');
    const initialDirectWebContentsWindow = windows.initDirectWebContentsWindow();
    debug(`Direct WebContents window created with ID: ${initialDirectWebContentsWindow.id}`);

    debug('Initializing BrowserView window');
    const { window: initialBrowserViewWindow, browserView } = windows.initBrowserViewWindow();
    if (initialBrowserViewWindow && browserView) {
      debug(`BrowserView window created with ID: ${initialBrowserViewWindow.id}`);
      debug(`BrowserView WebContents ID: ${browserView.webContents.id}`);
    } else {
      debug('BrowserView window skipped (disabled in test mode)');
    }

    debug('Initializing WebContentsView window');
    const { window: initialWebContentsViewWindow, webContentsView } = windows.initWebContentsViewWindow();
    if (initialWebContentsViewWindow && webContentsView) {
      debug(`WebContentsView window created with ID: ${initialWebContentsViewWindow.id}`);
      debug(`WebContentsView WebContents ID: ${webContentsView.webContents.id}`);
    } else {
      debug('WebContentsView window skipped (disabled in test mode)');
    }

    // Initialize the store
    debug('Initializing store');
    await initStore();
    debug('Store initialized');

    // Create the bridge, passing all windows/views for synchronization
    debug('Creating bridge with windows');

    // Use a more general array that accepts different window/view types
    const windowsAndViews: WrapperOrWebContents[] = [];

    if (initialMainWindow) {
      debug(`Adding main window ID: ${initialMainWindow.id}`);
      windowsAndViews.push(initialMainWindow);
    }

    if (initialDirectWebContentsWindow) {
      debug(`Adding direct WebContents window ID: ${initialDirectWebContentsWindow.id}`);
      windowsAndViews.push(initialDirectWebContentsWindow);
    }

    if (browserView) {
      debug(`Adding browserView directly, WebContents ID: ${browserView.webContents.id}`);
      windowsAndViews.push(browserView);
    }

    if (webContentsView) {
      debug(`Adding webContentsView directly, WebContents ID: ${webContentsView.webContents.id}`);
      windowsAndViews.push(webContentsView);
    }

    debug(`Passing ${windowsAndViews.length} windows/views to bridge`);

    try {
      debug('Before bridge creation');
      const bridge = await createBridge(store, windowsAndViews);
      debug('Bridge created successfully');

      // Create the system tray
      debug('Creating system tray');
      const trayInstance = tray(store, initialMainWindow);
      debug('System tray created');

      // Get the subscribe function from the bridge
      const { subscribe } = bridge;
      debug('Retrieved subscribe function from bridge');

      // On macOS activate, ensure all primary windows are handled
      app.on('activate', () => {
        debug('App activate event triggered');
        const { mainWindow, directWebContentsWindow, browserViewWindow, webContentsViewWindow } =
          windows.getWindowRefs();

        // Use optional chaining and null checks
        const hasMainWindow = mainWindow && !mainWindow.isDestroyed();
        const hasDirectWebContentsWindow = directWebContentsWindow && !directWebContentsWindow.isDestroyed();
        const hasBrowserViewWindow = browserViewWindow && !browserViewWindow.isDestroyed();
        const hasWebContentsViewWindow = webContentsViewWindow && !webContentsViewWindow.isDestroyed();

        debug(
          `Window states - Main: ${hasMainWindow}, Direct: ${hasDirectWebContentsWindow}, BrowserView: ${hasBrowserViewWindow}, WebContentsView: ${hasWebContentsViewWindow}`,
        );

        let windowToFocus: BrowserWindow | undefined = undefined;

        if (!hasMainWindow) {
          debug('Creating new main window on activate');
          const newMainWindow = windows.initMainWindow(isAppQuitting);
          subscribe([newMainWindow]); // Subscribe new main window
          windowToFocus = newMainWindow;
        } else if (!mainWindow?.isVisible()) {
          debug('Showing existing main window');
          mainWindow?.show();
          windowToFocus = mainWindow;
        } else {
          windowToFocus = mainWindow;
        }

        if (!hasDirectWebContentsWindow) {
          debug('Creating new direct WebContents window on activate');
          const newDirectWebContentsWindow = windows.initDirectWebContentsWindow();
          subscribe([newDirectWebContentsWindow]);
        } else if (!directWebContentsWindow?.isVisible()) {
          debug('Showing existing direct WebContents window');
          directWebContentsWindow?.show();
        }

        // Only create BrowserView window if not in test mode
        if (!isTestMode) {
          if (!hasBrowserViewWindow) {
            debug('Creating new BrowserView window on activate');
            const { browserView } = windows.initBrowserViewWindow();
            // Pass the browserView directly to subscribe
            if (browserView) {
              debug(`Subscribing BrowserView directly, WebContents ID: ${browserView.webContents.id}`);
              subscribe([browserView]);
            }
          } else if (!browserViewWindow?.isVisible()) {
            debug('Showing existing BrowserView window');
            browserViewWindow?.show();
          }
        }

        // Only create WebContentsView window if not in test mode
        if (!isTestMode) {
          if (!hasWebContentsViewWindow) {
            debug('Creating new WebContentsView window on activate');
            const { webContentsView } = windows.initWebContentsViewWindow();
            // Pass the webContentsView directly to subscribe
            if (webContentsView) {
              debug(`Subscribing WebContentsView directly, WebContents ID: ${webContentsView.webContents.id}`);
              subscribe([webContentsView]);
            }
          } else if (!webContentsViewWindow?.isVisible()) {
            debug('Showing existing WebContentsView window');
            webContentsViewWindow?.show();
          }
        }

        // Focus the determined window (use optional chaining)
        debug(`Focusing window ID: ${windowToFocus?.id}`);
        windowToFocus?.focus();
      });

      // Function to track and subscribe new windows to the bridge
      const trackNewWindows = () => {
        try {
          // debug('Tracking new windows');
          const { mainWindow, directWebContentsWindow, browserViewWindow, webContentsViewWindow, runtimeWindows } =
            windows.getWindowRefs();
          const allWindows = BrowserWindow.getAllWindows();

          // debug(`Found ${allWindows.length} total windows, ${runtimeWindows.length} runtime windows`);

          for (const win of allWindows) {
            // Ensure we skip non-Runtime windows correctly
            if (
              !win ||
              win.isDestroyed() ||
              win === mainWindow ||
              win === directWebContentsWindow ||
              win === browserViewWindow ||
              win === webContentsViewWindow
            ) {
              continue;
            }

            const isTracked = runtimeWindows.some((w) => w === win);
            if (!isTracked) {
              debug(`Adding new runtime window ${win.id} to tracking`);
              runtimeWindows.push(win);
              const subscription = subscribe([win]);
              win.once('closed', () => {
                debug(`Runtime window ${win.id} closed, cleaning up`);
                const index = runtimeWindows.indexOf(win);
                if (index !== -1) runtimeWindows.splice(index, 1);
                subscription.unsubscribe();
                debug(`Window ${win.id} closed and unsubscribed`);
              });
            }
          }

          // Clean up destroyed windows from runtimeWindows
          for (let i = runtimeWindows.length - 1; i >= 0; i--) {
            if (runtimeWindows[i]?.isDestroyed()) {
              // Optional chaining for safety
              debug(`Removing destroyed window from runtimeWindows array at index ${i}`);
              runtimeWindows.splice(i, 1);
            }
          }
        } catch (error) {
          console.error('Error tracking windows:', error);
        }
      };

      // Run the tracker when the app starts
      debug('Running initial window tracker');
      trackNewWindows();

      // Poll for new windows every second to catch any windows created by child windows
      debug('Setting up window tracking interval');
      const windowTrackingInterval = setInterval(trackNewWindows, 1000);

      // Modify quit handler to clean up both windows if they exist
      app.on('quit', () => {
        debug('App quit event triggered');
        try {
          debug('Cleaning up resources on quit');
          clearInterval(windowTrackingInterval);
          trayInstance.destroy();
          bridge.unsubscribe();

          // Clean up all windows
          debug('Cleaning up windows');
          windows.cleanupWindows();
          debug('Windows cleanup complete');
        } catch (error) {
          console.error('Error during cleanup:', error);
        }
      });

      debug('Setting initial window focus');
      app.focus({ steal: true });
      const { mainWindow } = windows.getWindowRefs();
      mainWindow?.focus();

      const dispatch = createDispatch(store);

      // Set up the handler for closeCurrentWindow
      debug('Setting up IPC handlers');
      ipcMain.handle('closeCurrentWindow', async (event) => {
        debug(`CloseCurrentWindow request received from window ID: ${event.sender.id}`);
        try {
          // Get the window that sent this message
          const window = BrowserWindow.fromWebContents(event.sender);
          const { mainWindow } = windows.getWindowRefs();

          if (window) {
            // If this is the main window, just minimize it
            if (window === mainWindow) {
              debug('Minimizing main window instead of closing');
              if (!window.isDestroyed()) {
                window.minimize();
              }
            } else {
              // Common close logic for all modes
              debug(`Closing window ${window.id}`);

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
        debug('Window created event received');
        // Immediately track the new window
        trackNewWindows();
        return true;
      });

      // Set up handler to check if the window is the main window
      ipcMain.handle('is-main-window', (event) => {
        const window = BrowserWindow.fromWebContents(event.sender);
        const { mainWindow } = windows.getWindowRefs();
        // Check if this is the main window
        const isMainWindow = window === mainWindow;
        debug(`is-main-window check for window ${event.sender.id}: ${isMainWindow}`);
        return isMainWindow;
      });

      // Set up handler to get the window ID
      ipcMain.handle('get-window-id', (event) => {
        const window = BrowserWindow.fromWebContents(event.sender);
        const windowId = window ? window.id : null;
        debug(`get-window-id for ${event.sender.id}: ${windowId}`);
        return windowId;
      });

      // Set up handler to get window type (main, secondary, runtime) and ID
      ipcMain.handle('get-window-info', (event) => {
        const window = BrowserWindow.fromWebContents(event.sender);
        if (!window) {
          debug(`get-window-info: No window found for ${event.sender.id}`);
          return null;
        }

        const { mainWindow, directWebContentsWindow, browserViewWindow, webContentsViewWindow } =
          windows.getWindowRefs();
        const windowId = window.id;
        let windowType: 'main' | 'directWebContents' | 'browserView' | 'webContentsView' | 'runtime' = 'runtime'; // Default to runtime

        if (window === mainWindow) {
          windowType = 'main';
        } else if (window === directWebContentsWindow) {
          windowType = 'directWebContents';
        } else if (window === browserViewWindow) {
          windowType = 'browserView';
        } else if (window === webContentsViewWindow) {
          windowType = 'webContentsView';
        }
        // No need to check runtimeWindows array explicitly, default handles it

        debug(`get-window-info for ${event.sender.id}: type=${windowType}, id=${windowId}`);
        return { type: windowType, id: windowId };
      });

      // --> NEW: IPC Handler for creating runtime windows <--
      ipcMain.handle('create-runtime-window', (event) => {
        debug(`create-runtime-window request from ${event.sender.id}`);
        console.log(`IPC: Received request to create runtime window from sender ${event.sender.id}`);
        const newWindow = windows.createRuntimeWindow();
        // Subscribe the new window immediately
        debug(`Runtime window created with ID: ${newWindow.id}, subscribing to bridge`);
        subscribe([newWindow]);
        return { success: true, windowId: newWindow.id };
      });
      // --> END NEW HANDLER <--

      // Set up handler to get the current mode
      ipcMain.handle('get-mode', () => {
        debug(`get-mode request, returning: ${mode}, ${modeName}`);
        return {
          mode,
          modeName,
        };
      });

      // Set up handler to quit the app
      ipcMain.handle('quitApp', () => {
        debug('quitApp request received, setting isAppQuitting flag');
        isAppQuitting = true;
        app.quit();
        return true;
      });

      // Set up the handler for the main process thunk
      ipcMain.handle('counter:execute-main-thunk', async () => {
        debug('Received IPC request to execute main process thunk');

        try {
          const thunk = createMainProcessThunk();
          const result = await dispatch(thunk);
          return { success: true, result };
        } catch (error) {
          console.error('[MAIN] Error executing main process thunk:', error);
          return { success: false, error: String(error) };
        }
      });

      debug('App initialization complete, waiting for events');
    } catch (error) {
      console.error('Error creating bridge:', error);
      debug(`CRITICAL ERROR creating bridge: ${error}`);
    }
  })
  .catch((error) => {
    console.error('Error during app initialization:', error);
    debug(`CRITICAL ERROR during app initialization: ${error}`);
  });

// For testing and debugging
console.log('App starting in environment:', process.env.NODE_ENV);
console.log('isDev:', isDevMode);
console.log('isTest:', isTestMode);
console.log(`Using Zubridge mode: ${modeName}`);
console.log('electron/index.ts is loaded');
