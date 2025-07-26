#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

// Declare the tray module
mod tray;

use std::sync::Mutex;
use tauri::{AppHandle, Manager};
use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;

// Define the application state
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
            theme: ThemeState { is_dark: true },
        }
    }
}

// Define the frontend action structure
#[derive(Deserialize, Debug)]
pub struct ActionPayload {
    pub action: ZubridgeAction,
}

#[derive(Deserialize, Debug)]
pub struct ZubridgeAction {
    pub action_type: String,
    pub payload: Option<JsonValue>,
}

// Define actions
#[derive(Deserialize, Debug)]
#[serde(tag = "type")]
pub enum CounterAction {
    #[serde(rename = "COUNTER:INCREMENT")]
    Increment,
    #[serde(rename = "COUNTER:DECREMENT")]
    Decrement,
    #[serde(rename = "COUNTER:RESET")]
    Reset,
    #[serde(rename = "THEME:TOGGLE")]
    ToggleTheme,
    #[serde(rename = "COUNTER:SET")]
    SetCounter {
        #[serde(default)]
        payload: i32,
    },
}

// State reducer
fn app_reducer(mut state: AppState, action: CounterAction) -> AppState {
    match action {
        CounterAction::Increment => {
            state.counter += 1;
        },
        CounterAction::Decrement => {
            state.counter -= 1;
        },
        CounterAction::Reset => {
            state.counter = 0;
        },
        CounterAction::ToggleTheme => {
            state.theme.is_dark = !state.theme.is_dark;
        },
        CounterAction::SetCounter { payload } => {
            state.counter = payload;
        }
    }

    state
}

// Custom state manager
pub struct AppStateManager {
    state: Mutex<AppState>,
}

impl AppStateManager {
    pub fn new() -> Self {
        Self {
            state: Mutex::new(AppState::default()),
        }
    }

    // Add helper methods for tray
    pub fn get_state(&self) -> AppState {
        self.state.lock().unwrap().clone()
    }

    pub fn increment(&self) {
        let mut state = self.state.lock().unwrap();
        state.counter += 1;
    }

    pub fn decrement(&self) {
        let mut state = self.state.lock().unwrap();
        state.counter -= 1;
    }

    pub fn reset(&self) {
        let mut state = self.state.lock().unwrap();
        state.counter = 0;
    }

    pub fn toggle_theme(&self) {
        let mut state = self.state.lock().unwrap();
        state.theme.is_dark = !state.theme.is_dark;
    }
}

// Commands module to avoid macro name conflicts
pub mod commands {
    use super::*;

    #[tauri::command]
    pub fn get_initial_state(state: tauri::State<AppStateManager>) -> Result<JsonValue, String> {
        let state_guard = state.state.lock().map_err(|e| e.to_string())?;
        serde_json::to_value(&*state_guard).map_err(|e| e.to_string())
    }

    #[tauri::command]
    pub fn dispatch_action(
        app_handle: AppHandle,
        state: tauri::State<AppStateManager>,
        action: JsonValue,
    ) -> Result<JsonValue, String> {
        println!("===== DISPATCH ACTION DEBUG =====");

        // Print the exact JSON structure received
        println!("Raw action JSON: {}", serde_json::to_string_pretty(&action).unwrap_or_default());

        // Extract the action type correctly - checking for action_type directly
        let action_type = if action.is_object() {
            if let Some(type_val) = action.get("action_type") {
                if let Some(type_str) = type_val.as_str() {
                    println!("Found action_type directly: {}", type_str);
                    type_str
                } else {
                    println!("action_type field exists but is not a string");
                    "UNKNOWN"
                }
            } else if let Some(type_val) = action.get("type") {
                if let Some(type_str) = type_val.as_str() {
                    println!("Found type field: {}", type_str);
                    type_str
                } else {
                    println!("type field exists but is not a string");
                    "UNKNOWN"
                }
            } else if let Some(action_obj) = action.get("action") {
                if let Some(action_type) = action_obj.get("action_type") {
                    if let Some(type_str) = action_type.as_str() {
                        println!("Found action.action_type: {}", type_str);
                        type_str
                    } else {
                        println!("action.action_type exists but is not a string");
                        "UNKNOWN"
                    }
                } else {
                    println!("action object exists but has no action_type field");
                    "UNKNOWN"
                }
            } else {
                println!("action has no recognizable type field");
                "UNKNOWN"
            }
        } else {
            println!("action is not an object");
            "UNKNOWN"
        };

        // Try to extract payload from various locations
        let payload = if action.is_object() {
            if let Some(payload_val) = action.get("payload") {
                println!("Found payload directly");
                Some(payload_val.clone())
            } else if let Some(action_obj) = action.get("action") {
                if let Some(payload_val) = action_obj.get("payload") {
                    println!("Found action.payload");
                    Some(payload_val.clone())
                } else {
                    println!("action object exists but has no payload field");
                    None
                }
            } else {
                println!("No payload field found");
                None
            }
        } else {
            println!("action is not an object, no payload possible");
            None
        };

        println!("Final extracted action_type: {:?}, payload: {:?}", action_type, payload);

        // Construct a valid CounterAction JSON
        let action_json = serde_json::json!({
            "type": action_type,
            "payload": payload
        });

        println!("Constructed action JSON: {}", serde_json::to_string_pretty(&action_json).unwrap_or_default());

        // Try to parse the action
        let counter_action: CounterAction = serde_json::from_value(action_json)
            .map_err(|e| format!("Failed to parse action: {}", e))?;

        // Get current state
        let mut state_guard = state.state.lock().map_err(|e| e.to_string())?;
        println!("State before update: {:?}", *state_guard);

        // Apply the action
        let new_state = app_reducer(state_guard.clone(), counter_action);
        println!("State after update: {:?}", new_state);

        // Update state
        *state_guard = new_state.clone();

        // Convert to JSON
        let state_json = serde_json::to_value(&new_state)
            .map_err(|e| format!("Failed to serialize state: {}", e))?;

        // Emit state update event
        app_handle.emit_all("zubridge://state-update", &state_json)
            .map_err(|e| format!("Failed to emit state update: {}", e))?;

        println!("===== DISPATCH ACTION SUCCESS =====");
        Ok(state_json)
    }

    #[tauri::command]
    pub fn quit_app(app_handle: AppHandle) {
        app_handle.exit(0);
    }
}

// --- Application Setup ---
pub fn run() {
    let state_manager = AppStateManager::new();
    let system_tray = tray::create_tray();

    tauri::Builder::default()
        .manage(state_manager)
        .system_tray(system_tray)
        .on_system_tray_event(tray::handle_tray_event)
        .invoke_handler(tauri::generate_handler![
            commands::get_initial_state,
            commands::dispatch_action,
            commands::quit_app
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
