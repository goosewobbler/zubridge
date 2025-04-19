# Getting Started with @zubridge/electron

This guide will help you get started with using @zubridge/electron in your Electron application. The library implements a backend contract that establishes the main process as the authoritative source of state, with the renderer process acting as a synchronized replica.

## Installation

```bash
npm install @zubridge/electron zustand
```

Or use your dependency manager of choice, e.g. `pnpm`, `yarn`.

## How it works

Zubridge creates a bridge between Electron's main and renderer processes using IPC (Inter-Process Communication). The bridge automatically synchronizes state changes between the main process and all renderer processes, ensuring that all windows stay in sync with the authoritative state.

## Core Setup

Regardless of which state management approach you choose, these setup steps are common to all implementations.

### Preload Script

Create a preload script to expose the Zubridge handlers to the renderer process:

```ts
// `src/preload.js`
import { contextBridge } from 'electron';
import { preloadBridge } from '@zubridge/electron/preload';

const { handlers } = preloadBridge();

// Expose the handlers to the renderer process
contextBridge.exposeInMainWorld('zubridge', handlers);
```

### Renderer Process Hooks

In the renderer process, create hooks to access the store and dispatch actions:

```ts
// `src/renderer/hooks/useStore.ts`
import { createUseStore } from '@zubridge/electron';
import type { AppState } from '../../types/index.js';

// Create a hook to access the store
export const useStore = createUseStore<AppState>();
```

Then use these hooks in your components:

```tsx
// `src/renderer/App.tsx`
import { useStore } from './hooks/useStore.js';
import { useDispatch } from '@zubridge/electron';
import type { AppState } from '../types/index.js';

export function App() {
  const counter = useStore((state: AppState) => state.counter);
  const dispatch = useDispatch<AppState>();

  return (
    <div>
      <p>Counter: {counter}</p>
      <button onClick={() => dispatch('INCREMENT')}>Increment</button>
      <button onClick={() => dispatch('DECREMENT')}>Decrement</button>
      <button onClick={() => dispatch({ type: 'SET_COUNTER', payload: 0 })}>Reset</button>
    </div>
  );
}
```

## Choosing an Approach

There are three main approaches to using the Electron backend contract:

1. **Zustand Adapter**: If you're already using Zustand, this is the easiest path. Use `createZustandBridge` to adapt your existing Zustand store.

2. **Redux Adapter**: If you're using Redux for state management, use `createReduxBridge` to integrate your Redux store.

3. **Custom State Manager**: For more flexibility or if you're using another state management solution, implement the `StateManager` interface and use `createCoreBridge`.

## Approach 1: Using the Zustand Adapter

### Create Store in Main Process

First, create the Zustand store for your application using `zustand/vanilla` in the main process:

```ts
// `src/main/store.ts`
import { createStore } from 'zustand/vanilla';
import type { AppState } from '../types/index.js';

const initialState: AppState = {
  counter: 0,
  ui: { ... }
};

// create app store
export const store = createStore<AppState>()(() => initialState);
```

### Initialize Bridge in Main Process

In the main process, instantiate the bridge with your store and an array of window objects:

```ts
// `src/main/index.ts`
import { app, BrowserWindow } from 'electron';
import { createZustandBridge } from '@zubridge/electron/main';
import { store } from './store.js';

// create main window
const mainWindow = new BrowserWindow({
  // ...
  webPreferences: {
    preload: path.join(__dirname, 'preload.js'),
    // other options...
  },
});

// instantiate bridge
const { unsubscribe } = createZustandBridge(store, [mainWindow]);

// unsubscribe on quit
app.on('quit', unsubscribe);
```

## Approach 2: Using the Redux Adapter

If you're using Redux for state management, you can integrate it seamlessly with Zubridge.

### Create Redux Store in Main Process

Create your Redux store in the main process:

```ts
// `src/main/store.ts`
import { configureStore } from '@reduxjs/toolkit';
import counterReducer from './features/counter/counterSlice.js';

// Create the Redux store
export const store = configureStore({
  reducer: {
    counter: counterReducer,
  },
  // Optional middleware configuration
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: false, // Helpful for Electron IPC integration
    }),
});

// Type inference for your application state
export type RootState = ReturnType<typeof store.getState>;
```

### Initialize Bridge in Main Process

In the main process, instantiate the bridge with your Redux store:

