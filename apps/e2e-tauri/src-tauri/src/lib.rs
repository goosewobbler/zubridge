#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use tauri::AppHandle;
use tauri::Manager;
use tauri::Listener;
use tauri::plugin::TauriPlugin;
use tauri_plugin_zubridge::{self, plugin, StateManager, ZubridgeOptions};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;

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
}

// Define an error type for action processing
#[derive(Debug, Clone)]
pub enum ActionError {
    InvalidPayload(String),
    MissingPayload(String),
    ParseError(String),
}

impl std::fmt::Display for ActionError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ActionError::InvalidPayload(msg) => write!(f, "Invalid payload: {}", msg),
            ActionError::MissingPayload(msg) => write!(f, "Missing payload: {}", msg),
            ActionError::ParseError(msg) => write!(f, "Failed to parse action: {}", msg),
        }
    }
}

// Implement StateManager for our custom state manager
impl StateManager for AppStateManager {
    fn get_initial_state(&self) -> tauri_plugin_zubridge::JsonValue {
        let state = self.state.lock().unwrap();
        serde_json::to_value(state.clone()).unwrap()
    }

    fn dispatch_action(&mut self, action: tauri_plugin_zubridge::JsonValue) -> tauri_plugin_zubridge::JsonValue {
        println!("===== DISPATCH ACTION DEBUG =====");
        println!("Raw action received: {:?}", action);

        // Inspect the action structure
        if let Some(type_val) = action.get("type") {
            if let Some(type_str) = type_val.as_str() {
                println!("Action type: {}", type_str);
            } else {
                println!("Action type is not a string: {:?}", type_val);
            }
        } else {
            println!("Action has no 'type' field");
        }

        // Inspect the payload structure
        if let Some(payload) = action.get("payload") {
            println!("Payload: {:?}", payload);
            println!("Payload type: {}", if payload.is_null() { "null" }
                                        else if payload.is_number() { "number" }
                                        else if payload.is_object() { "object" }
                                        else if payload.is_array() { "array" }
                                        else if payload.is_string() { "string" }
                                        else if payload.is_boolean() { "boolean" }
                                        else { "unknown" });

            // If it's an object, print the keys
            if payload.is_object() {
                if let Some(obj) = payload.as_object() {
                    println!("Payload object keys: {:?}", obj.keys().collect::<Vec<_>>());

                    // Check for specific keys we're expecting
                    if let Some(value) = obj.get("value") {
                        println!("Found 'value' key with value: {:?}", value);
                    }
                }
            }
        } else {
            println!("Action has no 'payload' field");
        }

        println!("State before update: {:?}", self.state.lock().unwrap());

        // Try to parse the action directly into our CounterAction enum
        let result = match serde_json::from_value::<CounterAction>(action.clone()) {
            Ok(counter_action) => {
                // Successfully parsed the action, apply it to the state
                println!("Successfully parsed action: {:?}", counter_action);
                let state = self.state.lock().unwrap();
                let new_state = app_reducer(state.clone(), counter_action);
                println!("State after update: {:?}", new_state);
                Ok(new_state)
            },
            Err(e) => {
                // Failed to parse into CounterAction, handle as error
                println!("Error parsing action: {}", e);
                println!("Serde error details: {:?}", e);

                // Attempt some manual parsing for SET action
                let state = self.state.lock().unwrap();

                if let Some(type_val) = action.get("type") {
                    if let Some(type_str) = type_val.as_str() {
                        if type_str == "COUNTER:SET" {
                            println!("Manually handling COUNTER:SET");
                            if let Some(payload) = action.get("payload") {
                                if payload.is_number() {
                                    let value = payload.as_i64().unwrap_or(0) as i32;
                                    println!("Manual extraction: got value {}", value);

                                    // Create a manually updated state
                                    let mut new_state = state.clone();
                                    new_state.counter = value;
                                    println!("Manual state update: {:?}", new_state);

                                    // Update the state with our manual value
                                    let mut locked_state = self.state.lock().unwrap();
                                    *locked_state = new_state.clone();

                                    return serde_json::to_value(new_state).unwrap();
                                } else {
                                    println!("Payload is not a number: {:?}", payload);
                                }
                            }
                        }
                    }
                }

                Err(ActionError::ParseError(e.to_string()))
            }
        };

        // Update state and return appropriate response
        match result {
            Ok(new_state) => {
                // Update the stored state with the new state
                let mut state = self.state.lock().unwrap();
                *state = new_state.clone();
                println!("===== DISPATCH ACTION SUCCESS =====");
                serde_json::to_value(new_state).unwrap()
            },
            Err(error) => {
                // Create an error response that keeps the standard response format
                // but includes error information
                let mut response = serde_json::Map::new();
                let state = self.state.lock().unwrap();

                // Include the unchanged state
                response.insert("state".to_string(), serde_json::to_value(state.clone()).unwrap());

                // Add error information
                response.insert("success".to_string(), serde_json::Value::Bool(false));
                response.insert("error".to_string(), serde_json::Value::String(error.to_string()));

                println!("===== DISPATCH ACTION ERROR =====");
                serde_json::Value::Object(response)
            }
        }
    }
}

