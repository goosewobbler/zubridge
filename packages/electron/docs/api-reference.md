# API Reference

This document provides a comprehensive reference for the `@zubridge/electron` API.

## Backend (Main Process) APIs

### Bridge APIs

#### `createCoreBridge(stateManager, options?)`

Creates a core bridge between the main process and renderer processes, using any state manager that implements the `StateManager` interface. This is useful for creating custom bridges with state management libraries not directly supported by Zubridge.

##### Parameters:

- `stateManager`: Implementation of the `StateManager<State>` interface
- `options?`: Optional `CoreBridgeOptions` configuration object (see [CoreBridgeOptions](#corebridgeoptions) for details)

##### Returns:

A `CoreBridge` object with:

- `subscribe(windows)`: Function to subscribe additional windows to the state updates. Returns an object with an `unsubscribe` method.
- `unsubscribe(windows?)`: Function to unsubscribe windows from updates. When called without arguments, unsubscribes all windows.
- `destroy()`: Function to clean up resources used by the bridge.

##### Example:

```ts
import { app, BrowserWindow } from 'electron';
import { createCoreBridge } from '@zubridge/electron/main';
import { myStateManager } from './state-manager';

const mainWindow = new BrowserWindow({
  /* options */
});

// Create bridge with default settings
const bridge = createCoreBridge(myStateManager);

// Or create with custom options
const bridgeWithOptions = createCoreBridge(myStateManager, {
  serialization: {
    maxDepth: 5, // Limit state serialization depth
  },
  onBridgeDestroy: async () => {
    console.log('Bridge destroyed');
  },
});

// Subscribe windows
const subscription = bridge.subscribe([mainWindow]);

// Unsubscribe when quitting
app.on('quit', bridge.unsubscribe);
```

#### `createZustandBridge(store, options?)`

Creates a bridge between a Zustand store in the main process and renderer processes. This is the recommended way to integrate a Zustand store with Electron's IPC system.

##### Parameters:

- `store`: The Zustand store to bridge
- `options?`: Optional configuration object
  - `handlers`: Optional object containing store handler functions
  - `reducer`: Optional root reducer function for Redux-style state management
  - `middleware`: **⚠️ Experimental** - Optional middleware for logging and debugging (not yet released)

##### Returns:

A `ZustandBridge` object with:

- `subscribe(windows)`: Function to subscribe additional windows to the store updates. Returns an object with an `unsubscribe` method.
- `unsubscribe(windows?)`: Function to unsubscribe windows from the store. When called without arguments, unsubscribes all windows.
- `dispatch`: Function to dispatch actions to the store.
- `destroy()`: Function to clean up resources used by the bridge.

##### Example:

```ts
import { app, BrowserWindow } from 'electron';
import { createZustandBridge } from '@zubridge/electron/main';
import { store } from './store';

const mainWindow = new BrowserWindow({
  /* options */
});

// Create bridge
const bridge = createZustandBridge(store);

// Subscribe windows to receive state updates
const { unsubscribe } = bridge.subscribe([mainWindow]);

// Using with handlers option
const bridgeWithHandlers = createZustandBridge(store, {
  handlers: {
    CUSTOM_ACTION: (payload) => {
      console.log('Custom action received:', payload);
      store.setState((state) => ({ ...state, customValue: payload }));
    },
  },
});

// Using with reducer option
const bridgeWithReducer = createZustandBridge(store, {
  reducer: (state, action) => {
    switch (action.type) {
      case 'SET_VALUE':
        return { ...state, value: action.payload };
      default:
        return state;
    }
  },
});

// Dispatch actions from the main process
bridge.dispatch('INCREMENT');

// Unsubscribe when quitting
app.on('quit', unsubscribe);
```

#### `createReduxBridge(store, options?)`

Creates a bridge between a Redux store in the main process and renderer processes. This is the recommended way to integrate a Redux store with Electron's IPC system.

##### Parameters:

- `store`: The Redux store to bridge
- `options?`: Optional configuration object
  - `handlers`: Optional object containing action handler functions
  - `middleware`: **⚠️ Experimental** - Optional middleware for logging and debugging (not yet released)

##### Returns:

A `ReduxBridge` object with:

- `subscribe(windows)`: Function to subscribe additional windows to the store updates. Returns an object with an `unsubscribe` method.
- `unsubscribe(windows?)`: Function to unsubscribe windows from the store. When called without arguments, unsubscribes all windows.
- `dispatch`: Function to dispatch actions to the store.
- `destroy()`: Function to clean up resources used by the bridge.

##### Example:

```ts
import { app, BrowserWindow } from 'electron';
import { createReduxBridge } from '@zubridge/electron/main';
import { store } from './redux-store';

const mainWindow = new BrowserWindow({
  /* options */
});

// Create bridge
const bridge = createReduxBridge(store);

// Subscribe windows to receive state updates
const { unsubscribe } = bridge.subscribe([mainWindow]);

// Dispatch actions from the main process
bridge.dispatch({ type: 'INCREMENT' });

// Unsubscribe when quitting
app.on('quit', unsubscribe);
```

#### `mainZustandBridge(store, windows, options?)` (Deprecated)

**Deprecated:** This is now an alias for `createZustandBridge` and uses the new IPC channels. Please migrate to `createZustandBridge`.

##### Parameters and returns:

Same as `createZustandBridge`.

### Dispatch APIs

#### `createDispatch(store, options?)`

Creates a dispatch function that can be used in the main process to dispatch actions to the store. This function supports both Zustand and Redux stores.

##### Parameters:

- `store`: Either a Zustand store (`StoreApi<State>`) or Redux store (`Store<State>`)
- `options?`: Optional configuration object
  - For Zustand stores: can include `handlers` or `reducer` options
  - For Redux stores: can include Redux-specific integration options

##### Returns:

A function that can dispatch actions to the store. This dispatch function supports:

- String action types with optional payload
- Action objects with type and payload
- Thunk functions for complex logic

##### Example:

```ts
import { createDispatch } from '@zubridge/electron/main';
import { myStore } from './store';

// Create dispatch function
export const dispatch = createDispatch(myStore);

// Use the dispatch function
dispatch('INCREMENT');

// Dispatch with a payload
dispatch('SET_VALUE', 42);

// Dispatch an action object
dispatch({ type: 'SET_VALUE', payload: 42 });

// Dispatch a thunk function
dispatch((getState, dispatch) => {
  const currentState = getState();
  if (currentState.counter < 10) {
    dispatch('INCREMENT');
  }
});
```

##### Internal API: createDispatch with StateManager

There's also an internal overload that accepts a state manager directly, but this is primarily for internal use by bridge implementations.

## Frontend (Renderer Process) APIs

### Preload Script APIs

#### `preloadBridge()`

Creates handlers for the renderer process to interact with the main process through the backend contract.

##### Returns:

An object with a `handlers` property that should be exposed to the renderer process.

##### Example:

```ts
// preload.js
import { contextBridge } from 'electron';
import { preloadBridge } from '@zubridge/electron/preload';

const { handlers } = preloadBridge();

// Expose the handlers to the renderer process
contextBridge.exposeInMainWorld('zubridge', handlers);
```

#### `preloadZustandBridge()` (Deprecated)

**Deprecated:** This is now an alias for `preloadBridge` and uses the new IPC channels. Please migrate to `preloadBridge`.

##### Returns:

Same as `preloadBridge`.

### Renderer Process Hooks

#### `createUseStore<State>(customHandlers?)`

Function that creates a hook to access the store state in the renderer process.

##### Parameters:

- `customHandlers`: Optional custom handlers to use instead of `window.zubridge`
- `State`: Type parameter representing your application state

##### Returns:

A hook that can be used to select state from the store.

##### Example:

```ts
// hooks/useStore.ts
import { createUseStore } from '@zubridge/electron';
import type { AppState } from '../types';

export const useStore = createUseStore<AppState>();

// Component.tsx
import { useStore } from './hooks/useStore';

function Counter() {
  const counter = useStore(state => state.counter);
  return <div>{counter}</div>;
}
```

#### `useDispatch<State>(customHandlers?)`

Hook to dispatch actions to the store from the renderer process.

##### Parameters:

- `customHandlers`: Optional custom handlers to use instead of `window.zubridge`
- `State`: Type parameter representing your application state
- `ActionTypes`: Optional generic type parameter for typed action objects

##### Returns:

A dispatch function that can be used to send actions to the main process.

##### Example:

```ts
import { useDispatch } from '@zubridge/electron';
import type { AppState } from '../types';

function Counter() {
  const dispatch = useDispatch<AppState>();

  // Dispatch a string action
  const handleIncrement = () => dispatch('INCREMENT');

  // Dispatch an action with payload
  const handleSetCounter = (value) => dispatch('SET_COUNTER', value);

  // Dispatch an action object
  const handleCustomIncrement = (amount) => dispatch({
    type: 'INCREMENT_BY',
    payload: amount
  });

  // Dispatch with typed actions
  const typedDispatch = useDispatch<AppState, { 'SET_COUNTER': number }>();
  const handleTypedSetCounter = (value: number) => typedDispatch({
    type: 'SET_COUNTER',
    payload: value // Type checked to be a number
  });

  // Dispatch a thunk for complex logic
  const handleFetchAndUpdate = () => dispatch(async (getState, dispatch) => {
    const response = await fetch('/api/counter');
    const data = await response.json();
    dispatch('SET_COUNTER', data.value);
  });

  // Dispatch with options to bypass thunk locking
  const handleUrgentAction = () => dispatch('URGENT_ACTION', null, {
    bypassThunkLock: true
  });

  // Dispatch with selective subscription keys
  const handlePrivateAction = () => dispatch('PRIVATE_UPDATE', { data: 'secret' }, {
    keys: ['admin', 'private']
  });

  return (
    <div>
      <button onClick={handleIncrement}>+1</button>
      <button onClick={() => handleSetCounter(0)}>Reset</button>
      <button onClick={() => handleCustomIncrement(5)}>+5</button>
      <button onClick={() => handleTypedSetCounter(10)}>Set to 10 (Typed)</button>
      <button onClick={handleFetchAndUpdate}>Fetch</button>
      <button onClick={handleUrgentAction}>Urgent Action</button>
      <button onClick={handlePrivateAction}>Private Action</button>
    </div>
  );
}
```

## Type Definitions and Interfaces

### `StateManager<State>`

Interface that defines the contract for state managers used with the bridge. Any state management solution can be integrated with the bridge system by implementing this interface.

```ts
interface StateManager<State> {
  getState: () => State;
  subscribe: (listener: (state: State) => void) => () => void;
  processAction: (action: Action) => void;
}
```

### `CoreBridge`

Interface for the bridge created by `createCoreBridge`.

```ts
interface CoreBridge extends BaseBridge {
  subscribe: (wrappers: WebContentsWrapper[]) => { unsubscribe: () => void };
  unsubscribe: (wrappers?: WebContentsWrapper[]) => void;
  destroy: () => void;
}
```

### `ZustandBridge`

Interface for the bridge created by `createZustandBridge`.

```ts
interface ZustandBridge extends BackendBridge {
  subscribe: (windows: WrapperOrWebContents[]) => { unsubscribe: () => void };
  unsubscribe: (windows?: WrapperOrWebContents[]) => void;
  dispatch: Dispatch<S>;
  destroy: () => void;
}
```

### `ReduxBridge`

Interface for the bridge created by `createReduxBridge`.

```ts
interface ReduxBridge extends BackendBridge {
  subscribe: (windows: WrapperOrWebContents[]) => { unsubscribe: () => void };
  unsubscribe: (windows?: WrapperOrWebContents[]) => void;
  dispatch: Dispatch<S>;
  destroy: () => void;
}
```

### `BaseBridge`

Base interface that all bridge implementations extend.

```ts
interface BaseBridge {
  unsubscribe: (...args: any[]) => void;
}
```

### `Action`

Represents a Redux-style action with a type and optional payload.

```ts
type Action<T extends string = string> = {
  type: T;
  payload: unknown;
};
```

### `Thunk<State>`

Represents a thunk function for handling asynchronous logic.

```ts
type Thunk<State> = (getState: StoreApi<State>['getState'], dispatch: Dispatch<State>) => void;
```

### `DispatchOptions`

Options that can be passed to dispatch functions to control execution behavior.

```ts
type DispatchOptions = {
  keys?: string[];                  // Selective subscription keys
  bypassAccessControl?: boolean;    // Skip access control checks
  bypassThunkLock?: boolean;        // Skip thunk locking mechanism
};
```

These options allow for advanced control over action dispatch:

- `keys`: When provided, only subscribers with matching keys will receive state updates
- `bypassAccessControl`: Allows actions to bypass normal access control restrictions
- `bypassThunkLock`: Allows actions to execute even when thunks are currently running, bypassing the normal action sequencing

### `CoreBridgeOptions`

Configuration options for the core bridge created with `createCoreBridge`.

```ts
interface CoreBridgeOptions {
  // Middleware
  middleware?: ZubridgeMiddleware;

  // Lifecycle hooks
  onBridgeDestroy?: () => Promise<void> | void;

  // Resource management
  resourceManagement?: {
    enablePeriodicCleanup?: boolean;    // Enable periodic cleanup (default: true)
    cleanupIntervalMs?: number;         // Cleanup interval in ms (default: 600000 = 10 minutes)
    maxSubscriptionManagers?: number;   // Max managers before forcing cleanup (default: 1000)
  };

  // Serialization
  serialization?: {
    maxDepth?: number;                  // Maximum depth for state serialization (default: 10)
  };
}
```

**Serialization:**

- `maxDepth`: Controls how deep the state serialization will traverse object hierarchies. This prevents stack overflow errors and controls payload size when dealing with deeply nested state. The default is 10 levels. When the maximum depth is exceeded, the value is replaced with a string indicating truncation.

  ```ts
  // Example: Limit serialization to 5 levels deep
  const bridge = createCoreBridge(stateManager, {
    serialization: {
      maxDepth: 5
    }
  });
  ```

**Resource Management:**

- `enablePeriodicCleanup`: Automatically clean up subscription managers for destroyed windows (default: true)
- `cleanupIntervalMs`: How often to run cleanup in milliseconds (default: 600000 = 10 minutes)
- `maxSubscriptionManagers`: Force cleanup when this many managers exist (default: 1000)

**Middleware:**

- `middleware`: **⚠️ Experimental** - Zubridge middleware for tracking actions and state updates. The `@zubridge/middleware` package is not yet released and will be rewritten in the UniFFI rewrite. This API may change.

**Lifecycle Hooks:**

- `onBridgeDestroy`: Called **before** cleanup when `bridge.destroy()` is invoked. This allows you to access final state or perform coordinated shutdown tasks before resources are cleaned up.

  ```ts
  const bridge = createCoreBridge(stateManager, {
    onBridgeDestroy: async () => {
      // Save final state before cleanup
      const finalState = stateManager.getState();
      await saveStateToFile(finalState);

      // Perform any cleanup tasks
      console.log('Bridge is shutting down');
    }
  });
  ```

### `ZustandOptions<State>`

Configuration options for the Zustand bridge.

```ts
type ZustandOptions<State extends AnyState> = {
  handlers?: Record<string, Handler>;
  reducer?: RootReducer<State>;
};
```

### `ReduxOptions<State>`

Configuration options for the Redux bridge.

```ts
type ReduxOptions<State extends AnyState> = {
  // Custom options for Redux integration
};
```

### `WebContentsWrapper`

Represents any Electron object that has WebContents. This includes BrowserWindow, BrowserView, and WebContentsView.

```ts
type WrapperOrWebContents = WebContents | { webContents: WebContents; isDestroyed?: () => boolean };
```

### `Handlers<State>`

Interface for the handlers exposed to the renderer process.

```ts
interface Handlers<State extends AnyState> extends BaseHandler<State> {
  getState(): Promise<State>;
  subscribe(callback: (newState: State) => void): () => void;
}
```
