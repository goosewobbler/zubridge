//! Zubridge Middleware Framework
//!
//! A middleware framework for the Zubridge state management system, providing
//! observability and extensibility for both Tauri and Electron applications.

mod error;
mod logging;
mod websocket;

use std::any::Any;
use std::collections::HashMap;
use std::sync::Arc;

use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;
use tokio::sync::RwLock;

pub use error::{Error, Result};
pub use logging::{LoggingConfig, LoggingMiddleware};
pub use websocket::WebSocketServer;

/// Represents any action that can be dispatched to modify state
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Action {
    /// The type of action being performed
    pub action_type: String,

    /// Optional payload data associated with the action
    #[serde(skip_serializing_if = "Option::is_none")]
    pub payload: Option<JsonValue>,
}

/// Represents application state
pub type State = JsonValue;

/// Context information passed to middleware
#[derive(Clone, Debug)]
pub struct Context {
    /// Unique identifier for the context
    pub id: String,

    /// Additional metadata for the middleware
    pub metadata: HashMap<String, JsonValue>,

    /// Start time for performance measurement (in nanoseconds)
    #[doc(hidden)]
    #[allow(dead_code)]
    pub(crate) start_time: Option<u128>,
}

impl Context {
    /// Create a new context with a random ID
    pub fn new() -> Self {
        Self {
            id: format!("{}", uuid::Uuid::new_v4()),
            metadata: HashMap::new(),
            start_time: None,
        }
    }

    /// Add metadata to the context
    pub fn with_metadata(mut self, key: impl Into<String>, value: impl Serialize) -> Result<Self> {
        let key = key.into();
        let value = serde_json::to_value(value).map_err(|e| Error::Json(e))?;
        self.metadata.insert(key, value);
        Ok(self)
    }
}

impl Default for Context {
    fn default() -> Self {
        Self::new()
    }
}

/// Core middleware trait that all middlewares must implement
#[async_trait]
pub trait Middleware: Send + Sync + Any {
    /// Process an action before it reaches the state reducer
    ///
    /// Return Some(action) to continue processing (potentially with a modified action)
    /// Return None to cancel the action (it will not be processed further)
    async fn before_action(&self, action: &Action, _ctx: &Context) -> Option<Action> {
        Some(action.clone())
    }

    /// Process state after an action has been applied
    async fn after_action(&self, _action: &Action, _state: &State, _ctx: &Context) {
        // Default implementation does nothing
    }
}

/// Configuration for the Zubridge middleware
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ZubridgeMiddlewareConfig {
    /// Configuration for the logging middleware
    #[serde(default)]
    pub logging: LoggingConfig,
}

impl Default for ZubridgeMiddlewareConfig {
    fn default() -> Self {
        Self {
            logging: LoggingConfig::default(),
        }
    }
}

/// Main middleware manager that orchestrates all middleware components
pub struct ZubridgeMiddleware {
    /// List of middlewares to apply in order
    middlewares: Vec<Arc<dyn Middleware>>,

    /// Current application state
    state: Arc<RwLock<State>>,

    /// Configuration
    config: ZubridgeMiddlewareConfig,
}

impl ZubridgeMiddleware {
    /// Create a new middleware manager with the specified configuration
    pub fn new(config: ZubridgeMiddlewareConfig) -> Self {
        let mut middleware = Self {
            middlewares: Vec::new(),
            state: Arc::new(RwLock::new(JsonValue::Object(serde_json::Map::new()))),
            config,
        };

        // Add logging middleware if enabled
        if middleware.config.logging.enabled {
            middleware.add(Arc::new(LoggingMiddleware::new(middleware.config.logging.clone())));
        }

        middleware
    }

    /// Add a middleware to the pipeline
    pub fn add(&mut self, middleware: Arc<dyn Middleware>) -> &mut Self {
        self.middlewares.push(middleware);
        self
    }

    /// Get the current state
    pub async fn get_state(&self) -> State {
        self.state.read().await.clone()
    }

