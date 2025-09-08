import path from 'node:path';
import process from 'node:process';
import {
  createDoubleCounterSlowThunk,
  createDoubleCounterThunk,
  type ThunkContext,
} from '@zubridge/apps-shared';
import { debug } from '@zubridge/core';
import { createDispatch, isDev } from '@zubridge/electron/main';
import type { WebContentsWrapper, WrapperOrWebContents } from '@zubridge/types';
import { app, BrowserWindow, ipcMain } from 'electron';
import { AppIpcChannel } from '../constants.js';
import { getZubridgeMode } from '../utils/mode.js';
import { getPreloadPath } from '../utils/path.js';
import { type AnyBridge, createBridge } from './bridge.js';
import { initStore, store } from './store.js';
import { tray } from './tray/index.js';
import * as windows from './window.js';

debug('example-app:env', '[main/index.ts] Actual process.env.DEBUG:', process.env.DEBUG);

debug('example-app:init', 'Starting app initialization');

// Ensure NODE_ENV is always set
process.env.NODE_ENV = process.env.NODE_ENV || (app.isPackaged ? 'production' : 'development');

// Check if we're in development mode using the shared utility
debug('example-app:init', 'Checking dev mode');
const isDevMode = await isDev();
debug('example-app:init', `Dev mode: ${isDevMode}`);

// Check if we're in test mode
const isTestMode = process.env.TEST === 'true';
debug('example-app:init', `Test mode: ${isTestMode}`);

// For E2E tests, add more aggressive quit signal handling
if (isTestMode) {
  debug('example-app:init', 'Adding E2E test signal handlers');

  // Handle process termination signals
  process.on('SIGTERM', () => {
    debug('example-app:init', 'Received SIGTERM, forcing quit');
    process.exit(0);
  });

  process.on('SIGINT', () => {
    debug('example-app:init', 'Received SIGINT, forcing quit');
    process.exit(0);
  });

  // Handle uncaught exceptions gracefully in test mode
  process.on('uncaughtException', (error) => {
    debug('example-app:init', 'Uncaught exception in test mode:', error);
    process.exit(1);
  });
}

// Disable GPU acceleration on MacOS
if (!isTestMode && process.platform === 'darwin' && !app.isReady()) {
  app.disableHardwareAcceleration();
  app.commandLine.appendSwitch('disable-gpu');
}

const mode = getZubridgeMode();
const modeName = getZubridgeMode();
debug('example-app:init', `Using Zubridge mode: ${modeName}`);

// Ensure we always use the absolute path for the preload script
const preloadPath = getPreloadPath();
debug('example-app:init', `Using preload path: ${preloadPath}`);

// Flag to track when app is explicitly being quit
let isAppQuitting = false;
let bridge: AnyBridge;
let subscribe: AnyBridge['subscribe'];
let windowTrackingInterval: NodeJS.Timeout;

app.on('window-all-closed', () => {
  debug('example-app:init', 'All windows closed event');
  if (process.platform !== 'darwin') {
    isAppQuitting = true;
    app.quit();
  }
});

