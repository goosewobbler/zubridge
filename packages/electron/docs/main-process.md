# Main Process

This document describes how to set up and use the `@zubridge/electron` package in the main process of your Electron application.

## Bridge Setup Options

Zubridge provides multiple ways to connect your main process state to renderer processes. Choose the approach that best fits your state management solution.

### Option 1: Zustand Integration

For Zustand-based applications (recommended):

```ts
// `src/main/index.ts`
import { app, BrowserWindow } from 'electron';
import { createZustandBridge } from '@zubridge/electron/main';
import { store } from './store.js'; // Your Zustand store

// Create main window
const mainWindow = new BrowserWindow({
  /* config */
});

// Option A: Instantiate bridge with initial window
const { unsubscribe, subscribe, dispatch, getSubscribedWindows } = createZustandBridge(store, [
  mainWindow,
]);

// Option B: Instantiate bridge without windows, subscribe later
const bridge = createZustandBridge(store);
const subscription = bridge.subscribe([mainWindow]);

// Use dispatch to send actions
dispatch('COUNTER:INCREMENT');

// Unsubscribe on quit
app.on('quit', unsubscribe);
```

### Option 2: Redux Integration

For Redux-based applications:

```ts
// `src/main/index.ts`
import { app, BrowserWindow } from 'electron';
import { createReduxBridge } from '@zubridge/electron/main';
import { store } from './redux-store.js'; // Your Redux store

// Create main window
const mainWindow = new BrowserWindow({
  /* config */
});

// Option A: Instantiate bridge with Redux store and initial window
const { unsubscribe, subscribe, dispatch, getSubscribedWindows } = createReduxBridge(store, [
  mainWindow,
]);

// Option B: Instantiate bridge without windows, subscribe later
const bridge = createReduxBridge(store);
const subscription = bridge.subscribe([mainWindow]);

// Use dispatch to send actions
dispatch({ type: 'COUNTER:INCREMENT' });

// Unsubscribe on quit
app.on('quit', unsubscribe);
```

### Option 3: Custom State Managers

For other state management solutions, implement the `StateManager` interface:

```ts
// `src/main/state-adapter.ts`
import { createCoreBridge, createDispatch } from '@zubridge/electron/main';
import { StateManager, Action } from '@zubridge/types';
import { someThirdPartyStateManager } from 'third-party-library';

// Create an adapter for your state solution
function createStateAdapter(): StateManager<MyAppState> {
  const existingStore = someThirdPartyStateManager({
    initialState: { counter: 0 },
    // other configuration...
  });

  return {
    // Map to existing store's state retrieval method
    getState: () => existingStore.getState(),

    // Map to existing store's subscription method
    subscribe: (listener) => {
      return existingStore.subscribe((newState) => listener(newState));
    },

    // Map actions to existing store's dispatch method
    processAction: (action) => {
      existingStore.dispatch(action);
    },
  };
}

// `src/main/index.ts`
import { app, BrowserWindow } from 'electron';
import { createCoreBridge, createDispatch } from '@zubridge/electron/main';
import { createStateAdapter } from './state-adapter.js';

// Create main window
const mainWindow = new BrowserWindow({
  /* config */
});

// Create adapter and connect to bridge
const stateManager = createStateAdapter();

// Option A: Connect bridge with initial window
const bridge = createCoreBridge(stateManager, [mainWindow]);

// Option B: Connect bridge without windows, subscribe later
const bridge = createCoreBridge(stateManager);
const subscription = bridge.subscribe([mainWindow]);

const dispatch = createDispatch(stateManager);

// Use dispatch to send actions
dispatch('COUNTER:INCREMENT');

// Unsubscribe on quit
app.on('quit', bridge.unsubscribe);
```

## Multi-Window Support

All bridge implementations support multiple windows and different types of Electron objects:

```ts
// Create windows
const mainWindow = new BrowserWindow({
  /* config */
});
const secondaryWindow = new BrowserWindow({
  /* config */
});

// Instantiate bridge with multiple windows
const { subscribe, unsubscribe, getSubscribedWindows } = createZustandBridge(store, [
  mainWindow,
  secondaryWindow,
]);

// Later, create a new window or view
const runtimeView = new WebContentsView({
  /* config */
});

// You can use BrowserWindow, BrowserView, WebContentsView, or WebContents directly
const directWebContents = mainWindow.webContents; // Using WebContents directly

// Subscribe the new views to store updates
const subscription = subscribe([runtimeView, directWebContents]);

// When the view is closed, unsubscribe it
runtimeView.webContents.once('destroyed', () => {
  subscription.unsubscribe();
});

// Get all currently subscribed window IDs
const subscribedWindowIds = getSubscribedWindows();
console.log('Currently subscribed windows:', subscribedWindowIds);
```

