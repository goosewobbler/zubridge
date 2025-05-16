// Example showing middleware integration with @zubridge/tauri
//
// This would be incorporated into your Tauri application's main.rs file

use serde::{Deserialize, Serialize};
use serde_json::json;
use tauri::{command, State, Manager, Runtime};

// Import Zubridge middleware
use zubridge_middleware::{
    ZubridgeMiddleware, ZubridgeMiddlewareConfig, LoggingConfig, Action,
    init_middleware
};

// Import Zubridge Tauri plugin
use zubridge_tauri_plugin::{ZubridgePlugin, StateManager};

// Define your app state
#[derive(Clone, Debug, Serialize, Deserialize)]
struct AppState {
    counter: i32,
    theme: ThemeState,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
struct ThemeState {
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

// Create a state manager implementing the StateManager trait
struct AppStateManager {
    state: tokio::sync::Mutex<AppState>,
}

impl AppStateManager {
    fn new() -> Self {
        Self {
            state: tokio::sync::Mutex::new(AppState::default()),
        }
    }
}

impl StateManager for AppStateManager {
    async fn get_state(&self) -> serde_json::Value {
        let state = self.state.lock().await;
        serde_json::to_value(&*state).unwrap_or(json!({}))
    }

    async fn process_action(&self, action: &Action) -> Result<(), String> {
        let mut state = self.state.lock().await;

        match action.action_type.as_str() {
            "COUNTER:INCREMENT" => {
                state.counter += action.payload.as_ref()
                    .and_then(|p| p.as_i64())
                    .unwrap_or(1) as i32;
                Ok(())
            },
            "COUNTER:DECREMENT" => {
                state.counter -= action.payload.as_ref()
                    .and_then(|p| p.as_i64())
                    .unwrap_or(1) as i32;
                Ok(())
            },
            "COUNTER:SET" => {
                if let Some(value) = action.payload.as_ref().and_then(|p| p.as_i64()) {
                    state.counter = value as i32;
                    Ok(())
                } else {
                    Err("Missing payload for COUNTER:SET action".to_string())
                }
            },
            "THEME:TOGGLE" => {
                state.theme.is_dark = !state.theme.is_dark;
                Ok(())
            },
            _ => Err(format!("Unknown action type: {}", action.action_type)),
        }
    }
}

// Main application setup
fn main() {
    tauri::Builder::default()
        .setup(|app| {
            // Create middleware configuration
            let middleware_config = ZubridgeMiddlewareConfig {
                logging: LoggingConfig {
                    enabled: true,
                    websocket_port: Some(9000),
                    console_output: true,
                    ..Default::default()
                },
                ..Default::default()
            };

            // Initialize middleware
            let middleware = init_middleware(middleware_config);

            // Create state manager
            let state_manager = AppStateManager::new();

            // Create and configure the Zubridge plugin with middleware
            let zubridge_plugin = ZubridgePlugin::new(state_manager)
                .with_middleware(middleware.clone());

            // Register the plugin (which handles all the Zubridge integration)
            app.plugin(zubridge_plugin)
                .build()
                .expect("Failed to build Tauri plugin");

            // Set initial state in middleware
            let middleware_clone = middleware.clone();
            tauri::async_runtime::spawn(async move {
                let initial_state = AppState::default();
                let json_state = serde_json::to_value(&initial_state).unwrap_or(json!({}));
                let _ = middleware_clone.set_state(json_state).await;
            });

            // Log useful info
            println!("Zubridge + Middleware Example");
            println!("============================");
            println!("✅ Middleware initialized");
            println!("🔌 WebSocket server running on ws://localhost:9000");
            println!("🔍 Connect with any WebSocket client to monitor state and actions");

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error running tauri application");
}
