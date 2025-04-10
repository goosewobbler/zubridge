# Main Process

This document describes how to set up and use the `@zubridge/electron` package in the main process of your Electron application.

## Bridge Setup

### Basic Setup

In the main process, instantiate the bridge with your store and an array of window or view objects:

```ts
// `src/main/index.ts`
import { app, BrowserWindow } from 'electron';
import { mainZustandBridge } from '@zubridge/electron/main';
import { store } from './store.js';

// create main window
const mainWindow = new BrowserWindow({ ... });

// instantiate bridge
const { unsubscribe, subscribe, getSubscribedWindows } = mainZustandBridge(store, [mainWindow]);

// unsubscribe on quit
app.on('quit', unsubscribe);
```

### Multi-Window Support

For applications with multiple windows, you can:

```ts
// `src/main/index.ts`
import { app, BrowserWindow, WebContentsView } from 'electron';
import { mainZustandBridge } from '@zubridge/electron/main';
import { store } from './store.js';

// create windows
const mainWindow = new BrowserWindow({ ... });
const secondaryWindow = new BrowserWindow({ ... });

// instantiate bridge with multiple windows
const { unsubscribe, subscribe } = mainZustandBridge(store, [mainWindow, secondaryWindow]);

// unsubscribe all windows on quit
app.on('quit', unsubscribe);

// Later, create a new window or view
const runtimeView = new WebContentsView({ ... });

// subscribe the new view to store updates
const subscription = subscribe([runtimeView]);

// When the view is closed, unsubscribe it
runtimeView.webContents.once('destroyed', () => {
  subscription.unsubscribe();
});

// You can also get all currently subscribed window IDs
const subscribedWindowIds = getSubscribedWindows();
console.log('Currently subscribed windows:', subscribedWindowIds);
```

### Advanced Bridge Options

#### Using Separate Handlers

By default, the main process bridge assumes your store handler functions are located on the store object. If you keep your store handler functions separate from the store, you'll need to pass them in as an option:

```ts
// `src/main/index.ts`
import { mainZustandBridge } from '@zubridge/electron/main';
import { store } from './store.js';
import { actionHandlers } from '../features/index.js';

// create handlers for store
const handlers = actionHandlers(store, initialState);

// instantiate bridge with handlers
const { unsubscribe } = mainZustandBridge(store, [mainWindow], { handlers });
```

#### Using Redux-Style Reducers

If you are using Redux-style reducers, you should pass in the root reducer:

```ts
// `src/main/index.ts`
import { mainZustandBridge } from '@zubridge/electron/main';
import { store } from './store.js';
import { rootReducer } from '../features/index.js';

// instantiate bridge with reducer
const { unsubscribe } = mainZustandBridge(store, [mainWindow], { reducer: rootReducer });
```

## Accessing the Store

In the main process, you can access the store object directly. Any updates you make will be propagated to the renderer process of any subscribed window or view:

```ts
// `src/main/counter/index.ts`
import { store } from '../store.js';

// get current state
const { counter } = store.getState();

// update state
store.setState({ counter: counter + 1 });
```

## Using the Dispatch Helper

There is a dispatch helper which mirrors the functionality of the renderer process `useDispatch` hook:

```ts
// `src/main/dispatch.ts`
import { createDispatch } from '@zubridge/electron/main';
import { store } from './store.js';

export const dispatch = createDispatch(store);
```

You can then use this dispatch function to trigger actions:

```ts
// `src/main/counter/index.ts`
import { dispatch } from '../dispatch.js';

// dispatch string action
dispatch('COUNTER:INCREMENT');

// dispatch action with payload
dispatch('SET_VALUE', 42);

// dispatch action object
dispatch({ type: 'SET_VALUE', payload: 42 });

// dispatch thunk
const onIncrementThunk = (getState, dispatch) => {
  const { counter } = getState();

  if (counter < 10) {
    dispatch('COUNTER:INCREMENT');
  }
};

dispatch(onIncrementThunk);
```

### Configuring the Dispatch Helper

Just like with the bridge, you can configure the dispatch helper with handlers or a reducer:

```ts
// `src/main/dispatch.ts`
import { createDispatch } from '@zubridge/electron/main';
import { store } from './store.js';
import { actionHandlers } from '../features/index.js';

// With separate handlers
export const dispatch = createDispatch(store, { handlers: actionHandlers(store, initialState) });

// OR with a reducer
import { rootReducer } from '../features/index.js';
export const dispatch = createDispatch(store, { reducer: rootReducer });
```