app.on('before-quit', (event) => {
  debug('example-app:init', 'App before-quit event');
  isAppQuitting = true;

  // For E2E tests, give extra time for cleanup to prevent WebDriver timeouts
  if (isTestMode) {
    debug('example-app:init', 'Test mode detected - implementing graceful shutdown');
    event.preventDefault();

    // Perform cleanup with timeout - shorter timeout for E2E tests
    const cleanupTimeout = setTimeout(() => {
      debug('example-app:init', 'Cleanup timeout reached, forcing quit');
      process.exit(0); // Force immediate exit
    }, 1500); // 1.5 second timeout for cleanup in tests

    Promise.resolve()
      .then(() => {
        // Cleanup bridge first
        if (bridge) {
          bridge.destroy();
          debug('core', 'Bridge destroyed during graceful shutdown.');
        }
      })
      .then(() => {
        // Cleanup store if it has destroy method
        if (store && typeof store.destroy === 'function') {
          store.destroy();
          debug('core', 'Store destroyed during graceful shutdown.');
        }
      })
      .then(() => {
        // CRITICAL: Clear the window tracking interval in test mode
        if (typeof windowTrackingInterval !== 'undefined') {
          clearInterval(windowTrackingInterval);
          debug('core', 'Window tracking interval cleared during graceful shutdown.');
        }
      })
      .then(() => {
        // Small delay to ensure all cleanup operations complete
        return new Promise((resolve) => setTimeout(resolve, 200)); // Reduced delay
      })
      .then(() => {
        clearTimeout(cleanupTimeout);
        debug('example-app:init', 'Graceful shutdown complete');
        app.exit(0);
      })
      .catch((error) => {
        debug('core', 'Error during graceful shutdown:', error);
        clearTimeout(cleanupTimeout);
        app.exit(1);
      });
  } else {
    // Normal shutdown for non-test environments
    if (bridge) {
      try {
        bridge.destroy();
        debug('core', 'Bridge destroyed during app before-quit.');
      } catch (error) {
        debug('core', 'Error destroying bridge during before-quit:', error);
      }
    }
  }
});

