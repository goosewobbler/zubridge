import process from 'node:process';
import { BrowserWindow, app, ipcMain } from 'electron';

import { isDev } from '@zubridge/electron';
import { createDispatch } from '@zubridge/electron/main';
import { debug } from '@zubridge/electron';
import { createDoubleCounterThunk, createDoubleCounterSlowThunk, type ThunkContext } from '@zubridge/apps-shared';
import type { WrapperOrWebContents } from '@zubridge/types';
import 'wdio-electron-service/main';

import { store, initStore } from './store.js';
import { tray } from './tray/index.js';
import { createBridge } from './bridge.js';
import { getModeName, getZubridgeMode } from '../utils/mode.js';
import { getPreloadPath } from '../utils/path.js';
import * as windows from './window.js';
import { AppIpcChannel } from '../constants.js';

debug.log('example-app:init', 'Starting app initialization');

// Ensure NODE_ENV is always set
process.env.NODE_ENV = process.env.NODE_ENV || (app.isPackaged ? 'production' : 'development');

// Check if we're in development mode using the shared utility
debug.log('example-app:init', 'Checking dev mode');
const isDevMode = await isDev();
debug.log('example-app:init', `Dev mode: ${isDevMode}`);

// Check if we're in test mode
const isTestMode = process.env.TEST === 'true';
debug.log('example-app:init', `Test mode: ${isTestMode}`);

// Disable GPU acceleration
if (!isTestMode && process.platform === 'darwin') {
  app.disableHardwareAcceleration();
  app.commandLine.appendSwitch('disable-gpu');
}

const mode = getZubridgeMode();
const modeName = getModeName();
debug.log('example-app:init', `Using Zubridge mode: ${modeName}`);

// Ensure we always use the absolute path for the preload script
const preloadPath = getPreloadPath();
debug.log('example-app:init', `Using preload path: ${preloadPath}`);

// Flag to track when app is explicitly being quit
let isAppQuitting = false;

app.on('window-all-closed', () => {
  debug.log('example-app:init', 'All windows closed event');
  if (process.platform !== 'darwin') {
    isAppQuitting = true;
    app.quit();
  }
});

app.on('before-quit', () => {
  debug.log('example-app:init', 'App before-quit event');
  isAppQuitting = true;
});