// Create a module for commands to avoid macro name conflicts
pub mod commands {
    use super::*;

    // Command to quit the app
    #[tauri::command]
    pub fn quit_app(app_handle: AppHandle) {
        app_handle.exit(0);
    }
}

#[path = "tray.rs"]
mod tray;

// Initialize the Zubridge plugin with our custom state manager
pub fn init() -> TauriPlugin<tauri::Wry> {
    let state_manager = AppStateManager::new();
    let options = ZubridgeOptions {
        event_name: "zubridge://state-update".to_string(),
    };

    plugin(state_manager, options)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let initial_state = AppState::default();
    let state_manager = AppStateManager::new();

    // Create custom options with the correct event name
    let options = ZubridgeOptions {
        event_name: "zubridge://state-update".to_string(),
    };

    let zubridge_plugin = plugin(state_manager, options.clone());

    tauri::Builder::default()
        .plugin(zubridge_plugin)
        .setup(move |app| {
            // Manage the concrete initial state if needed elsewhere
            app.manage(initial_state.clone());

            // Setup the tray icon - Clone the app_handle to pass ownership
            match tray::setup_tray(app.app_handle().clone()) {
                Ok(tray) => {
                    println!("Tray setup successfully");
                    // Store the tray if you need to update it later
                    app.manage(tray);
                },
                Err(e) => {
                    eprintln!("Failed to setup tray: {}", e);
                }
            }

            // Get the app handle to use in the closure
            let app_handle = app.app_handle().clone();

            // Set up event listener for state updates - use the same options object
            let event_handle = app_handle.clone();
            let event_name = options.event_name.clone();
            app_handle.listen(&options.event_name, move |event| {
                println!("Event received: {}", event_name);

                // The payload() method returns &str directly, not Option<&str>
                let payload_str = event.payload();
                println!("Payload: {}", payload_str);

                // Parse the updated state
                match serde_json::from_str::<AppState>(payload_str) {
                    Ok(updated_state) => {
                        println!("Successfully parsed state: {:?}", updated_state);

                        // Update the tray menu with the new state
                        println!("Attempting to update tray menu");
                        if let Some(tray) = event_handle.tray_by_id("main-tray") {
                            println!("Found tray with id main-tray");
                            match tray::create_menu(&event_handle, &updated_state) {
                                Ok(new_menu) => {
                                    println!("Created new menu, applying to tray");
                                    // Don't use a reference to the menu - pass it directly
                                    let result = tray.set_menu(Some(new_menu));
                                    println!("Tray menu update result: {:?}", result);
                                },
                                Err(e) => {
                                    eprintln!("Failed to create new menu: {}", e);
                                }
                            }
                            println!("Tray menu update complete");
                        } else {
                            eprintln!("Could not find tray with id main-tray");
                        }
                    },
                    Err(e) => {
                        eprintln!("Failed to parse state update: {}", e);
                    }
                }
                println!("Event handler complete");
            });

            Ok(())
        })
        // Register commands using their full command_id for Tauri v2
        .invoke_handler(tauri::generate_handler![
            commands::quit_app
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