```ts
// `src/main/index.ts`
import { app, BrowserWindow } from 'electron';
import { createReduxBridge } from '@zubridge/electron/main';
import { store } from './store.js';

// create main window
const mainWindow = new BrowserWindow({
  // ...
  webPreferences: {
    preload: path.join(__dirname, 'preload.js'),
    // other options...
  },
});

// instantiate bridge
const { unsubscribe, dispatch } = createReduxBridge(store, [mainWindow]);

// you can dispatch actions directly from the main process
dispatch({ type: 'counter/initialize', payload: 5 });

// unsubscribe on quit
app.on('quit', unsubscribe);
```

## Approach 3: Using a Custom State Manager

If you prefer to use your own state management solution or want more control, you can implement the `StateManager` interface and use the core bridge.

### Create a Custom State Manager

First, create a state manager that implements the required interface:

```ts
// `src/main/state-manager.ts`
import type { StateManager } from '@zubridge/electron';
import type { Action } from '@zubridge/types';

// Define your application state type
interface AppState {
  counter: number;
  // other properties...
}

// Create your state
const appState: AppState = {
  counter: 0,
  // Initialize other properties...
};

// Create a state manager
export const stateManager: StateManager<AppState> = {
  // Return the current state
  getState: () => appState,

  // Subscription management
  listeners: new Set<(state: AppState) => void>(),
  subscribe: (listener) => {
    stateManager.listeners.add(listener);
    return () => {
      stateManager.listeners.delete(listener);
    };
  },

  // Process actions and update state
  processAction: (action: Action) => {
    switch (action.type) {
      case 'INCREMENT':
        appState.counter += 1;
        break;
      case 'DECREMENT':
        appState.counter -= 1;
        break;
      case 'SET_COUNTER':
        appState.counter = action.payload as number;
        break;
      // Handle other actions...
    }

    // Notify all listeners about the state change
    stateManager.listeners.forEach((listener) => {
      listener(appState);
    });
  },
};
```

### Initialize Bridge in Main Process

Use `createCoreBridge` to connect your state manager to the renderer processes:

```ts
// `src/main/index.ts`
import { app, BrowserWindow } from 'electron';
import { createCoreBridge } from '@zubridge/electron/main';
import { stateManager } from './state-manager.js';

// create main window
const mainWindow = new BrowserWindow({
  // ...
  webPreferences: {
    preload: path.join(__dirname, 'preload.js'),
    // other options...
  },
});

// instantiate bridge
const { unsubscribe } = createCoreBridge(stateManager, [mainWindow]);

// unsubscribe on quit
app.on('quit', unsubscribe);
```

## Advanced Configuration

### Working with Multiple Windows

For applications with multiple windows, you can subscribe and unsubscribe windows as needed:

```ts
// `src/main/index.ts`
import { app, BrowserWindow } from 'electron';
import { createZustandBridge } from '@zubridge/electron/main';
import { store } from './store.js';

// create main window
const mainWindow = new BrowserWindow({
  /* ... */
});

// instantiate bridge with initial window
const { unsubscribe, subscribe } = createZustandBridge(store, [mainWindow]);

// Later, create a new window
const secondWindow = new BrowserWindow({
  /* ... */
});

// Subscribe the new window
const subscription = subscribe([secondWindow]);

// Unsubscribe specific window when it's closed
secondWindow.on('closed', () => {
  subscription.unsubscribe();
});

// unsubscribe all windows on quit
app.on('quit', unsubscribe);
```

## Next Steps

For more detailed information about the API:

- [API Reference](./api-reference.md) - Complete reference for all API functions and types
- [Main Process](./main-process.md) - Detailed guide for using Zubridge in the main process
- [Renderer Process](./renderer-process.md) - Detailed guide for using Zubridge in the renderer process
- [Backend Contract](./backend-contract.md) - Detailed explanation of the backend contract
- [Migration Guide](./migration-guide.md) - Guide for migrating from older versions

## Example Applications

The [Zubridge Electron Example](https://github.com/goosewobbler/zubridge/tree/main/apps/electron-example) demonstrates the different approaches to state management with Zubridge:

- **Basic Mode**: Zustand with direct store mutations using `createZustandBridge`
- **Handlers Mode**: Zustand with dedicated action handler functions using `createZustandBridge`
- **Reducers Mode**: Zustand with Redux-style reducers using `createZustandBridge`
- **Redux Mode**: Redux with Redux Toolkit using `createReduxBridge`
- **Custom Mode**: Custom state manager implementation using `createCoreBridge`

Each example demonstrates the same functionality implemented with different state management patterns, allowing you to compare approaches and choose what works best for your application.