app
  .whenReady()
  .then(async () => {
    debug.log('example-app:init', 'App is ready, initializing windows');

    // Initialize all windows
    debug.log('example-app:init', 'Initializing main window');
    const initialMainWindow = windows.initMainWindow(isAppQuitting);
    debug.log('example-app:init', `Main window created with ID: ${initialMainWindow.id}`);

    debug.log('example-app:init', 'Initializing direct WebContents window');
    const initialDirectWebContentsWindow = windows.initDirectWebContentsWindow();
    debug.log('example-app:init', `Direct WebContents window created with ID: ${initialDirectWebContentsWindow.id}`);

    debug.log('example-app:init', 'Initializing BrowserView window');
    const { window: initialBrowserViewWindow, browserView } = windows.initBrowserViewWindow();
    if (initialBrowserViewWindow && browserView) {
      debug.log('example-app:init', `BrowserView window created with ID: ${initialBrowserViewWindow.id}`);
      debug.log('example-app:init', `BrowserView WebContents ID: ${browserView.webContents.id}`);
    } else {
      debug.log('example-app:init', 'BrowserView window skipped (disabled in test mode)');
    }

    debug.log('example-app:init', 'Initializing WebContentsView window');
    const { window: initialWebContentsViewWindow, webContentsView } = windows.initWebContentsViewWindow();
    if (initialWebContentsViewWindow && webContentsView) {
      debug.log('example-app:init', `WebContentsView window created with ID: ${initialWebContentsViewWindow.id}`);
      debug.log('example-app:init', `WebContentsView WebContents ID: ${webContentsView.webContents.id}`);
    } else {
      debug.log('example-app:init', 'WebContentsView window skipped (disabled in test mode)');
    }

    // Initialize the store
    debug.log('example-app:init', 'Initializing store');
    await initStore();
    // debug.log('example-app:init', 'Store initialized'); // DEBUG logs not showing on CI
    console.log('MAIN_INDEX_LOG: Store initialized');

    let bridge: any; // Declare bridge outside try/catch
    let subscribe: any; // Declare subscribe outside try/catch

    try {
      console.log('MAIN_INDEX_LOG: Attempting to createRequire...');
      const { createRequire } = await import('node:module');
      const customRequire = createRequire(import.meta.url);
      console.log('MAIN_INDEX_LOG: customRequire created. Attempting to require "@zubridge/middleware"...');

      const middlewareModule = customRequire('@zubridge/middleware');
      console.log(
        'MAIN_INDEX_LOG: "@zubridge/middleware" required successfully. Module keys:',
        Object.keys(middlewareModule),
      );

      const { initZubridgeMiddleware } = middlewareModule;

      if (typeof initZubridgeMiddleware !== 'function') {
        console.error('MAIN_INDEX_LOG: CRITICAL ERROR - initZubridgeMiddleware is NOT a function after require!');
        throw new Error('initZubridgeMiddleware is not a function'); // Ensure it throws to be caught
      }
      console.log('MAIN_INDEX_LOG: initZubridgeMiddleware is a function. Proceeding to initialize middleware.');

      const middleware = initZubridgeMiddleware({
        logging: {
          enabled: true,
          websocketPort: 9000,
          consoleOutput: true,
        },
      });
      console.log('MAIN_INDEX_LOG: Middleware instance initialized successfully.');

      // Assign to the outer scope bridge
      bridge = await createBridge(store, middleware);
      console.log('MAIN_INDEX_LOG: Bridge created successfully.');

      // Assign to the outer scope subscribe
      if (bridge && typeof bridge.subscribe === 'function') {
        subscribe = bridge.subscribe;
        console.log('MAIN_INDEX_LOG: Subscribe function retrieved from bridge.');
      } else {
        console.error('MAIN_INDEX_LOG: CRITICAL ERROR - Bridge or bridge.subscribe is not available!');
        throw new Error('Bridge or bridge.subscribe not available');
      }
    } catch (error) {
      console.error(
        'MAIN_INDEX_LOG: CRITICAL ERROR during middleware import/initialization or bridge creation:',
        error,
      );
      // For CI, re-throw to ensure the process exits with an error if this setup fails
      // This makes the CI job fail clearly.
      throw error;
    }

    // These debug logs might not show, but console logs confirmed the bridge part was not reached.
    // debug.log('example-app:init', 'Initializing middleware');
    // console.log('example-app:init', 'Initializing middleware'); // This was the old log spot

    // debug.log('example-app:init', 'Bridge created successfully, setting up subscribers');

    // Create a more general array that accepts different window/view types
    const windowsAndViews: WrapperOrWebContents[] = [];

    if (initialMainWindow) {
      debug.log('example-app:init', `Adding main window ID: ${initialMainWindow.id}`);
      windowsAndViews.push(initialMainWindow);
    }

    if (initialDirectWebContentsWindow) {
      debug.log('example-app:init', `Adding direct WebContents window ID: ${initialDirectWebContentsWindow.id}`);
      windowsAndViews.push(initialDirectWebContentsWindow);
    }

    if (browserView) {
      debug.log('example-app:init', `Adding browserView directly, WebContents ID: ${browserView.webContents.id}`);
      windowsAndViews.push(browserView);
    }

    if (webContentsView) {
      debug.log(
        'example-app:init',
        `Adding webContentsView directly, WebContents ID: ${webContentsView.webContents.id}`,
      );
      windowsAndViews.push(webContentsView);
    }

    debug.log('example-app:init', `Subscribing ${windowsAndViews.length} windows/views to the bridge`);
    subscribe(windowsAndViews);

    // Create the system tray
    debug.log('example-app:init', 'Creating system tray');
    const trayInstance = tray(store, initialMainWindow);
    debug.log('example-app:init', 'System tray created');

    // Get the subscribe function from the bridge (already assigned if successful)
    // const { subscribe } = bridge; // No longer needed here
    // debug.log('example-app:init', 'Retrieved subscribe function from bridge');

    // On macOS activate, ensure all primary windows are handled
    app.on('activate', () => {
      debug.log('example-app:init', 'App activate event triggered');
      const { mainWindow, directWebContentsWindow, browserViewWindow, webContentsViewWindow } = windows.getWindowRefs();

      // Use optional chaining and null checks
      const hasMainWindow = mainWindow && !mainWindow.isDestroyed();
      const hasDirectWebContentsWindow = directWebContentsWindow && !directWebContentsWindow.isDestroyed();
      const hasBrowserViewWindow = browserViewWindow && !browserViewWindow.isDestroyed();
      const hasWebContentsViewWindow = webContentsViewWindow && !webContentsViewWindow.isDestroyed();

      debug.log(
        'example-app:init',
        `Window states - Main: ${hasMainWindow}, Direct: ${hasDirectWebContentsWindow}, BrowserView: ${hasBrowserViewWindow}, WebContentsView: ${hasWebContentsViewWindow}`,
      );

      let windowToFocus: BrowserWindow | undefined = undefined;

      if (!hasMainWindow) {
        debug.log('example-app:init', 'Creating new main window on activate');
        const newMainWindow = windows.initMainWindow(isAppQuitting);
        subscribe([newMainWindow]); // Subscribe new main window
        windowToFocus = newMainWindow;
      } else if (!mainWindow?.isVisible()) {
        debug.log('example-app:init', 'Showing existing main window');
        mainWindow?.show();
        windowToFocus = mainWindow;
      } else {
        windowToFocus = mainWindow;
      }

      if (!hasDirectWebContentsWindow) {
        debug.log('example-app:init', 'Creating new direct WebContents window on activate');
        const newDirectWebContentsWindow = windows.initDirectWebContentsWindow();
        subscribe([newDirectWebContentsWindow]);
      } else if (!directWebContentsWindow?.isVisible()) {
        debug.log('example-app:init', 'Showing existing direct WebContents window');
        directWebContentsWindow?.show();
      }

      // Only create BrowserView window if not in test mode
      if (!isTestMode) {
        if (!hasBrowserViewWindow) {
          debug.log('example-app:init', 'Creating new BrowserView window on activate');
          const { browserView } = windows.initBrowserViewWindow();
          // Pass the browserView directly to subscribe
          if (browserView) {
            debug.log(
              'example-app:init',
              `Subscribing BrowserView directly, WebContents ID: ${browserView.webContents.id}`,
            );
            subscribe([browserView]);
          }
        } else if (!browserViewWindow?.isVisible()) {
          debug.log('example-app:init', 'Showing existing BrowserView window');
          browserViewWindow?.show();
        }
      }

      // Only create WebContentsView window if not in test mode
      if (!isTestMode) {
        if (!hasWebContentsViewWindow) {
          debug.log('example-app:init', 'Creating new WebContentsView window on activate');
          const { webContentsView } = windows.initWebContentsViewWindow();
          // Pass the webContentsView directly to subscribe
          if (webContentsView) {
            debug.log(
              'example-app:init',
              `Subscribing WebContentsView directly, WebContents ID: ${webContentsView.webContents.id}`,
            );
            subscribe([webContentsView]);
          }
        } else if (!webContentsViewWindow?.isVisible()) {
          debug.log('example-app:init', 'Showing existing WebContentsView window');
          webContentsViewWindow?.show();
        }
      }

      // Focus the determined window (use optional chaining)
      debug.log('example-app:init', `Focusing window ID: ${windowToFocus?.id}`);
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
            debug.log('example-app:init', `Adding new runtime window ${win.id} to tracking`);
            runtimeWindows.push(win);
            const subscription = subscribe([win]);
            win.once('closed', () => {
              debug.log('example-app:init', `Runtime window ${win.id} closed, cleaning up`);
              const index = runtimeWindows.indexOf(win);
              if (index !== -1) runtimeWindows.splice(index, 1);
              subscription.unsubscribe();
              debug.log('example-app:init', `Window ${win.id} closed and unsubscribed`);
            });
          }
        }

        // Clean up destroyed windows from runtimeWindows
        for (let i = runtimeWindows.length - 1; i >= 0; i--) {
          if (runtimeWindows[i]?.isDestroyed()) {
            // Optional chaining for safety
            debug.log('example-app:init', `Removing destroyed window from runtimeWindows array at index ${i}`);
            runtimeWindows.splice(i, 1);
          }
        }
      } catch (error) {
        console.error('Error tracking windows:', error);
      }
    };

    // Run the tracker when the app starts
    debug.log('example-app:init', 'Running initial window tracker');
    trackNewWindows();

    // Poll for new windows every second to catch any windows created by child windows
    debug.log('example-app:init', 'Setting up window tracking interval');
    const windowTrackingInterval = setInterval(trackNewWindows, 1000);

    // Modify quit handler to clean up both windows if they exist
    app.on('quit', () => {
      debug.log('example-app:init', 'App quit event triggered');
      try {
        debug.log('example-app:init', 'Cleaning up resources on quit');
        clearInterval(windowTrackingInterval);
        trayInstance.destroy();
        if (bridge && typeof bridge.unsubscribe === 'function') {
          // Check if bridge and unsubscribe exist
          bridge.unsubscribe();
          console.log('MAIN_INDEX_LOG: Bridge unsubscribed during app quit.');
        } else {
          console.warn('MAIN_INDEX_LOG: Bridge or unsubscribe function not available during app quit.');
        }

        // Clean up all windows
        debug.log('example-app:init', 'Cleaning up windows');
        windows.cleanupWindows();
        debug.log('example-app:init', 'Windows cleanup complete');
      } catch (error) {
        console.error('Error during cleanup:', error);
      }
    });

    debug.log('example-app:init', 'Setting initial window focus');
    app.focus({ steal: true });
    const { mainWindow } = windows.getWindowRefs();
    mainWindow?.focus();

    // Get the dispatch function
    const dispatch = createDispatch(store);

    // Setup IPC handlers
    debug.log('example-app:init', 'Setting up IPC handlers');

    // Set up handler for closing the current window
    ipcMain.handle(AppIpcChannel.CLOSE_CURRENT_WINDOW, async (event) => {
      debug.log('example-app:init', `CloseCurrentWindow request received from window ID: ${event.sender.id}`);
      try {
        // Get the window that sent this message
        const window = BrowserWindow.fromWebContents(event.sender);
        const { mainWindow } = windows.getWindowRefs();

        if (window) {
          // If this is the main window, just minimize it
          if (window === mainWindow) {
            debug.log('example-app:init', 'Minimizing main window instead of closing');
            if (!window.isDestroyed()) {
              window.minimize();
            }
          } else {
            // Common close logic for all modes
            debug.log('example-app:init', `Closing window ${window.id}`);

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
    ipcMain.handle(AppIpcChannel.WINDOW_CREATED, (event) => {
      const window = BrowserWindow.fromWebContents(event.sender);
      const windowId = window ? window.id : event.sender.id;
      debug.log('example-app:init', `WINDOW_CREATED event handled for window ID: ${windowId}`);
      // Acknowledge the event
      return { success: true, windowId };
    });

    // Set up handler to check if the window is the main window
    ipcMain.handle(AppIpcChannel.IS_MAIN_WINDOW, (event) => {
      const window = BrowserWindow.fromWebContents(event.sender);
      const { mainWindow } = windows.getWindowRefs();
      // Check if this is the main window
      const isMainWindow = window === mainWindow;
      debug.log('example-app:init', `is-main-window check for window ${event.sender.id}: ${isMainWindow}`);
      return isMainWindow;
    });

    // Set up handler to get the window ID
    ipcMain.handle(AppIpcChannel.GET_WINDOW_ID, (event) => {
      const window = BrowserWindow.fromWebContents(event.sender);
      const windowId = window ? window.id : null;
      debug.log('example-app:init', `get-window-id for ${event.sender.id}: ${windowId}`);
      return windowId;
    });

    // Set up handler to get window type (main, secondary, runtime) and ID
    ipcMain.handle(AppIpcChannel.GET_WINDOW_INFO, (event) => {
      const window = BrowserWindow.fromWebContents(event.sender);
      if (!window) {
        debug.log('example-app:init', `get-window-info: No window found for ${event.sender.id}`);
        return null;
      }

      const { mainWindow, directWebContentsWindow, browserViewWindow, webContentsViewWindow } = windows.getWindowRefs();
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

      debug.log('example-app:init', `get-window-info for ${event.sender.id}: type=${windowType}, id=${windowId}`);
      return { type: windowType, id: windowId };
    });

    // IPC Handler for creating runtime windows
    ipcMain.handle(AppIpcChannel.CREATE_RUNTIME_WINDOW, (event) => {
      debug.log('example-app:init', `create-runtime-window request from ${event.sender.id}`);
      console.log(`IPC: Received request to create runtime window from sender ${event.sender.id}`);
      const newWindow = windows.createRuntimeWindow();
      // Subscribe the new window immediately
      debug.log('example-app:init', `Runtime window created with ID: ${newWindow.id}, subscribing to bridge`);
      subscribe([newWindow]);
      return { success: true, windowId: newWindow.id };
    });

    // Set up handler to get the current mode
    ipcMain.handle(AppIpcChannel.GET_MODE, () => {
      debug.log('example-app:init', `get-mode request, returning: ${mode}, ${modeName}`);
      return {
        mode,
        modeName,
      };
    });

    // Set up handler to quit the app
    ipcMain.handle(AppIpcChannel.QUIT_APP, () => {
      debug.log('example-app:init', 'quitApp request received, setting isAppQuitting flag');
      isAppQuitting = true;
      app.quit();
      return true;
    });

    // Set up the handler for the main process thunk
    ipcMain.handle(AppIpcChannel.EXECUTE_MAIN_THUNK, async () => {
      debug.log('example-app:init', 'Received IPC request to execute main process thunk');

      try {
        // Create a context for the main process thunk
        const thunkContext: ThunkContext = {
          environment: 'main',
          logPrefix: 'MAIN_PROCESS',
        };

        // Get the current counter value from store
        const currentState = store.getState();
        const counter = currentState.counter || 0;

        // Create thunk with the updated BaseState (with optional properties)
        const thunk = createDoubleCounterThunk(counter, thunkContext);
        const result = await dispatch(thunk);
        return { success: true, result };
      } catch (error) {
        console.error('[MAIN] Error executing main process thunk:', error);
        return { success: false, error: String(error) };
      }
    });

    // Set up the handler for the main process slow thunk
    ipcMain.handle(AppIpcChannel.EXECUTE_MAIN_THUNK_SLOW, async () => {
      debug.log('example-app:init', 'Received IPC request to execute main process slow thunk');

      try {
        // Create a context for the main process thunk
        const thunkContext: ThunkContext = {
          environment: 'main',
          logPrefix: 'MAIN_PROCESS_SLOW',
        };

        // Get the current counter value from store
        const currentState = store.getState();
        const counter = currentState.counter || 0;

        // Create thunk with the updated BaseState (with optional properties)
        const thunk = createDoubleCounterSlowThunk(counter, thunkContext);
        const result = await dispatch(thunk);
        return { success: true, result };
      } catch (error) {
        console.error('[MAIN] Error executing main process slow thunk:', error);
        return { success: false, error: String(error) };
      }
    });

    debug.log('example-app:init', 'App initialization complete, waiting for events');
  })
  .catch((error) => {
    console.error('Error during app initialization:', error);
    debug.log('example-app:init', `CRITICAL ERROR during app initialization: ${error}`);
  });

// For testing and debugging
console.log('App starting in environment:', process.env.NODE_ENV);
console.log('isDev:', isDevMode);
console.log('isTest:', isTestMode);
console.log(`Using Zubridge mode: ${modeName}`);
console.log('electron/index.ts is loaded');
