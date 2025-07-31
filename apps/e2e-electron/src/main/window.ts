import path from 'node:path';
import process from 'node:process';
import { BrowserWindow, BrowserView, WebContentsView, shell, app } from 'electron';
import { isDev } from '@zubridge/electron/main';
import { getZubridgeMode } from '../utils/mode.js';
import { getPreloadPath } from '../utils/path.js';

// Debug logger with timestamp
function debugWindow(message: string) {
  const timestamp = new Date().toISOString();
  console.log(`[WINDOW ${timestamp}] ${message}`);
}

// Check if running in test mode
const isTestMode = process.env.TEST === 'true';
debugWindow(`Test mode: ${isTestMode}`);

// Window reference variables
let mainWindow: BrowserWindow | undefined = undefined;
let directWebContentsWindow: BrowserWindow | undefined = undefined;
let browserViewWindow: BrowserWindow | undefined = undefined;
let browserView: BrowserView | undefined = undefined;
let webContentsViewWindow: BrowserWindow | undefined = undefined;
let webContentsView: WebContentsView | undefined = undefined;

// Track runtime windows that need cleanup
const runtimeWindows: BrowserWindow[] = [];

// Configuration
const preloadPath = getPreloadPath();

// Initialize isDev status - we need to await this
let isDevEnv: boolean | undefined;

// Window sizes and positions for grid layout
const windowWidth = 800;
const windowHeight = 600;
const windowSpacing = 20;

const shouldQuit = (isAppQuitting: boolean) => {
  return (
    isAppQuitting ||
    (directWebContentsWindow && !directWebContentsWindow.isDestroyed()) ||
    (browserViewWindow && !browserViewWindow.isDestroyed()) ||
    (webContentsViewWindow && !webContentsViewWindow.isDestroyed())
  );
};

// Monitor window DOM content loaded
function setupDomReadyLogging(window: BrowserWindow | BrowserView | WebContentsView, windowName: string) {
  window.webContents.on('dom-ready', () => {
    debugWindow(`${windowName} DOM ready`);
  });

  window.webContents.on('did-finish-load', () => {
    debugWindow(`${windowName} finished loading`);
  });

  window.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    debugWindow(`${windowName} failed to load: ${errorDescription} (${errorCode})`);
  });
}

// Setup developer tools keyboard shortcuts
function setupDevToolsShortcuts(window: BrowserWindow, windowName: string) {
  // Register Cmd+Opt+I (Mac) / Ctrl+Shift+I (Windows/Linux) to toggle DevTools
  window.webContents.on('before-input-event', (event, input) => {
    const isMac = process.platform === 'darwin';
    // For Mac: Cmd+Opt+I, For Windows/Linux: Ctrl+Shift+I
    const devToolsShortcut = isMac
      ? input.meta && input.alt && input.key === 'i'
      : input.control && input.shift && input.key === 'i';

    if (devToolsShortcut) {
      debugWindow(`DevTools shortcut pressed in ${windowName}`);
      if (window.webContents.isDevToolsOpened()) {
        window.webContents.closeDevTools();
        debugWindow(`DevTools closed for ${windowName}`);
      } else {
        window.webContents.openDevTools({ mode: 'detach' });
        debugWindow(`DevTools opened for ${windowName}`);
      }
      event.preventDefault();
    }
  });
}

// Function to get the HTML path for renderer
const getRendererPath = () => path.join(__dirname, '..', 'renderer', 'index.html');