## Advanced Bridge Options

### Using Separate Handlers with Zustand

```ts
// `src/main/index.ts`
import { createZustandBridge } from '@zubridge/electron/main';
import { store } from './store.js';
import { actionHandlers } from '../features/index.js';

// Create handlers for store
const handlers = actionHandlers(store, initialState);

// Instantiate bridge with handlers
createZustandBridge(store, [mainWindow], { handlers });
```

### Using Redux-Style Reducers with Zustand

```ts
// `src/main/index.ts`
import { createZustandBridge } from '@zubridge/electron/main';
import { store } from './store.js';
import { rootReducer } from '../features/index.js';

// Instantiate bridge with reducer
createZustandBridge(store, [mainWindow], { reducer: rootReducer });
```

## Interacting with State

### Direct Store Access

In the main process, you can access the store directly:

```ts
// `src/main/counter/index.ts`
import { store } from '../store.js';

// Get current state
const { counter } = store.getState();

// Update state (Zustand example)
store.setState({ counter: counter + 1 });
```

### Using the Dispatch Helper

The dispatch helper provides a consistent way to trigger actions regardless of your state management solution:

```ts
// Using dispatch returned from the bridge
import { dispatch } from '../bridge.js';

// String action type
dispatch('COUNTER:INCREMENT');

// String action type with payload
dispatch('COUNTER:SET', 42);

// Action object
dispatch({ type: 'COUNTER:RESET', payload: 0 });
```

### Working with Thunks

Thunks provide a way to implement complex logic, especially for async operations:

```ts
// `src/main/counter/actions.ts`
import { dispatch } from '../bridge.js';

// Simple thunk with conditional logic
const incrementIfLessThan = (max) => (getState, dispatch) => {
  const { counter } = getState();

  if (counter < max) {
    dispatch('COUNTER:INCREMENT');
    return true;
  }
  return false;
};

// Usage
dispatch(incrementIfLessThan(10));
```

#### Async Thunk Example

```ts
// Complex thunk with async operations
export const fetchAndUpdateCounter = () => async (getState, dispatch) => {
  try {
    // Dispatch a loading action
    dispatch('UI:SET_LOADING', true);

    // Perform async operation
    const response = await fetch('https://api.example.com/counter');
    const data = await response.json();

    // Dispatch results
    dispatch('COUNTER:SET', data.value);

    return data.value;
  } catch (error) {
    // Handle errors
    dispatch('ERROR:SET', error.message);
    return null;
  } finally {
    dispatch('UI:SET_LOADING', false);
  }
};

// Usage
dispatch(fetchAndUpdateCounter());
```

### Using Nested Path Resolution for Handlers

Both Zustand and Redux bridges support nested path resolution for action handlers. This allows you to organize your handlers in a hierarchical structure:

```ts
// `src/main/index.ts`
import { createZustandBridge } from '@zubridge/electron/main';
import { store } from './store.js';

// Create hierarchical handlers
const handlers = {
  counter: {
    increment: (payload) => {
      const step = payload?.step || 1;
      store.setState((state) => ({ counter: state.counter + step }));
    },
    decrement: (payload) => {
      const step = payload?.step || 1;
      store.setState((state) => ({ counter: state.counter - step }));
    },
    reset: () => {
      store.setState((state) => ({ counter: 0 }));
    },
  },
  theme: {
    toggle: () => {
      store.setState((state) => ({ isDarkMode: !state.isDarkMode }));
    },
    set: (isDark) => {
      store.setState((state) => ({ isDarkMode: isDark }));
    },
  },
};

// Instantiate bridge with nested handlers
const bridge = createZustandBridge(store, [mainWindow], { handlers });

// Dispatch using dot notation for paths
bridge.dispatch('counter.increment', { step: 5 }); // Calls handlers.counter.increment
bridge.dispatch('theme.toggle'); // Calls handlers.theme.toggle

// Handler lookup is case insensitive
bridge.dispatch('Counter.Increment'); // Still finds handlers.counter.increment

// Standard handler matching is case insensitive
bridge.dispatch('COUNTER:INCREMENT'); // Matches handlers['COUNTER:INCREMENT'] or handlers['counter:increment']
```

## Legacy API Note

Previous versions used `mainZustandBridge` instead of `createZustandBridge`. This function is still available for backward compatibility, but `createZustandBridge` is recommended for new projects.
