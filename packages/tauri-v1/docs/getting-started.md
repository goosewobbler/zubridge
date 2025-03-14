## Getting Started

Install Zubridge and peer dependencies:

```bash
npm i @zubridge/tauri-v1 zustand @tauri-apps/api@^1.0.0
```

Or use your dependency manager of choice, e.g. `pnpm`, `yarn`.

The code fragments in this documentation are based on the minimal working (TypeScript) examples found in the [apps directory](../apps).

#### Create Store

First, create the Zustand store for your application using `zustand/vanilla` in the main process (Rust backend). If you are using TS, provide your application state type:

```ts annotate
// `src/lib/store.ts`
import { createStore } from 'zustand/vanilla';
import type { AppState } from '../features/index.js';

const initialState: AppState = {
  counter: 0,
  ui: { ... }
};

// create app store
export const store = createStore<AppState>()(() => initialState);
```

#### Configure Tauri Commands

In your Rust backend, you'll need to register the Zubridge commands:

```rust
// `src-tauri/src/main.rs`
use tauri::Manager;
use zubridge_tauri_v1::{commands, ZubridgeState};
use std::sync::Mutex;

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            // Create initial state
            let initial_state = serde_json::json!({ "counter": 0 });
            app.manage(Mutex::new(initial_state.clone()));
            let _ = app.emit_all("@zubridge/tauri:state-update", initial_state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_state,
            commands::set_state,
            commands::update_state,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

#### Initialize Bridge in Main Process

In your main process TypeScript code, initialize the bridge with your store and reducer/handlers:

```ts annotate
// `src/main/store.ts`
import { createStore } from 'zustand/vanilla';
import { mainZustandBridge } from '@zubridge/tauri-v1/main';
import { emit } from '@tauri-apps/api/event';
import { rootReducer, type State } from '../features/index.js';

const initialState: State = {
  counter: 0,
};

// Create the store
export const store = createStore<State>()(() => initialState);

// Initialize the bridge
const bridgePromise = mainZustandBridge(store, {
  reducer: rootReducer,
});

// Wait for bridge to be ready
export const initBridge = async () => {
  try {
    await bridgePromise;
    // Emit bridge ready event
    await emit('@zubridge/tauri:bridge-ready');
  } catch (err) {
    console.error('Bridge failed:', err);
    throw err;
  }
};
```

Then initialize the bridge when your app starts:

```ts annotate
// `src/main/index.ts`
import { initBridge } from './store.js';

initBridge().catch((err) => {
  console.error('Bridge initialization failed:', err);
});
```

#### Instantiate Bridge in Frontend

In your frontend code, instantiate the bridge with your store configuration:

```ts annotate
// `src/lib/bridge.ts`
import { frontendZustandBridge } from '@zubridge/tauri-v1';
import type { AppState } from '../features/index.js';

export const { useStore, dispatch } = frontendZustandBridge<AppState>();
```

By default, the bridge assumes your store handler functions are located on the store object.

If you keep your store handler functions separate, you'll need to pass them in as an option:

```ts annotate
// `src/lib/bridge.ts`
import { frontendZustandBridge } from '@zubridge/tauri-v1';
import { actionHandlers } from '../features/index.js';

export const { useStore, dispatch } = frontendZustandBridge<AppState>({
  handlers: actionHandlers,
});
```

Alternatively, if you are using Redux-style reducers, you should pass in the root reducer:

```ts annotate
// `src/features/index.ts`
import type { Reducer } from '@zubridge/tauri-v1';
import { counterReducer } from '../features/counter/index.js';
import { uiReducer } from '../features/ui/index.js';

export type AppState = {
  counter: number
  ui: { ... }
};

// create root reducer
export const rootReducer: Reducer<AppState> = (state, action) => ({
  counter: counterReducer(state.counter, action),
  ui: uiReducer(state.ui, action)
});
```

```ts annotate
// `src/lib/bridge.ts`
import { frontendZustandBridge } from '@zubridge/tauri-v1';
import { rootReducer } from '../features/index.js';

export const { useStore, dispatch } = frontendZustandBridge<AppState>({
  reducer: rootReducer,
});
```

You should now be ready to start using Zubridge. See the below pages for how to access the store and dispatch actions in the different processes:

[Usage - Backend process](./usage-backend-process.md)
[Usage - Frontend process](./usage-frontend-process.md)
