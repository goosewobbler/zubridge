<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/goosewobbler/zubridge/main/resources/zubridge-hero.png">
  <source media="(prefers-color-scheme: light)" srcset="https://raw.githubusercontent.com/goosewobbler/zubridge/main/resources/zubridge-hero.png">
  <img alt="zubridge hero image" src="https://raw.githubusercontent.com/goosewobbler/zubridge/main/resources/zubridge-hero.png" style="max-height: 415px;">
</picture>

<h1 align="center" style="display:none;" id="fallback-title">Zubridge Tauri Plugin</h1>
<script>
  document.addEventListener('DOMContentLoaded', function() {
    var img = document.querySelector('picture img');
    img.onerror = function() {
      this.style.display = 'none';
      document.getElementById('fallback-title').style.display = 'block';
    };
  });
</script>

_Cross-platform state without boundaries: The official Tauri plugin for Zubridge_

<a href="https://crates.io/crates/tauri-plugin-zubridge" alt="Crates.io Version">
  <img src="https://img.shields.io/crates/v/tauri-plugin-zubridge" /></a>
<a href="https://crates.io/crates/tauri-plugin-zubridge" alt="Crates.io Downloads">
  <img src="https://img.shields.io/crates/dr/tauri-plugin-zubridge" /></a>

## Why Zubridge?

> tldr: I want to seamlessly interact with my Rust backend state using Zustand-inspired hooks.

Managing state between a Tauri backend and frontend requires implementing event listeners and command handlers. The `tauri-plugin-zubridge` plugin eliminates this boilerplate by providing a standardized approach for state management that works with the `@zubridge/tauri` frontend library.

## How It Works

Zubridge creates a bridge between your Rust backend state and your frontend JavaScript. Your Rust backend holds the source of truth, while the frontend uses hooks to access and update this state.

1. **Backend**: Register the plugin with your app state
2. **Backend**: Use the StateManager trait to handle state changes
3. **Frontend**: Initialize the bridge with `@zubridge/tauri`
4. **Frontend**: Access state with `useZubridgeStore` and dispatch actions with `useZubridgeDispatch`

## Features

- **Simple State Management**: Manages synchronization between Rust backend and JavaScript frontend
- **Standard Interface**: Provides a consistent pattern for dispatching actions and receiving updates
- **Type Safety**: Strong typing for both Rust and TypeScript sides
- **Multi-Window Support**: Automatically broadcasts state changes to all windows
- **Minimal Boilerplate**: Reduces the amount of code needed for state management
- **Flexible Implementation**: Use with any frontend framework (React, Vue, Svelte, etc.)

## Installation

### Cargo.toml

```toml
[dependencies]
tauri-plugin-zubridge = "0.1.0"
serde = { version = "1.0", features = ["derive"] }
```

### Frontend

```bash
npm install @zubridge/tauri @tauri-apps/api
```

Or use your dependency manager of choice, e.g. `pnpm`, `yarn`.

## Quick Start

### Rust Backend

```rust
use serde::{Deserialize, Serialize};
use tauri::{plugin::TauriPlugin, AppHandle, Runtime};
use tauri_plugin_zubridge::{StateManager, ZubridgePlugin};

// 1. Define your state
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct AppState {
    counter: i32,
}

impl Default for AppState {
    fn default() -> Self {
        Self { counter: 0 }
    }
}

// 2. Implement StateManager for your state
struct AppStateManager {
    state: std::sync::Mutex<AppState>,
}

impl StateManager for AppStateManager {
    // Get the current state
    fn get_state(&self) -> serde_json::Value {
        let state = self.state.lock().unwrap();
        serde_json::to_value(&*state).unwrap()
    }

    // Process actions dispatched from the frontend
    fn process_action(&self, action: &ZubridgeAction) -> Result<(), String> {
        let mut state = self.state.lock().unwrap();

        match action.action_type.as_str() {
            "INCREMENT" => {
                state.counter += 1;
                Ok(())
            },
            "DECREMENT" => {
                state.counter -= 1;
                Ok(())
            },
            _ => Err(format!("Unknown action: {}", action.action_type)),
        }
    }
}

// 3. Create a plugin function
pub fn zubridge<R: Runtime>() -> TauriPlugin<R> {
    let state_manager = AppStateManager {
        state: std::sync::Mutex::new(AppState::default()),
    };

    ZubridgePlugin::new(state_manager)
}

// 4. Register the plugin in your main.rs
fn main() {
    tauri::Builder::default()
        .plugin(zubridge())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

### Frontend

```tsx
// main.tsx
import { initializeBridge } from '@zubridge/tauri';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

// Initialize the bridge
initializeBridge({ invoke, listen });

// Component.tsx
import { useZubridgeStore, useZubridgeDispatch } from '@zubridge/tauri';

function Counter() {
  // Get state from the bridge
  const counter = useZubridgeStore((state) => state.counter);

  // Get dispatch function
  const dispatch = useZubridgeDispatch();

  return (
    <div>
      <h1>Counter: {counter}</h1>
      <button onClick={() => dispatch({ type: 'INCREMENT' })}>+</button>
      <button onClick={() => dispatch({ type: 'DECREMENT' })}>-</button>
    </div>
  );
}
```

## Documentation

For more detailed documentation, see:

- [Plugin API Reference](https://github.com/goosewobbler/zubridge/blob/main/packages/tauri-plugin-zubridge/README.md)
- [Frontend API Reference](https://github.com/goosewobbler/zubridge/blob/main/packages/tauri/docs/api-reference.md)
- [Getting Started Guide](https://github.com/goosewobbler/zubridge/blob/main/packages/tauri/docs/getting-started.md)
- [Backend Contract](https://github.com/goosewobbler/zubridge/blob/main/packages/tauri/docs/backend-process.md)

## Example Application

A complete example application demonstrating the use of `tauri-plugin-zubridge` with a simple counter state:

- [Tauri Example App](https://github.com/goosewobbler/zubridge/tree/main/apps/tauri/e2e)

## Plugin Architecture

<img alt="zubridge tauri plugin architecture" src="https://raw.githubusercontent.com/goosewobbler/zubridge/main/resources/zubridge-tauri-plugin-architecture.png"/>

## License

MIT
