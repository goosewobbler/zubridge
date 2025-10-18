# Getting Started with `@zubridge/electron`

This guide will help you get started with using `@zubridge/electron` in your Electron application.

## Installation

```bash
npm install @zubridge/electron
```

Or use your dependency manager of choice, e.g. `pnpm`, `yarn`.

## Framework Compatibility

Despite the React-style naming conventions of its hooks (with the `use` prefix), `@zubridge/electron` is fundamentally framework-agnostic:

- **React**: Works seamlessly with React components (most examples in this guide use React)
- **Other Frameworks**: Can be used with Vue.js, Svelte, Angular, or any other frontend framework
- **Vanilla JavaScript**: Works without any framework using Zustand's vanilla store API

The library's hooks are built on Zustand, which itself supports non-React usage. This means you can use Zubridge in any JavaScript environment, regardless of your chosen UI framework.

## Understanding Zubridge

For an in-depth explanation of how Zubridge works under the hood, including the action dispatch flow and state synchronization, see the [How It Works](./how-it-works.md) document.

## Core Setup

Regardless of which state management approach you choose, these setup steps are common to all implementations.

### Build Setup (Optional but Recommended)

We recommend using [electron-vite](https://electron-vite.org/) for building Electron applications. It provides hot module replacement, TypeScript support, and handles the complexities of bundling for multiple Electron processes. For preload scripts, this means you can write code in modern ESM syntax which gets automatically compiled to CommonJS, avoiding Electron's ESM preload limitations. All code examples in this documentation use the same file paths found in the [minimal example apps](https://github.com/goosewobbler/zubridge/tree/main/examples), which are also the default electron-vite file paths.

Configure your `electron.vite.config.ts` to compile preload scripts to CommonJS:

```js
// `electron.vite.config.ts`
export default {
  // ... other config
  preload: {
    build: {
      outDir: 'dist/preload',
      minify: false,
      rollupOptions: {
        external: ['electron'],
        output: {
          format: 'cjs',
          entryFileNames: '[name].cjs',
          chunkFileNames: '[name]-[hash].cjs',
        },
      },
    },
  },
};
```

> **Note**: There are multiple projects named "electron-vite". We specifically recommend [electron-vite by Alex Wei](https://github.com/alex8088/electron-vite) (https://electron-vite.org), which is well-maintained and has excellent support for proper bundling of preload scripts. This is what we use for E2E testing.

### Preload Script

Expose the Zubridge handlers to the renderer process in your preload script:

```ts
// `src/preload/index.ts`
import { contextBridge } from 'electron';
import { preloadBridge } from '@zubridge/electron/preload';

const { handlers } = preloadBridge();

// Expose the handlers to the renderer process
contextBridge.exposeInMainWorld('zubridge', handlers);
```

> **Security Note**: This setup requires `contextIsolation: true` (the default since Electron 12). If you must use `contextIsolation: false` due to legacy constraints, see the [Context Isolation Disabled](#context-isolation-disabled) section below.

### Renderer Process Hooks

In the renderer process, create hooks to access the store and dispatch actions:

```ts
// `src/renderer/hooks/useStore.ts`
import { createUseStore } from '@zubridge/electron';
import type { AppState } from '../../types/index.js';

// Create a hook to access the store
export const useStore = createUseStore<AppState>();
```

Then use these hooks in your components (React example):

```tsx
// `src/renderer/App.tsx`
import { useStore } from './hooks/useStore.js';
import { useDispatch } from '@zubridge/electron';
import type { AppState } from '../types/index.js';

export function App() {
  const counter = useStore((state: AppState) => state.counter);
  const dispatch = useDispatch<AppState>();

  // For enhanced type safety, you can specify action types
  const typedDispatch = useDispatch<AppState, { SET_COUNTER: number }>();

  return (
    <div>
      <p>Counter: {counter}</p>
      <button onClick={() => dispatch('INCREMENT')}>Increment</button>
      <button onClick={() => dispatch('DECREMENT')}>Decrement</button>
      <button onClick={() => dispatch({ type: 'SET_COUNTER', payload: 0 })}>Reset</button>
      {/* Type-checked action dispatch */}
      <button onClick={() => typedDispatch({ type: 'SET_COUNTER', payload: 42 })}>Set to 42 (Type-checked)</button>
    </div>
  );
}
```

If you're using vanilla JavaScript or another framework, you can still use the core functionality:

```js
// Non-React example
const { createUseStore, useDispatch } = window.zubridge;

// Create store hook and dispatcher
const useStore = createUseStore();
const dispatch = useDispatch();

// Get current state and subscribe to changes
function updateUI() {
  const state = useStore.getState();
  document.getElementById('counter').textContent = state.counter;
}

// Initial UI update
updateUI();

// Subscribe to state changes
const unsubscribe = useStore.subscribe(updateUI);

// Add event listeners
document.getElementById('increment-btn').addEventListener('click', () => {
  dispatch('INCREMENT');
});

document.getElementById('decrement-btn').addEventListener('click', () => {
  dispatch('DECREMENT');
});

// Clean up when needed
function cleanup() {
  unsubscribe();
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

In the main process, create the bridge and subscribe your windows:

```ts
// `src/main/index.ts`
import { app, BrowserWindow } from 'electron';
import { createZustandBridge } from '@zubridge/electron/main';
import { store } from './store.js';

// create main window
const mainWindow = new BrowserWindow({
  // ...
  webPreferences: {
    preload: path.join(__dirname, 'path/to/preload/index.cjs'),
    // other options...
  },
});

// instantiate bridge
const bridge = createZustandBridge(store);

// subscribe the window to state updates
const { unsubscribe } = bridge.subscribe([mainWindow]);

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

In the main process, create the bridge and subscribe your windows:

```ts
// `src/main/index.ts`
import { app, BrowserWindow } from 'electron';
import { createReduxBridge } from '@zubridge/electron/main';
import { store } from './store.js';

// create main window
const mainWindow = new BrowserWindow({
  // ...
  webPreferences: {
    preload: path.join(__dirname, 'path/to/preload/index.cjs'),
    // other options...
  },
});

// instantiate bridge
const bridge = createReduxBridge(store);

// subscribe the window to state updates
const { unsubscribe } = bridge.subscribe([mainWindow]);

// you can dispatch actions directly from the main process
bridge.dispatch({ type: 'counter/initialize', payload: 5 });

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
    preload: path.join(__dirname, 'path/to/preload/index.cjs'),
    // other options...
  },
});

// instantiate bridge
const bridge = createCoreBridge(stateManager);

// subscribe the window to state updates
const { unsubscribe } = bridge.subscribe([mainWindow]);

// unsubscribe on quit
app.on('quit', unsubscribe);
```

## Next Steps

Now that you've got the basics set up, you might want to explore:

- [How It Works](./how-it-works.md) - Detailed explanation of how Zubridge manages state synchronization
- [Main Process](./main-process.md) - Detailed guide for using Zubridge in the main process
- [Renderer Process](./renderer-process.md) - Detailed guide for using Zubridge in the renderer process
- [Backend Contract](./backend-contract.md) - Detailed explanation of the backend contract
- [API Reference](./api-reference.md) - Complete reference for all API functions and types

## Example Applications

The [Zubridge Electron Example](https://github.com/goosewobbler/zubridge/tree/main/apps/electron/e2e) demonstrates the different approaches to state management with Zubridge:

- **Basic Mode**: Zustand with direct store mutations using `createZustandBridge`
- **Handlers Mode**: Zustand with dedicated action handler functions using `createZustandBridge`
- **Reducers Mode**: Zustand with Redux-style reducers using `createZustandBridge`
- **Redux Mode**: Redux with Redux Toolkit using `createReduxBridge`
- **Custom Mode**: Custom state manager implementation using `createCoreBridge`

Each example demonstrates the same functionality implemented with different state management patterns, allowing you to compare approaches and choose what works best for your application.

## Context Isolation Disabled

### ⚠️ Security Warning

**We strongly recommend keeping `contextIsolation: true` (the default since Electron 12).** Disabling context isolation removes important security protections and exposes your application to potential security vulnerabilities including:

- **Shared global context** - Websites can directly access powerful preload script APIs
- **XSS to RCE escalation** - Cross-site scripting attacks can escalate to remote code execution
- **Unrestricted IPC access** - Malicious code can send arbitrary IPC messages to the main process
- **Electron internals exposure** - Websites can potentially access Electron's internal APIs

For more details, see [Electron's Context Isolation Documentation](https://www.electronjs.org/docs/latest/tutorial/context-isolation) and [Security Best Practices](https://www.electronjs.org/docs/latest/tutorial/security).

### When You Must Use `contextIsolation: false`

If you absolutely cannot enable context isolation in your application, Zubridge supports this configuration. Use your preload script with direct window assignment:

```typescript
// `src/preload/index.ts`
import { preloadBridge } from '@zubridge/electron/preload';

const { handlers } = preloadBridge();

// With contextIsolation: false, directly assign to window instead of using contextBridge
window.zubridge = handlers;
```

> **Example App**: A complete working example is available at [`apps/electron/minimal-context-isolation-false/`](https://github.com/goosewobbler/zubridge/tree/main/apps/electron/minimal-context-isolation-false). Run `pnpm dev` in that directory to see it in action.

### Limitations with contextIsolation: false

When context isolation is disabled:

- Some internal subscription validation optimizations may not be available
- You lose the security benefits of isolated contexts
- Your application becomes vulnerable to malicious website code

### Migration Path

To properly secure your application, plan to migrate to `contextIsolation: true`:

1. **Audit your renderer code** - Remove any direct Node.js API usage
2. **Use contextBridge** - Expose only necessary APIs through the preload script
3. **Update webPreferences**:
   ```javascript
   webPreferences: {
     contextIsolation: true,  // Enable context isolation
     nodeIntegration: false,  // Disable Node.js in renderer
     preload: path.resolve(__dirname, 'path/to/preload/index.cjs')
   }
   ```
4. **Test thoroughly** - Ensure all functionality works with proper isolation

For migration assistance, see [Electron's Context Isolation Guide](https://www.electronjs.org/docs/latest/tutorial/context-isolation).
