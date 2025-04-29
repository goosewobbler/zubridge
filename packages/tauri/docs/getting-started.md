# Getting Started with @zubridge/tauri

This guide will walk you through setting up Zubridge in your Tauri application using the official `tauri-plugin-zubridge` plugin.

## Installation

### 1. Backend (Rust)

Add the plugin to your `Cargo.toml`:

```toml
[dependencies]
tauri-plugin-zubridge = "0.1.0"
serde = { version = "1.0", features = ["derive"] }
```

### 2. Frontend (JavaScript/TypeScript)

Install the frontend library and its peer dependencies:

```bash
# Using npm
npm install @zubridge/tauri zustand @tauri-apps/api

# Using yarn
yarn add @zubridge/tauri zustand @tauri-apps/api

# Using pnpm
pnpm add @zubridge/tauri zustand @tauri-apps/api
```

## Core Concepts

Zubridge connects your Tauri Rust backend with your frontend using a plugin-based architecture:

1. **Rust Backend State**: Your application's authoritative state lives in your Rust backend, managed by the plugin.
2. **StateManager**: You implement this trait to define how state is managed and actions are processed.
3. **Frontend Hooks**: Access state with `useZubridgeStore` and dispatch actions with `useZubridgeDispatch`.
4. **Automatic Synchronization**: The plugin handles all the communication between frontend and backend.

## Step-by-Step Setup

### 1. Define Your State in Rust

First, define your application state structure:

```rust
use serde::{Deserialize, Serialize};

// Your application state
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct AppState {
    counter: i32,
    theme: ThemeState,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ThemeState {
    is_dark: bool,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            counter: 0,
            theme: ThemeState { is_dark: false },
        }
    }
}
```

### 2. Implement the StateManager Trait

Create a struct that will manage your state and implement the `StateManager` trait:

```rust
use std::sync::Mutex;
use tauri_plugin_zubridge::{StateManager, ZubridgeAction};

struct AppStateManager {
    state: Mutex<AppState>,
}

impl AppStateManager {
    fn new() -> Self {
        Self {
            state: Mutex::new(AppState::default()),
        }
    }
}

impl StateManager for AppStateManager {
    // Return the current state
    fn get_state(&self) -> serde_json::Value {
        let state = self.state.lock().unwrap();
        serde_json::to_value(&*state).unwrap()
    }

    // Process actions from the frontend
    fn process_action(&self, action: &ZubridgeAction) -> Result<(), String> {
        let mut state = self.state.lock().unwrap();

        match action.action_type.as_str() {
            "INCREMENT" => {
                state.counter += 1;
                println!("Counter incremented to {}", state.counter);
                Ok(())
            },
            "DECREMENT" => {
                state.counter -= 1;
                println!("Counter decremented to {}", state.counter);
                Ok(())
            },
            "THEME:TOGGLE" => {
                state.theme.is_dark = !state.theme.is_dark;
                println!("Theme toggled to {}", if state.theme.is_dark { "dark" } else { "light" });
                Ok(())
            },
            _ => Err(format!("Unknown action: {}", action.action_type)),
        }
    }
}
```

### 3. Create and Register the Plugin

Create a function to instantiate the plugin and register it with your Tauri application:

```rust
use tauri::{plugin::TauriPlugin, Runtime};
use tauri_plugin_zubridge::ZubridgePlugin;

// Create a plugin setup function
pub fn zubridge<R: Runtime>() -> TauriPlugin<R> {
    let state_manager = AppStateManager::new();
    ZubridgePlugin::new(state_manager)
}

// In main.rs
fn main() {
    tauri::Builder::default()
        .plugin(zubridge())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

### 4. Initialize the Bridge in Frontend

At the root of your application, initialize the bridge with Tauri's `invoke` and `listen` functions:

```tsx
// main.tsx (React example)
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { initializeBridge } from '@zubridge/tauri';
import { invoke } from '@tauri-apps/api/core'; // For Tauri v2
import { listen } from '@tauri-apps/api/event';
// For Tauri v1, use:
// import { invoke } from '@tauri-apps/api/tauri';
// import { listen } from '@tauri-apps/api/event';

// Initialize Zubridge once before rendering
initializeBridge({ invoke, listen });

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

### 5. Use the Hooks in Your Components

Now you can use the hooks to access state and dispatch actions:

```tsx
// Counter.tsx
import React from 'react';
import { useZubridgeStore, useZubridgeDispatch } from '@zubridge/tauri';

function Counter() {
  // Access state with a selector
  const counter = useZubridgeStore((state) => state.counter);
  const isDark = useZubridgeStore((state) => state.theme.is_dark);

  // Get bridge status
  const status = useZubridgeStore((state) => state.__bridge_status);

  // Get dispatch function
  const dispatch = useZubridgeDispatch();

  if (status !== 'ready') {
    return <div>Loading...</div>;
  }

  return (
    <div className={isDark ? 'dark-theme' : 'light-theme'}>
      <h1>Counter: {counter}</h1>
      <button onClick={() => dispatch({ type: 'INCREMENT' })}>+</button>
      <button onClick={() => dispatch({ type: 'DECREMENT' })}>-</button>
      <button onClick={() => dispatch({ type: 'THEME:TOGGLE' })}>Toggle Theme ({isDark ? 'Dark' : 'Light'})</button>
    </div>
  );
}

export default Counter;
```

## Framework Compatibility

Despite the `use` prefix in hook names, Zubridge works with any JavaScript framework:

### React

```tsx
import { useZubridgeStore, useZubridgeDispatch } from '@zubridge/tauri';

function Counter() {
  const counter = useZubridgeStore((state) => state.counter);
  const dispatch = useZubridgeDispatch();

  return (
    <div>
      <h1>Counter: {counter}</h1>
      <button onClick={() => dispatch({ type: 'INCREMENT' })}>+</button>
    </div>
  );
}
```

### Vue

```vue
<script setup>
import { computed, onMounted } from 'vue';
import { useZubridgeStore, useZubridgeDispatch } from '@zubridge/tauri';

const counter = computed(() => useZubridgeStore((state) => state.counter));
const dispatch = useZubridgeDispatch();

const increment = () => dispatch({ type: 'INCREMENT' });
</script>

<template>
  <div>
    <h1>Counter: {{ counter }}</h1>
    <button @click="increment">+</button>
  </div>
</template>
```

### Vanilla JavaScript

```javascript
import { useZubridgeStore, useZubridgeDispatch } from '@zubridge/tauri';

// Get initial state
const counterElement = document.getElementById('counter');
const updateUI = () => {
  const counter = useZubridgeStore.getState().counter;
  counterElement.textContent = counter;
};

// Subscribe to changes
const unsubscribe = useZubridgeStore.subscribe(updateUI);

// Setup action handlers
const dispatch = useZubridgeDispatch();
document.getElementById('increment').addEventListener('click', () => {
  dispatch({ type: 'INCREMENT' });
});

// Clean up on page unload
window.addEventListener('beforeunload', () => {
  unsubscribe();
});
```

## Next Steps

- Check out the [API Reference](./api-reference.md) for detailed documentation
- Learn about [Backend Contract](./backend-process.md) for advanced customization
- See a complete example in the [Tauri Example App](https://github.com/goosewobbler/zubridge/tree/main/apps/tauri-example)
