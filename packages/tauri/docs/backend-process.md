# Zubridge Backend Process

This document explains how the Zubridge backend process works with the Tauri plugin, and details the underlying contract between your backend and frontend.

## Overview

Zubridge works through a well-defined contract between your frontend and Rust backend. While the `tauri-plugin-zubridge` plugin handles most of the implementation details, understanding the underlying contract can help with debugging and custom implementations.

## How the Plugin Works

The `tauri-plugin-zubridge` plugin:

1. Implements the `StateManager` trait you provide
2. Creates the necessary Tauri commands and event handlers automatically
3. Manages state updates and broadcasts them to all windows
4. Handles action dispatch and processing

## The Contract

Under the hood, the plugin implements the following contract:

### Commands

1. **`__zubridge_get_initial_state`**: Returns the complete current state of your application

   - Called when the frontend initializes
   - Returns a JSON serializable object representing your state

2. **`__zubridge_dispatch_action`**: Processes actions dispatched from the frontend
   - Takes a `ZubridgeAction` object with `type` and optional `payload` fields
   - Updates the state according to the action
   - Emits a state update event after processing

### Events

1. **`__zubridge_state_update`**: Emitted whenever the state changes
   - Contains the complete updated state as payload
   - Broadcast to all windows

## Custom Implementation

If you prefer not to use the plugin, you can implement this contract directly in your Tauri application. Here's an example of what that would look like:

```rust
use tauri::{State, Manager};
use std::sync::Mutex;
use serde::{Serialize, Deserialize};
use serde_json::Value;

// Your state structure
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct AppState {
    counter: i32,
}

impl Default for AppState {
    fn default() -> Self {
        Self { counter: 0 }
    }
}

// Managed state wrapper
pub struct ManagedAppState(pub Mutex<AppState>);

// Action structure
#[derive(Deserialize, Debug)]
pub struct ZubridgeAction {
    #[serde(rename = "type")]
    action_type: String,
    payload: Option<Value>,
}

// Command to get initial state
#[tauri::command]
fn __zubridge_get_initial_state(state: State<'_, ManagedAppState>) -> Result<AppState, String> {
    state.0.lock()
        .map(|locked_state| locked_state.clone())
        .map_err(|e| format!("Failed to lock state mutex: {}", e))
}

// Command to handle actions
#[tauri::command]
fn __zubridge_dispatch_action(
    action: ZubridgeAction,
    state: State<'_, ManagedAppState>,
    app_handle: tauri::AppHandle
) -> Result<(), String> {
    let mut locked_state = state.0.lock()
        .map_err(|e| format!("Failed to lock state mutex: {}", e))?;

    // Process the action
    match action.action_type.as_str() {
        "INCREMENT" => {
            locked_state.counter += 1;
        },
        "DECREMENT" => {
            locked_state.counter -= 1;
        },
        _ => return Err(format!("Unknown action: {}", action.action_type)),
    }

    // Clone the state for emission
    let updated_state = locked_state.clone();

    // Release the lock before emitting
    drop(locked_state);

    // Emit state update event
    if let Err(e) = app_handle.emit_all("__zubridge_state_update", updated_state) {
        eprintln!("Error emitting state update: {}", e);
    }

    Ok(())
}

// Register in main.rs
fn main() {
    tauri::Builder::default()
        .manage(ManagedAppState(Mutex::new(AppState::default())))
        .invoke_handler(tauri::generate_handler![
            __zubridge_get_initial_state,
            __zubridge_dispatch_action,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

## Best Practices

Whether you use the plugin or implement the contract directly, follow these practices:

1. **Emit state updates consistently**: Always emit a state update event after any state change, regardless of how it was triggered.

2. **Use atomic state updates**: Make sure your state updates are atomic - don't emit partial updates.

3. **Release locks before emitting**: Always release mutex locks before emitting events to avoid deadlocks.

4. **Validate actions**: Validate incoming actions and their payloads to prevent undefined behavior.

5. **Handle errors gracefully**: Return descriptive error messages when action processing fails.

## Plugin vs. Direct Implementation

### Using the Plugin (Recommended)

```rust
use tauri_plugin_zubridge::{StateManager, ZubridgePlugin, ZubridgeAction};
use std::sync::Mutex;

struct AppStateManager {
    state: Mutex<AppState>,
}

impl StateManager for AppStateManager {
    fn get_state(&self) -> serde_json::Value {
        let state = self.state.lock().unwrap();
        serde_json::to_value(&*state).unwrap()
    }

    fn process_action(&self, action: &ZubridgeAction) -> Result<(), String> {
        let mut state = self.state.lock().unwrap();

        match action.action_type.as_str() {
            "INCREMENT" => {
                state.counter += 1;
                Ok(())
            },
            _ => Err(format!("Unknown action: {}", action.action_type)),
        }
    }
}

pub fn zubridge<R: Runtime>() -> TauriPlugin<R> {
    let state_manager = AppStateManager {
        state: Mutex::new(AppState::default()),
    };

    ZubridgePlugin::new(state_manager)
}
```

### Advantages of the Plugin

1. **Simplified implementation**: No need to manually implement the communication contract
2. **Consistent event handling**: The plugin handles event broadcasting to all windows
3. **Error handling**: Built-in error handling for common issues
4. **Future-proof**: Updates to the protocol will be handled by the plugin

## Advanced Usage

### Custom Action Types

You can define your own action types and handle them accordingly:

```rust
impl StateManager for AppStateManager {
    // ...

    fn process_action(&self, action: &ZubridgeAction) -> Result<(), String> {
        let mut state = self.state.lock().unwrap();

        match action.action_type.as_str() {
            "INCREMENT" => {
                state.counter += 1;
                Ok(())
            },
            "SET_COUNTER" => {
                if let Some(payload) = &action.payload {
                    if let Ok(value) = serde_json::from_value::<i32>(payload.clone()) {
                        state.counter = value;
                        Ok(())
                    } else {
                        Err("Invalid payload for SET_COUNTER".to_string())
                    }
                } else {
                    Err("Missing payload for SET_COUNTER".to_string())
                }
            },
            _ => Err(format!("Unknown action: {}", action.action_type)),
        }
    }
}
```

### Custom State Persistence

You can implement state persistence by extending your state manager:

```rust
struct PersistentStateManager {
    state: Mutex<AppState>,
    storage_path: String,
}

impl PersistentStateManager {
    fn new(storage_path: String) -> Self {
        let state = if let Ok(data) = std::fs::read_to_string(&storage_path) {
            serde_json::from_str(&data).unwrap_or_default()
        } else {
            AppState::default()
        };

        Self {
            state: Mutex::new(state),
            storage_path,
        }
    }

    fn save_state(&self) {
        let state = self.state.lock().unwrap();
        if let Ok(json) = serde_json::to_string(&*state) {
            let _ = std::fs::write(&self.storage_path, json);
        }
    }
}

impl StateManager for PersistentStateManager {
    fn get_state(&self) -> serde_json::Value {
        let state = self.state.lock().unwrap();
        serde_json::to_value(&*state).unwrap()
    }

    fn process_action(&self, action: &ZubridgeAction) -> Result<(), String> {
        let mut state = self.state.lock().unwrap();

        // Process actions...

        // Save after processing
        drop(state);
        self.save_state();

        Ok(())
    }
}
```

## Conclusion

The `tauri-plugin-zubridge` plugin provides a convenient way to implement the state management contract between your Tauri backend and frontend. By understanding the underlying contract, you can better debug issues or implement custom solutions if needed.
