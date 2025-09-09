// Example showing middleware integration with @zubridge/electron using TypeScript and ESM

import { join } from 'node:path';
import {
  createZustandBridge,
  type ZubridgeMiddleware,
  type ZustandBridge,
} from '@zubridge/electron';
import { initZubridgeMiddleware } from '@zubridge/middleware';
import { app, BrowserWindow } from 'electron';
import { createStore, type StoreApi } from 'zustand/vanilla';

// Define our app state type
interface AppState {
  counter: number;
  theme: {
    isDark: boolean;
  };
  lastActionProcessingTime?: number;
}

// Create a Zustand store with typed state
const store: StoreApi<AppState> = createStore<AppState>((_set) => ({
  counter: 0,
  theme: {
    isDark: false,
  },
}));

// Define action handlers with proper typing
const handlers = {
  'COUNTER:INCREMENT': () => {
    store.setState((state) => ({ ...state, counter: state.counter + 1 }));
  },
  'COUNTER:DECREMENT': () => {
    store.setState((state) => ({ ...state, counter: state.counter - 1 }));
  },
  'COUNTER:SET': (value: number) => {
    store.setState((state) => ({ ...state, counter: value }));
  },
  'THEME:TOGGLE': () => {
    store.setState((state) => ({
      ...state,
      theme: {
        ...state.theme,
        isDark: !state.theme.isDark,
      },
    }));
  },
  // Add a slow action for demonstrating performance metrics
  'COUNTER:INCREMENT_SLOW': () => {
    // Simulate a slow operation
    console.log('Starting slow increment...');
    const startTime = Date.now();

    // Busy-wait to simulate CPU-bound work
    while (Date.now() - startTime < 500) {
      // Do nothing
    }

    console.log(`Slow increment completed in ${Date.now() - startTime}ms`);
    store.setState((state) => ({ ...state, counter: state.counter + 1 }));
  },
};

// Handle app startup
app.whenReady().then(() => {
  // Initialize middleware with WebSocket server for debugging and performance tracking
  const middleware: ZubridgeMiddleware = initZubridgeMiddleware({
    logging: {
      enabled: true,
      websocket_port: 9000, // WebSocket server for monitoring
      console_output: true,
      measure_performance: true, // Enable performance measurement
      performance: {
        enabled: true,
        detail: 'high', // Collect detailed metrics
        include_in_logs: true,
        record_timings: true,
        verbose_output: true, // Enable verbose output for debugging
      },
    },
  });

  // Create a window
  const mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
    },
  });

  // Create bridge with middleware - directly pass middleware instance
  const bridge: ZustandBridge<AppState> = createZustandBridge(store, [mainWindow], {
    handlers,
    // Pass the middleware instance directly
    middleware,
    // Add a hook to capture performance metrics
    afterProcessAction: (action, processingTime, windowId) => {
      console.log(
        `[Performance] Action ${action.type} processed in ${processingTime.toFixed(2)}ms from window ${windowId}`,
      );

      // Store the processing time in state for display in the UI
      store.setState((state) => ({
        ...state,
        lastActionProcessingTime: processingTime,
      }));
    },
  });

  // Load your app
  mainWindow.loadFile(join(__dirname, 'index.html'));

  // Open DevTools in development
  mainWindow.webContents.openDevTools();

  // Example of using the bridge APIs
  console.log(`Active windows: ${bridge.getSubscribedWindows().length}`);

  // Example of dispatching an action
  bridge.dispatch({ type: 'COUNTER:INCREMENT' });

  // Log useful info
  console.log('Zubridge + Middleware Example with Performance Tracking');
  console.log('=====================================================');
  console.log('✅ Bridge initialized with middleware');
  console.log('🔌 WebSocket server running on ws://localhost:9000');
  console.log('📊 Performance metrics collection enabled');
  console.log('🔍 Connect with any WebSocket client to monitor state, actions, and performance');
});

// Quit when all windows are closed
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    // We should reuse our main createWindow function here
    // but just keep this simple for the example
    console.log('Should create a new window');
  }
});