app
  .whenReady()
  .then(async () => {
    debug('example-app:init', 'App is ready, initializing windows');

    // Initialize all windows
    debug('example-app:init', 'Initializing main window');
    const initialMainWindow = await windows.initMainWindow(isAppQuitting);
    debug('example-app:init', `Main window created with ID: ${initialMainWindow.id}`);

    debug('example-app:init', 'Initializing direct WebContents window');
    const initialDirectWebContentsWindow = await windows.initDirectWebContentsWindow();
    debug(
      'example-app:init',
      `Direct WebContents window created with ID: ${initialDirectWebContentsWindow.id}`,
    );

    debug('example-app:init', 'Initializing BrowserView window');
    const { window: initialBrowserViewWindow, browserView } = await windows.initBrowserViewWindow();
    if (initialBrowserViewWindow && browserView) {
      debug(
        'example-app:init',
        `BrowserView window created with ID: ${initialBrowserViewWindow.id}`,
      );
      debug('example-app:init', `BrowserView WebContents ID: ${browserView.webContents.id}`);
    } else {
      debug('example-app:init', 'BrowserView window skipped (disabled in test mode)');
    }

    debug('example-app:init', 'Initializing WebContentsView window');
    const { window: initialWebContentsViewWindow, webContentsView } =
      await windows.initWebContentsViewWindow();
    if (initialWebContentsViewWindow && webContentsView) {
      debug(
        'example-app:init',
        `WebContentsView window created with ID: ${initialWebContentsViewWindow.id}`,
      );
      debug(
        'example-app:init',
        `WebContentsView WebContents ID: ${webContentsView.webContents.id}`,
      );
    } else {
      debug('example-app:init', 'WebContentsView window skipped (disabled in test mode)');
    }

    // Initialize the store
    debug('example-app:init', 'Initializing store');
    await initStore();
    debug('store', 'Store initialized');

    debug('core', 'Attempting to createRequire...');
    const { createRequire } = await import('node:module');
    const customRequire = createRequire(import.meta.url);
    debug('core', 'customRequire created. Attempting to require "@zubridge/middleware"...');

    const middlewareModule = customRequire('@zubridge/middleware');
    debug(
      'core',
      '"@zubridge/middleware" required successfully. Module keys:',
      Object.keys(middlewareModule),
    );

    // Get the initialization function
    const { initZubridgeMiddleware } = middlewareModule;

    if (typeof initZubridgeMiddleware !== 'function') {
      debug('core', 'CRITICAL ERROR - initZubridgeMiddleware is NOT a function after require!');
      throw new Error('initZubridgeMiddleware is not a function'); // Ensure it throws to be caught
    }
    debug('core', 'initZubridgeMiddleware is a function. Proceeding to initialize middleware.');

    // Initialize file logging for debugging
    const middlewareSetupFileLogging = middlewareModule.setupFileLogging;
    if (typeof middlewareSetupFileLogging === 'function') {
      debug('core', 'Setting up middleware file logging');
      try {
        const logPath = path.join(app.getPath('logs'), 'middleware_debug.log');
        debug('core', `Using log path: ${logPath}`);
        middlewareSetupFileLogging(logPath);
        debug('core', 'Middleware file logging initialized successfully');
      } catch (error) {
        debug('core:error', 'Failed to initialize middleware file logging:', error);
        // Continue execution even if logging setup fails
      }
    } else {
      debug('core:warning', 'setupFileLogging is not available in middleware module');
    }

    // Create middleware configuration with detailed telemetry (camelCase required for NAPI-RS)
    const middlewareConfig = {
      telemetry: {
        enabled: true,
        websocketPort: 9000,
        consoleOutput: true,
        measurePerformance: true,
        recordStateSize: true,
        recordStateDelta: true,
        verbose: true,
        performance: {
          enabled: true,
          detail: 'high',
          includeInLogs: true,
          recordTimings: true,
          verboseOutput: true,
        },
      },
    };

    // Log the configuration for debugging
    debug(
      'core:middleware',
      'Initializing middleware with config:',
      JSON.stringify(middlewareConfig, null, 2),
    );
    debug(
      'core:middleware',
      'Performance measurement enabled:',
      middlewareConfig.telemetry.measurePerformance,
    );
    debug(
      'core:middleware',
      'Performance config:',
      JSON.stringify(middlewareConfig.telemetry.performance, null, 2),
    );

    // Initialize the middleware using the provided init function
    const middleware = initZubridgeMiddleware(middlewareConfig);
    debug('core', 'Middleware instance initialized successfully.');

    // Assign to the outer scope bridge
    bridge = await createBridge(middleware);
    debug('core', 'Bridge created successfully.');

    // Assign to the outer scope subscribe
    if (bridge && typeof bridge.subscribe === 'function') {
      subscribe = bridge.subscribe;
      debug('core', 'Subscribe function retrieved from bridge.');
    } else {
      debug('core', 'CRITICAL ERROR - Bridge or bridge.subscribe is not available!');
      throw new Error('Bridge or bridge.subscribe not available');
    }

    // Create a more general array that accepts different window/view types
    const windowsAndViews: WrapperOrWebContents[] = [];

    if (initialMainWindow) {
      debug('example-app:init', `Adding main window ID: ${initialMainWindow.id}`);
      windowsAndViews.push(initialMainWindow);
    }

    if (initialDirectWebContentsWindow) {
      debug(
        'example-app:init',
        `Adding direct WebContents window ID: ${initialDirectWebContentsWindow.id}`,
      );
      windowsAndViews.push(initialDirectWebContentsWindow);
    }

    if (browserView) {
      debug(
        'example-app:init',
        `Adding browserView directly, WebContents ID: ${browserView.webContents.id}`,
      );
      windowsAndViews.push(browserView);
    }

    if (webContentsView) {
      debug(
        'example-app:init',
        `Adding webContentsView directly, WebContents ID: ${webContentsView.webContents.id}`,
      );
      windowsAndViews.push(webContentsView);
    }

    debug('example-app:init', `Subscribing ${windowsAndViews.length} windows/views to the bridge`);
    if (windowsAndViews.length > 0) {
      subscribe(windowsAndViews as [WebContentsWrapper, ...WebContentsWrapper[]], ['*']);
      debug('example-app:init', 'All windows subscribed to full state with "*" parameter');
    }

    // Create the system tray
    debug('example-app:init', 'Creating system tray');
    const trayInstance = tray(store, initialMainWindow);
    debug('example-app:init', 'System tray created');

    // On macOS activate, ensure all primary windows are handled
    app.on('activate', async () => {
      debug('example-app:init', 'App activate event triggered');
      const { mainWindow, directWebContentsWindow, browserViewWindow, webContentsViewWindow } =
        windows.getWindowRefs();

      // Use optional chaining and null checks
      const hasMainWindow = mainWindow && !mainWindow.isDestroyed();
      const hasDirectWebContentsWindow =
        directWebContentsWindow && !directWebContentsWindow.isDestroyed();
      const hasBrowserViewWindow = browserViewWindow && !browserViewWindow.isDestroyed();
      const hasWebContentsViewWindow = webContentsViewWindow && !webContentsViewWindow.isVisible();

      debug(
        'example-app:init',
        `Window states - Main: ${hasMainWindow}, Direct: ${hasDirectWebContentsWindow}, BrowserView: ${hasBrowserViewWindow}, WebContentsView: ${hasWebContentsViewWindow}`,
      );

      let windowToFocus: BrowserWindow | undefined;

      if (!hasMainWindow) {
        debug('example-app:init', 'Creating new main window on activate');
        const newMainWindow = await windows.initMainWindow(isAppQuitting);
        subscribe([newMainWindow]); // Subscribe new main window
        windowToFocus = newMainWindow;
      } else if (!mainWindow?.isVisible()) {
        debug('example-app:init', 'Showing existing main window');
        mainWindow?.show();
        windowToFocus = mainWindow;
      } else {
        windowToFocus = mainWindow;
      }

      if (!hasDirectWebContentsWindow) {
        debug('example-app:init', 'Creating new direct WebContents window on activate');
        const newDirectWebContentsWindow = await windows.initDirectWebContentsWindow();
        subscribe([newDirectWebContentsWindow]);
      } else if (!directWebContentsWindow?.isVisible()) {
        debug('example-app:init', 'Showing existing direct WebContents window');
        directWebContentsWindow?.show();
      }

      // Only create BrowserView window if not in test mode
      if (!isTestMode) {
        if (!hasBrowserViewWindow) {
          debug('example-app:init', 'Creating new BrowserView window on activate');
          const { browserView } = await windows.initBrowserViewWindow();
          // Pass the browserView directly to subscribe
          if (browserView) {
            debug(
              'example-app:init',
              `Subscribing BrowserView directly, WebContents ID: ${browserView.webContents.id}`,
            );
            subscribe([browserView]);
          }
        } else if (!browserViewWindow?.isVisible()) {
          debug('example-app:init', 'Showing existing BrowserView window');
          browserViewWindow?.show();
        }
      }

      // Only create WebContentsView window if not in test mode
      if (!isTestMode) {
        if (!hasWebContentsViewWindow) {
          debug('example-app:init', 'Creating new WebContentsView window on activate');
          const { webContentsView } = await windows.initWebContentsViewWindow();
          // Pass the webContentsView directly to subscribe
          if (webContentsView) {
            debug(
              'example-app:init',
              `Subscribing WebContentsView directly, WebContents ID: ${webContentsView.webContents.id}`,
            );
            subscribe([webContentsView]);
          }
        } else if (!webContentsViewWindow?.isVisible()) {
          debug('example-app:init', 'Showing existing WebContentsView window');
          webContentsViewWindow?.show();
        }
      }

      // Focus the determined window (use optional chaining)
      debug('example-app:init', `Focusing window ID: ${windowToFocus?.id}`);
      windowToFocus?.focus();
    });

    // Function to track and subscribe new windows to the bridge
    const trackNewWindows = () => {
      try {
        // debug('Tracking new windows');
        const {
          mainWindow,
          directWebContentsWindow,
          browserViewWindow,
          webContentsViewWindow,
          runtimeWindows,
        } = windows.getWindowRefs();
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
            debug('example-app:init', `Adding new runtime window ${win.id} to tracking`);
            runtimeWindows.push(win);
            const subscription = subscribe([win]);
            win.once('closed', () => {
              debug('example-app:init', `Runtime window ${win.id} closed, cleaning up`);
              const index = runtimeWindows.indexOf(win);
              if (index !== -1) runtimeWindows.splice(index, 1);
              subscription.unsubscribe();
              debug('example-app:init', `Window ${win.id} closed and unsubscribed`);
            });
          }
        }

        // Clean up destroyed windows from runtimeWindows
        for (let i = runtimeWindows.length - 1; i >= 0; i--) {
          if (runtimeWindows[i]?.isDestroyed()) {
            // Optional chaining for safety
            debug(
              'example-app:init',
              `Removing destroyed window from runtimeWindows array at index ${i}`,
            );
            runtimeWindows.splice(i, 1);
          }
        }
      } catch (error) {
        debug('windows', 'Error tracking windows:', error);
      }
    };

    // Run the tracker when the app starts
    debug('example-app:init', 'Running initial window tracker');
    trackNewWindows();

    // Poll for new windows every second to catch any windows created by child windows
    debug('example-app:init', 'Setting up window tracking interval');
    windowTrackingInterval = setInterval(trackNewWindows, 1000);

    // Modify quit handler to clean up both windows if they exist
    app.on('quit', () => {
      debug('example-app:init', 'App quit event triggered');

      // In test mode, cleanup should already be done in before-quit handler
      if (isTestMode) {
        debug('example-app:init', 'Test mode - cleanup already handled in before-quit');
        return;
      }

      try {
        debug('example-app:init', 'Cleaning up resources on quit');
        clearInterval(windowTrackingInterval);
        trayInstance.destroy();
        if (bridge) {
          bridge.destroy();
          debug('core', 'Bridge destroyed during app quit.');
        }

        if (store) {
          store.destroy();
          debug('core', 'Store destroyed during app quit.');
        }

        // Clean up all windows
        debug('example-app:init', 'Cleaning up windows');
        windows.cleanupWindows();
        debug('example-app:init', 'Windows cleanup complete');
      } catch (error) {
        debug('core', 'Error during cleanup:', error);
      }
    });

    debug('example-app:init', 'Setting initial window focus');
    app.focus({ steal: true });
    const { mainWindow } = windows.getWindowRefs();
    mainWindow?.focus();

    // Get the dispatch function
    const dispatch = createDispatch(store);

    // Setup IPC handlers
    debug('example-app:init', 'Setting up IPC handlers');

    // Set up handler for closing the current window
    ipcMain.handle(AppIpcChannel.CLOSE_CURRENT_WINDOW, async (event) => {
      debug(
        'example-app:init',
        `CloseCurrentWindow request received from window ID: ${event.sender.id}`,
      );
      try {
        // Get the window that sent this message
        const window = BrowserWindow.fromWebContents(event.sender);
        const { mainWindow } = windows.getWindowRefs();

        if (window) {
          // If this is the main window, just minimize it
          if (window === mainWindow) {
            debug('example-app:init', 'Minimizing main window instead of closing');
            if (!window.isDestroyed()) {
              window.minimize();
            }
          } else {
            // Common close logic for all modes
            debug('example-app:init', `Closing window ${window.id}`);

            // In all modes, just close the window directly
            window.isFocused() && window.close();
          }
        }
        return true;
      } catch (error) {
        debug('core', 'Error handling closeCurrentWindow:', error);
        return false;
      }
    });

    // Set up handler for window-created event
    ipcMain.handle(AppIpcChannel.WINDOW_CREATED, (event) => {
      const window = BrowserWindow.fromWebContents(event.sender);
      const windowId = window ? window.id : event.sender.id;
      debug('example-app:init', `WINDOW_CREATED event handled for window ID: ${windowId}`);
      // Acknowledge the event
      return { success: true, windowId };
    });

    // Set up handler to check if the window is the main window
    ipcMain.handle(AppIpcChannel.IS_MAIN_WINDOW, (event) => {
      const window = BrowserWindow.fromWebContents(event.sender);
      const { mainWindow } = windows.getWindowRefs();
      // Check if this is the main window
      const isMainWindow = window === mainWindow;
      debug(
        'example-app:init',
        `is-main-window check for window ${event.sender.id}: ${isMainWindow}`,
      );
      return isMainWindow;
    });

    // Set up handler to get the window ID
    ipcMain.handle(AppIpcChannel.GET_WINDOW_ID, (event) => {
      const window = BrowserWindow.fromWebContents(event.sender);
      const windowId = window ? window.id : null;
      debug('example-app:init', `get-window-id for ${event.sender.id}: ${windowId}`);
      return windowId;
    });

    // Set up handler to get window type (main, secondary, runtime) and ID
    ipcMain.handle(AppIpcChannel.GET_WINDOW_INFO, (event) => {
      const window = BrowserWindow.fromWebContents(event.sender);
      if (!window) {
        debug('example-app:init', `get-window-info: No window found for ${event.sender.id}`);
        return null;
      }

      const { mainWindow, directWebContentsWindow, browserViewWindow, webContentsViewWindow } =
        windows.getWindowRefs();
      const windowId = window.id;
      let windowType: 'main' | 'directWebContents' | 'browserView' | 'webContentsView' | 'runtime' =
        'runtime'; // Default to runtime

      if (window === mainWindow) {
        windowType = 'main';
      } else if (window === directWebContentsWindow) {
        windowType = 'directWebContents';
      } else if (window === browserViewWindow) {
        windowType = 'browserView';
      } else if (window === webContentsViewWindow) {
        windowType = 'webContentsView';
      } else if (
        browserViewWindow &&
        browserView &&
        event.sender.id === browserView.webContents.id
      ) {
        // Special case for BrowserView - it has its own WebContents that's different from the window
        windowType = 'browserView';
      }

      // Get the subscriptions for this window - default to '*' if function not available
      const subscriptions = bridge.getWindowSubscriptions
        ? bridge.getWindowSubscriptions(event.sender.id)
        : '*';

      debug(
        'example-app:init',
        `get-window-info for ${event.sender.id}: type=${windowType}, id=${windowId}, subscriptions=${subscriptions}`,
      );
      return { type: windowType, id: windowId, subscriptions };
    });

    // IPC Handler for creating runtime windows
    ipcMain.handle(AppIpcChannel.CREATE_RUNTIME_WINDOW, (event) => {
      debug('example-app:init', `create-runtime-window request from ${event.sender.id}`);
      debug('ipc', `Received request to create runtime window from sender ${event.sender.id}`);
      const newWindow = windows.createRuntimeWindow();
      // Subscribe the new window immediately
      debug(
        'example-app:init',
        `Runtime window created with ID: ${newWindow.id}, subscribing to bridge`,
      );
      subscribe([newWindow]);
      return { success: true, windowId: newWindow.id };
    });

    // Set up handler to get the current mode
    ipcMain.handle(AppIpcChannel.GET_MODE, () => {
      debug('example-app:init', `get-mode request, returning: ${mode}, ${modeName}`);
      return {
        mode,
        modeName,
      };
    });

    // Set up handler to quit the app
    ipcMain.handle(AppIpcChannel.QUIT_APP, () => {
      debug('example-app:init', 'quitApp request received, setting isAppQuitting flag');
      isAppQuitting = true;
      app.quit();
      return true;
    });

    // Set up the handler for the main process thunk
    ipcMain.handle(AppIpcChannel.EXECUTE_MAIN_THUNK, async () => {
      debug('example-app:init', 'Received IPC request to execute main process thunk');
      debug('core', '[MAIN] Main process thunk IPC handler called');

      try {
        debug('core', '[MAIN] Creating thunk context for main process thunk');
        // Create a context for the main process thunk
        const thunkContext: ThunkContext = {
          environment: 'main',
          logPrefix: 'MAIN_PROCESS',
        };

        debug('core', '[MAIN] Getting current state from store');
        // Get the current counter value from store
        const currentState = store.getState();
        const counter = currentState.counter || 0;
        debug('core', `[MAIN] Current counter value: ${counter}`);

        debug('core', '[MAIN] Creating double counter thunk');
        // Create thunk with the updated BaseState (with optional properties)
        const thunk = createDoubleCounterThunk(counter, thunkContext);

        debug('core', '[MAIN] About to dispatch thunk');
        const result = await dispatch(thunk);
        debug('core', '[MAIN] Thunk dispatch completed, result:', result);

        return { success: true, result };
      } catch (error) {
        debug('core:error', '[MAIN] Error executing main process thunk:', error);
        return { success: false, error: String(error) };
      }
    });

    // Set up the handler for the main process slow thunk
    ipcMain.handle(AppIpcChannel.EXECUTE_MAIN_THUNK_SLOW, async () => {
      debug('example-app:init', 'Received IPC request to execute main process slow thunk');

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
        debug('core', '[MAIN] Error executing main process slow thunk:', error);
        return { success: false, error: String(error) };
      }
    });

    ipcMain.handle(AppIpcChannel.UNSUBSCRIBE, (event, keys: string[]) => {
      debug(
        'example-app:init',
        `[IPC] Unsubscribe request from window ${event.sender.id}, keys: ${keys ? keys.join(', ') : 'all'}`,
      );
      const windowOrView = BrowserWindow.fromWebContents(event.sender);
      if (!windowOrView) {
        debug('example-app:init', `[IPC] No window found for sender ${event.sender.id}`);
        return { success: false, error: 'No window found' };
      }

      try {
        // If no keys provided or empty array, unsubscribe from everything
        if (!keys || keys.length === 0 || keys.includes('*')) {
          debug('example-app:init', `[IPC] Unsubscribing window ${event.sender.id} from all state`);
          bridge.unsubscribe([windowOrView as WebContentsWrapper]);
        } else {
          debug(
            'example-app:init',
            `[IPC] Unsubscribing window ${event.sender.id} from keys: ${keys.join(', ')}`,
          );
          bridge.unsubscribe([windowOrView as WebContentsWrapper], keys);
        }

        // Get current subscriptions after unsubscribing
        const currentSubscriptions = bridge.getWindowSubscriptions(windowOrView.id);
        debug(
          'example-app:init',
          `[IPC] Current subscriptions after unsubscribe: ${currentSubscriptions?.join(', ') || 'none'}`,
        );

        // Return the current subscriptions
        return { success: true, subscriptions: currentSubscriptions || [] };
      } catch (error) {
        debug('example-app:init', `[IPC] Error unsubscribing window ${event.sender.id}:`, error);
        return { success: false, error: String(error) };
      }
    });

    ipcMain.handle(AppIpcChannel.SUBSCRIBE, (event, keys: string[]) => {
      debug(
        'example-app:init',
        `[IPC] Subscribe request from window ${event.sender.id}, keys: ${keys.join(', ')}`,
      );
      const windowOrView = BrowserWindow.fromWebContents(event.sender);
      if (!windowOrView) {
        debug('example-app:init', `[IPC] No window found for sender ${event.sender.id}`);
        return { success: false, error: 'No window found' };
      }

      try {
        if (!keys || keys.length === 0 || keys.includes('*')) {
          debug('example-app:init', `[IPC] Subscribing window ${event.sender.id} to all state`);
          bridge.subscribe([windowOrView as WebContentsWrapper]);
        } else {
          debug(
            'example-app:init',
            `[IPC] Subscribing window ${event.sender.id} to keys: ${keys.join(', ')}`,
          );
          bridge.subscribe([windowOrView as WebContentsWrapper], keys);
        }

        // Get current subscriptions after subscribing
        const currentSubscriptions = bridge.getWindowSubscriptions(windowOrView.id);
        debug(
          'example-app:init',
          `[IPC] Current subscriptions after subscribe: ${currentSubscriptions?.join(', ') || 'none'}`,
        );

        // Return the current subscriptions
        return { success: true, subscriptions: currentSubscriptions || [] };
      } catch (error) {
        debug('example-app:init', `[IPC] Error subscribing window ${event.sender.id}:`, error);
        return { success: false, error: String(error) };
      }
    });

    debug('example-app:init', 'App initialization complete, waiting for events');
  })
  .catch((error) => {
    debug('core', 'Error during app initialization:', error);
    debug('example-app:init', `CRITICAL ERROR during app initialization: ${error}`);
  });

// For testing and debugging
debug('core', 'App starting in environment:', process.env.NODE_ENV);
debug('core', 'isDev:', isDevMode);
debug('core', 'isTest:', isTestMode);
debug('core', `Using Zubridge mode: ${modeName}`);
debug('core', 'electron/index.ts is loaded');
