# Zubridge Middleware for Electron

Node.js bindings for the Zubridge middleware framework, providing observability and extensibility for Electron applications.

## Features

- 📊 **Core Middleware Framework**: Extensible pipeline for processing state actions
- 🔍 **Logging Middleware**: Debug state changes with detailed logs
- 🔌 **WebSocket Server**: Monitor state and actions in real-time from external tools
- 🔄 **MessagePack Serialization**: Efficient binary format for state transmission
- ⚡ **Performance**: Core functionality implemented in Rust with Node.js bindings via NAPI-rs

## Installation

```bash
pnpm add @zubridge/middleware
```

## Basic Usage

```typescript
// main.ts - Electron main process
import { app, BrowserWindow, ipcMain } from 'electron';
import { initZubridgeMiddleware } from '@zubridge/middleware';
import path from 'path';

// Initial application state
const initialState = {
  counter: 0,
  theme: {
    isDark: false,
  },
};

// Handle creating/removing shortcuts on Windows when installing/uninstalling
if (require('electron-squirrel-startup')) {
  app.quit();
}

app.whenReady().then(() => {
  // Initialize middleware with WebSocket server (optional)
  const middleware = initZubridgeMiddleware({
    logging: {
      enabled: true,
      websocketPort: 9000, // Start WebSocket server on port 9000
      consoleOutput: true,
    },
  });

  // Set initial state
  middleware.setState(initialState);

  // Create main window
  const mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // Load the app
  mainWindow.loadFile('index.html');

  // Handle Zubridge get state command
  ipcMain.handle('zubridge:get-initial-state', async () => {
    return middleware.getState();
  });

  // Handle Zubridge dispatch action command
  ipcMain.handle('zubridge:dispatch-action', async (_, action) => {
    // Process the action through middleware
    await middleware.processAction(action);

    // Apply action to state (example implementation)
    const state = await middleware.getState();
    const newState = handleAction(state, action);
    await middleware.setState(newState);

    // Send updated state to renderer
    mainWindow.webContents.send('zubridge:state-update', await middleware.getState());

    return { success: true };
  });
});

// Action handler (example implementation)
function handleAction(state, action) {
  const newState = { ...state };

  switch (action.type) {
    case 'counter.increment':
      newState.counter = (state.counter || 0) + (action.payload || 1);
      break;
    case 'counter.decrement':
      newState.counter = (state.counter || 0) - (action.payload || 1);
      break;
    case 'theme.toggle':
      newState.theme = {
        ...state.theme,
        isDark: !state.theme.isDark,
      };
      break;
  }

  return newState;
}

// Quit when all windows are closed
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
```

## Integrating with @zubridge/electron

This middleware is designed to work seamlessly with `@zubridge/electron`. Here's how to integrate it:

```typescript
import { app, BrowserWindow } from 'electron';
import { createElectronBridge } from '@zubridge/electron';
import { initZubridgeMiddleware } from '@zubridge/middleware';
import path from 'path';

// Initial state and action handlers
const initialState = { counter: 0, theme: { isDark: false } };
const actionHandlers = {
  'COUNTER:INCREMENT':
    (payload = 1) =>
    (state) => ({ ...state, counter: state.counter + payload }),
  'COUNTER:DECREMENT':
    (payload = 1) =>
    (state) => ({ ...state, counter: state.counter - payload }),
  'THEME:TOGGLE': () => (state) => ({
    ...state,
    theme: { ...state.theme, isDark: !state.theme.isDark },
  }),
};

app.whenReady().then(() => {
  // Initialize middleware
  const middleware = initZubridgeMiddleware({
    logging: {
      enabled: true,
      websocketPort: 9000,
      consoleOutput: true,
    },
  });

  // Create Zubridge bridge with middleware hooks
  const bridge = createElectronBridge({
    initialState,
    mode: 'handlers',
    handlers: actionHandlers,
    middleware: [
      {
        // Called before action is processed
        beforeAction: async (action, state) => {
          // Process action through middleware
          await middleware.processAction({
            type: action.type,
            payload: action.payload,
          });
          return action; // return action to continue processing
        },

        // Called after state is updated
        afterStateChange: async (newState, action) => {
          // Update middleware's state
          await middleware.setState(newState);
        },
      },
    ],
  });

  // Create main window
  const mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
    },
  });

  mainWindow.loadFile('index.html');
});
```

### How it Works

1. **Middleware Initialization**: The middleware is initialized with configuration options that control logging and the WebSocket server.

2. **Integration with Zubridge**: The middleware is integrated with `@zubridge/electron` through the `middleware` option, which accepts hooks for `beforeAction` and `afterStateChange`.

3. **Action Flow**:

   - When an action is dispatched from the renderer process, it first goes through Zubridge's IPC mechanism.
   - The action is then passed to the `beforeAction` hook, which sends it to the middleware.
   - After middleware processing, the action continues to the handler/reducer for state updates.
   - The updated state is then passed to the `afterStateChange` hook, which updates the middleware's state.
   - Finally, the updated state is sent back to all renderer processes.

4. **Debugging**: The WebSocket server provides real-time monitoring of all actions and state changes, enabling external debugging tools to connect and visualize the state flow.

## WebSocket Monitoring

When the WebSocket server is enabled, you can connect to it at `ws://localhost:9000` to monitor state changes and actions. The server uses MessagePack for efficient serialization.

## Building from Source

To build the native Node.js module from source:

```bash
cd packages/middleware/node
pnpm install
pnpm build
```

## License

MIT