// Function to initialize the main window
export async function initMainWindow(isAppQuitting: boolean): Promise<BrowserWindow> {
  debugWindow('Initializing main window');

  // Ensure we have the correct development mode status
  debugWindow(
    `Environment check: NODE_ENV=${process.env.NODE_ENV}, ELECTRON_IS_DEV=${process.env.ELECTRON_IS_DEV}, app.isPackaged=${app.isPackaged}`,
  );
  isDevEnv = await isDev();
  debugWindow(`Development mode set to: ${isDevEnv}`);
  if (mainWindow && !mainWindow.isDestroyed()) {
    debugWindow('Reusing existing main window');
    mainWindow.show();
    return mainWindow;
  }

  // Debug environment variable at window creation time
  const windowCreationMode = getZubridgeMode();
  debugWindow(`Creating main window with mode: ${windowCreationMode}`);
  debugWindow(`ZUBRIDGE_MODE env var at window creation: ${process.env.ZUBRIDGE_MODE}`);

  mainWindow = new BrowserWindow({
    width: windowWidth,
    height: windowHeight,
    x: 0,
    y: 0,
    title: `Zubridge Electron Example (${windowCreationMode}) - Main Window`,
    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
  });

  debugWindow(`Main window created with ID: ${mainWindow.id}, using preload: ${preloadPath}`);
  mainWindow.setTitle(`Zubridge Electron Example (${windowCreationMode}) - Main Window`);

  if (isDevEnv) {
    debugWindow('Loading main window from dev server');
    mainWindow.loadURL('http://localhost:5173/');
  } else {
    const htmlPath = getRendererPath();
    debugWindow(`Loading main window from file: ${htmlPath}`);
    mainWindow.loadFile(htmlPath);
  }

  setupDomReadyLogging(mainWindow, 'Main window');
  setupDevToolsShortcuts(mainWindow, 'Main window');

  mainWindow.on('ready-to-show', () => {
    debugWindow('Main window ready to show');
    mainWindow?.show();
  });

  mainWindow.on('close', (event) => {
    debugWindow('Main window close event');
    if (shouldQuit(isAppQuitting)) {
      debugWindow('Allowing main window to close');
      mainWindow = undefined; // Allow GC
      return; // Allow closing if quitting or other primary window exists
    }
    debugWindow('Preventing main window close, hiding instead');
    event.preventDefault();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.hide();
    }
  });

  return mainWindow;
}

// Function to initialize the secondary window (registering webContents)
export async function initDirectWebContentsWindow(): Promise<BrowserWindow> {
  // Ensure we have the correct development mode status
  if (isDevEnv === undefined) {
    isDevEnv = await isDev();
    debugWindow(`Development mode set to: ${isDevEnv}`);
  }
  debugWindow('Initializing direct WebContents window');
  if (directWebContentsWindow && !directWebContentsWindow.isDestroyed()) {
    debugWindow('Reusing existing direct WebContents window');
    directWebContentsWindow.show();
    return directWebContentsWindow;
  }

  directWebContentsWindow = new BrowserWindow({
    width: windowWidth,
    height: windowHeight,
    x: windowWidth + windowSpacing,
    y: 0,
    title: `Zubridge Electron Example (${getZubridgeMode()}) - Direct WebContents Window`,
    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
  });

  debugWindow(`Direct WebContents window created with ID: ${directWebContentsWindow.id}`);
  directWebContentsWindow.setTitle(`Zubridge Electron Example (${getZubridgeMode()}) - Direct WebContents Window`);

  if (isDevEnv) {
    debugWindow('Loading direct WebContents window from dev server');
    directWebContentsWindow.loadURL('http://localhost:5173/');
  } else {
    const htmlPath = getRendererPath();
    debugWindow(`Loading direct WebContents window from file: ${htmlPath}`);
    directWebContentsWindow.loadFile(htmlPath);
  }

  setupDomReadyLogging(directWebContentsWindow, 'Direct WebContents window');
  setupDevToolsShortcuts(directWebContentsWindow, 'Direct WebContents window');

  // In renderer the WebContents instance is wrapped directly, so add a debug property
  directWebContentsWindow.webContents.once('did-finish-load', () => {
    debugWindow('Injecting debug code into direct WebContents window');
    directWebContentsWindow?.webContents
      .executeJavaScript(
        `
        console.log('Direct WebContents window loaded and executing JavaScript');
      `,
      )
      .catch((err) => debugWindow(`Failed to inject debug code: ${err}`));
  });

  directWebContentsWindow.on('ready-to-show', () => {
    debugWindow('Direct WebContents window ready to show');
    directWebContentsWindow?.show();
  });

  // Allow secondary window to close normally, but nullify reference
  directWebContentsWindow.on('close', () => {
    debugWindow('Direct WebContents window closing');
    directWebContentsWindow = undefined;
  });

  return directWebContentsWindow;
}