    /// Process an action through the middleware pipeline
    pub async fn process_action(&self, action: Action) -> Result<()> {
        let mut ctx = Context::new();

        // If performance measurement is enabled in logging config, record start time
        let measure_performance = if let Some(middleware) = self.middlewares.iter()
            .find(|m| (**m).type_id() == std::any::TypeId::of::<LoggingMiddleware>()) {
            // Using downcast_ref which is safer than unsafe casting
            let logging = middleware.as_ref() as &dyn Any;
            if let Some(logging) = logging.downcast_ref::<LoggingMiddleware>() {
                // Use appropriate getter method for the config field instead of direct access
                if logging.is_performance_measurement_enabled() {
                    // Record start time using nanos for higher precision
                    ctx.start_time = Some(std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .map(|d| d.as_nanos())
                        .unwrap_or(0));
                    true
                } else {
                    false
                }
            } else {
                false
            }
        } else {
            false
        };

        // Process action through before_action middleware chain
        let mut current_action = Some(action);

        for middleware in &self.middlewares {
            if let Some(action) = current_action {
                current_action = middleware.before_action(&action, &ctx).await;
            } else {
                // Action was cancelled by a previous middleware
                break;
            }
        }

        // If action wasn't cancelled, apply it to state
        if let Some(action) = current_action.clone() {
            // Here we would normally apply the action to the state
            // This is a simplified version - in a real app you'd have reducers

            // Calculate processing time if measurement is enabled
            let processing_time_ms = if measure_performance && ctx.start_time.is_some() {
                let end_time = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .map(|d| d.as_nanos())
                    .unwrap_or(0);

                let elapsed_nanos = end_time - ctx.start_time.unwrap();
                Some(elapsed_nanos as f64 / 1_000_000.0) // Convert to milliseconds
            } else {
                None
            };

            // Store processing time in context for middleware to use
            if let Some(time) = processing_time_ms {
                // Create a new clone for manipulation
                let ctx_metadata = ctx.metadata.clone();
                // Create a new context with the updated metadata
                let mut new_metadata = ctx_metadata;
                // Store as string since JsonValue doesn't directly support f64
                new_metadata.insert("processing_time_ms".to_string(),
                    JsonValue::String(time.to_string()));

                // Update context with new metadata
                ctx.metadata = new_metadata;
            }

            // Now process through after_action middleware chain
            let state = self.state.read().await.clone();
            for middleware in &self.middlewares {
                middleware.after_action(&action, &state, &ctx).await;
            }
        }

        Ok(())
    }

    /// Update the entire state at once
    pub async fn set_state(&self, new_state: State) -> Result<()> {
        let mut state = self.state.write().await;
        *state = new_state;
        Ok(())
    }
}

#[cfg(feature = "tauri")]
pub mod tauri {
    use super::*;
    use tauri::{Runtime, State as TauriState};

    /// Tauri command to initialize middleware
    #[tauri::command]
    pub async fn init_zubridge_middleware<R: Runtime>(
        config: ZubridgeMiddlewareConfig,
        state: TauriState<'_, Arc<ZubridgeMiddleware>>,
    ) -> Result<(), String> {
        // Middleware is already initialized via the State system
        // This is just a convenience command for frontend to check status
        Ok(())
    }

    /// Register Zubridge middleware with a Tauri application
    pub fn register<R: Runtime>(
        app: &mut tauri::App<R>,
        middleware: ZubridgeMiddleware,
    ) -> Result<(), Box<dyn std::error::Error>> {
        app.manage(Arc::new(middleware));

        // Register Tauri commands
        app.register_command(init_zubridge_middleware::<R>);

        Ok(())
    }
}

/// Start the Zubridge middleware with the specified configuration
pub fn init_middleware(config: ZubridgeMiddlewareConfig) -> ZubridgeMiddleware {
    ZubridgeMiddleware::new(config)
}