// Function to initialize a third window with BrowserView
export async function initBrowserViewWindow(): Promise<{
  window: BrowserWindow | null;
  browserView: BrowserView | null;
}> {
  // Ensure we have the correct development mode status
  if (isDevEnv === undefined) {
    isDevEnv = await isDev();
    debugWindow(`Development mode set to: ${isDevEnv}`);
  }
  // Skip creation in test mode
  if (isTestMode) {
    debugWindow('Skipping BrowserView window creation in test mode');
    return { window: null, browserView: null };
  }

  debugWindow('Initializing BrowserView window');
  if (browserViewWindow && browserView && !browserViewWindow.isDestroyed()) {
    debugWindow('Reusing existing BrowserView window');
    browserViewWindow.show();
    return { window: browserViewWindow, browserView };
  }

  browserViewWindow = new BrowserWindow({
    width: windowWidth,
    height: windowHeight,
    x: 0,
    y: windowHeight + windowSpacing,
    title: `Zubridge Electron Example (${getZubridgeMode()}) - BrowserView Window`,
  });

  debugWindow(`BrowserView window created with ID: ${browserViewWindow.id}`);

  // Create a BrowserView to host our content
  browserView = new BrowserView({
    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      devTools: true,
    },
  });

  debugWindow('BrowserView created, attaching to window');

  // Add the browser view to the window
  try {
    browserViewWindow.setBrowserView(browserView);
    debugWindow('setBrowserView successful');

    // Size the BrowserView to fill the window
    const bounds = browserViewWindow.getBounds();
    debugWindow(`Setting BrowserView bounds to: ${JSON.stringify(bounds)}`);

    // Use setAutoResize to handle window resizing automatically
    try {
      browserView.setAutoResize({ width: true, height: true });
      debugWindow('Auto-resize set for BrowserView');
    } catch (e) {
      debugWindow(`Error setting auto-resize: ${e}`);
    }

    browserView.setBounds({
      x: 0,
      y: 0,
      width: bounds.width,
      height: bounds.height,
    });
  } catch (e) {
    debugWindow(`Error attaching BrowserView: ${e}`);
    // Fallback to direct content loading in the window if setBrowserView fails
    debugWindow('Fallback to loading content directly in the window');
    if (isDevEnv) {
      browserViewWindow.loadURL('http://localhost:5173/');
    } else {
      browserViewWindow.loadFile(getRendererPath(), {
        hash: 'browserView',
      });
    }
    // Return early with a null browserView to signal that it wasn't attached
    return { window: browserViewWindow, browserView: null as any };
  }

  setupDomReadyLogging(browserView as any, 'BrowserView');

  // Load the secondary window content
  if (isDevEnv) {
    debugWindow('Loading BrowserView from dev server');
    if (browserView) {
      browserView.webContents.loadURL('http://localhost:5173/');

      // Only open DevTools for the view's webContents, not the window's
      setTimeout(() => {
        debugWindow('Opening DevTools for BrowserView');
        if (browserView) {
          browserView.webContents.openDevTools({ mode: 'detach' });
          debugWindow('DevTools opened for BrowserView webContents');
        }
      }, 1000);
    }
  } else {
    debugWindow('Loading BrowserView from file with hash "secondary"');
    if (browserView) {
      browserView.webContents.loadFile(getRendererPath(), { hash: 'browserView' });
    }
  }

  browserView.webContents.setWindowOpenHandler(({ url }) => {
    debugWindow(`BrowserView handled external URL: ${url}`);
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Set up resize handler
  browserViewWindow.on('resize', () => {
    try {
      const newBounds = browserViewWindow?.getBounds();
      if (!browserViewWindow || !newBounds) {
        debugWindow('Cannot resize BrowserView: browserViewWindow is undefined');
        return;
      }

      debugWindow(
        `Resizing BrowserView to: ${JSON.stringify({
          width: newBounds.width,
          height: newBounds.height,
        })}`,
      );

      browserView?.setBounds({
        x: 0,
        y: 0,
        width: newBounds.width,
        height: newBounds.height,
      });
    } catch (e) {
      debugWindow(`Error during BrowserView resize: ${e}`);
    }
  });

  browserViewWindow.on('closed', () => {
    debugWindow('BrowserView window closed');
  });

  // Inject debug code
  browserView.webContents.once('did-finish-load', () => {
    debugWindow('Injecting debug code into BrowserView');
    browserView?.webContents
      .executeJavaScript(
        `
        console.log('BrowserView loaded and executing JavaScript');

        // Check if Zubridge is available
        if (window.zubridge) {
          console.log('Zubridge found in BrowserView');
        } else {
          console.error('Zubridge NOT found in BrowserView');
        }
      `,
      )
      .catch((err) => debugWindow(`Failed to inject debug code: ${err}`));
  });

  // Register keyboard shortcut on window's webContents
  if (browserViewWindow) {
    browserViewWindow.webContents.on('before-input-event', (event, input) => {
      const isMac = process.platform === 'darwin';
      const devToolsShortcut = isMac
        ? input.meta && input.alt && input.key === 'i'
        : input.control && input.shift && input.key === 'i';

      if (devToolsShortcut) {
        debugWindow('DevTools shortcut pressed in BrowserView window');
        event.preventDefault();
        // Forward this shortcut to the browserView webContents instead
        if (browserView && !browserView.webContents.isDevToolsOpened()) {
          browserView.webContents.openDevTools({ mode: 'detach' });
          debugWindow('Opened DevTools for BrowserView webContents');
        } else if (browserView) {
          browserView.webContents.closeDevTools();
          debugWindow('Closed DevTools for BrowserView webContents');
        }
      }
    });
  }

  // Also register on view's webContents as a fallback
  if (browserView) {
    browserView.webContents.on('before-input-event', (event, input) => {
      const isMac = process.platform === 'darwin';
      const devToolsShortcut = isMac
        ? input.meta && input.alt && input.key === 'i'
        : input.control && input.shift && input.key === 'i';

      if (devToolsShortcut) {
        debugWindow('DevTools shortcut pressed in BrowserView');
        if (browserView && browserView.webContents.isDevToolsOpened()) {
          browserView.webContents.closeDevTools();
          debugWindow('Closed DevTools for BrowserView');
        } else if (browserView) {
          browserView.webContents.openDevTools({ mode: 'detach' });
          debugWindow('Opened DevTools for BrowserView');
        }
        event.preventDefault();
      }
    });
  }

  return { window: browserViewWindow, browserView };
}

// Function to initialize a fourth window with WebContentsView
export async function initWebContentsViewWindow(): Promise<{
  window: BrowserWindow | null;
  webContentsView: WebContentsView | null;
}> {
  // Ensure we have the correct development mode status
  if (isDevEnv === undefined) {
    isDevEnv = await isDev();
    debugWindow(`Development mode set to: ${isDevEnv}`);
  }
  // Skip creation in test mode
  if (isTestMode) {
    debugWindow('Skipping WebContentsView window creation in test mode');
    return { window: null, webContentsView: null };
  }

  debugWindow('Initializing WebContentsView window');
  if (webContentsViewWindow && webContentsView && !webContentsViewWindow.isDestroyed()) {
    debugWindow('Reusing existing WebContentsView window');
    webContentsViewWindow.show();
    return { window: webContentsViewWindow, webContentsView };
  }

  webContentsViewWindow = new BrowserWindow({
    width: windowWidth,
    height: windowHeight,
    x: windowWidth + windowSpacing,
    y: windowHeight + windowSpacing,
    title: `Zubridge Electron Example (${getZubridgeMode()}) - WebContentsView Window`,
  });

  debugWindow(`WebContentsView window created with ID: ${webContentsViewWindow.id}`);

  // Create a WebContentsView to host our content
  webContentsView = new WebContentsView({
    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      devTools: true,
    },
  });

  debugWindow('WebContentsView created, attaching to window');

  try {
    // Add the WebContentsView to the window
    webContentsViewWindow.setContentView(webContentsView);
    debugWindow('setContentView successful');
  } catch (e) {
    debugWindow(`Error setting content view: ${e}`);
    // WebContentsView can only be set with setContentView, not setBrowserView
    // Fallback to direct content loading in the window if setContentView fails
    debugWindow('Fallback to loading content directly in the window');
    if (isDevEnv) {
      webContentsViewWindow.loadURL('http://localhost:5173/');
    } else {
      webContentsViewWindow.loadFile(getRendererPath(), {
        hash: 'secondary',
      });
    }
    // Return early with a null webContentsView to signal that it wasn't attached
    return { window: webContentsViewWindow, webContentsView: null as any };
  }

  // Size the WebContentsView to fill the window
  const bounds = webContentsViewWindow.getBounds();
  debugWindow(`Setting WebContentsView bounds to: ${JSON.stringify(bounds)}`);

  webContentsView.setBounds({
    x: 0,
    y: 0,
    width: bounds.width,
    height: bounds.height,
  });

  setupDomReadyLogging(webContentsView, 'WebContentsView');

  // Load the content
  if (isDevEnv) {
    debugWindow('Loading WebContentsView from dev server');
    try {
      if (webContentsView) {
        webContentsView.webContents.loadURL('http://localhost:5173/');

        // Only open DevTools for the view's webContents, not the window's
        setTimeout(() => {
          debugWindow('Opening DevTools for WebContentsView');
          if (webContentsView) {
            webContentsView.webContents.openDevTools();
            debugWindow('DevTools opened for WebContentsView webContents');
          }
        }, 1000);
      }
    } catch (e) {
      debugWindow(`Error loading URL in WebContentsView: ${e}`);
      // Try alternatives if the previous method fails
      try {
        if (webContentsViewWindow) {
          debugWindow('Trying loadURL on window instead');
          webContentsViewWindow.loadURL('http://localhost:5173/');
        }
      } catch (e2) {
        debugWindow(`Alternative loading also failed: ${e2}`);
      }
    }
  } else {
    try {
      if (webContentsView) {
        debugWindow('Loading WebContentsView from file with hash "secondary"');
        webContentsView.webContents.loadFile(getRendererPath(), {
          hash: 'secondary',
        });
      }
    } catch (e) {
      debugWindow(`Error loading file in WebContentsView: ${e}`);
    }
  }

  // Inject debug code
  webContentsView.webContents.once('did-finish-load', () => {
    debugWindow('Injecting debug code into WebContentsView');
    webContentsView?.webContents
      .executeJavaScript(
        `
      console.log('WebContentsView loaded and executing JavaScript');

      // Check if Zubridge is available
      if (window.zubridge) {
        console.log('Zubridge found in WebContentsView');
      } else {
        console.error('Zubridge NOT found in WebContentsView');
      }
    `,
      )
      .catch((err) => debugWindow(`Failed to inject debug code: ${err}`));
  });

  webContentsView.webContents.setWindowOpenHandler(({ url }) => {
    debugWindow(`WebContentsView handled external URL: ${url}`);
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Set up resize handler
  webContentsViewWindow.on('resize', () => {
    try {
      const newBounds = webContentsViewWindow?.getBounds();
      if (!webContentsViewWindow || !newBounds) {
        debugWindow('Cannot resize WebContentsView: webContentsViewWindow is undefined');
        return;
      }

      debugWindow(
        `Resizing WebContentsView to: ${JSON.stringify({
          width: newBounds.width,
          height: newBounds.height,
        })}`,
      );

      webContentsView?.setBounds({
        x: 0,
        y: 0,
        width: newBounds.width,
        height: newBounds.height,
      });
    } catch (e) {
      debugWindow(`Error during WebContentsView resize: ${e}`);
    }
  });

  webContentsViewWindow.on('closed', () => {
    debugWindow('WebContentsView window closed');
  });

  return { window: webContentsViewWindow, webContentsView };
}

// Function to create a new runtime window
export function createRuntimeWindow(): BrowserWindow {
  debugWindow('Creating runtime window');

  const runtimeWindow = new BrowserWindow({
    width: 450,
    height: 465,
    title: `Zubridge Electron Example (${getZubridgeMode()}) - Runtime Window`,
    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
  });

  debugWindow(`Runtime window created with ID: ${runtimeWindow.id}`);

  // Track this window
  runtimeWindows.push(runtimeWindow);
  debugWindow(`Runtime window ${runtimeWindow.id} added to tracking. Total: ${runtimeWindows.length}`);

  if (isDevEnv) {
    debugWindow('Loading runtime window from dev server');
    runtimeWindow.loadURL('http://localhost:5173/');
  } else {
    const htmlPath = getRendererPath();
    debugWindow(`Loading runtime window from file: ${htmlPath}`);
    runtimeWindow.loadFile(htmlPath);
  }

  setupDomReadyLogging(runtimeWindow, 'Runtime window');

  runtimeWindow.on('ready-to-show', () => {
    debugWindow(`Runtime window ${runtimeWindow.id} ready to show`);
    runtimeWindow.show();
  });

  // Important: Clean up from runtimeWindows array when closed
  runtimeWindow.once('closed', () => {
    debugWindow(`Runtime window ${runtimeWindow.id} closed event`);
    const index = runtimeWindows.findIndex((w) => w.id === runtimeWindow.id);
    if (index !== -1) {
      runtimeWindows.splice(index, 1);
      debugWindow(`Runtime window ${runtimeWindow.id} removed from tracking. Remaining: ${runtimeWindows.length}`);
    }
  });

  return runtimeWindow;
}

// Clean up all windows
export function cleanupWindows(): void {
  debugWindow('Starting window cleanup');

  // Close runtime windows
  debugWindow(`Cleaning up ${runtimeWindows.length} runtime windows`);
  runtimeWindows.forEach((window) => {
    if (window && !window.isDestroyed()) {
      debugWindow(`Closing runtime window ${window.id}`);
      window.removeAllListeners('closed'); // Prevent listener leaks
      window.close();
    }
  });
  runtimeWindows.length = 0;

  // Explicitly destroy core windows if they weren't closed
  debugWindow('Cleaning up main windows');
  if (mainWindow && !mainWindow.isDestroyed()) {
    debugWindow('Destroying main window');
    mainWindow.destroy();
  }
  if (directWebContentsWindow && !directWebContentsWindow.isDestroyed()) {
    debugWindow('Destroying direct WebContents window');
    directWebContentsWindow.destroy();
  }
  if (browserViewWindow && !browserViewWindow.isDestroyed()) {
    debugWindow('Destroying BrowserView window');
    browserViewWindow.destroy();
  }
  if (webContentsViewWindow && !webContentsViewWindow.isDestroyed()) {
    debugWindow('Destroying WebContentsView window');
    webContentsViewWindow.destroy();
  }

  debugWindow('Window cleanup complete');
}

// Get window references
export function getWindowRefs() {
  return {
    mainWindow,
    directWebContentsWindow,
    browserViewWindow,
    webContentsViewWindow,
    runtimeWindows,
  };
}
