//! Logging middleware for Zubridge
//!
//! This module provides a middleware for logging actions and state changes
//! with options for WebSocket broadcasting for remote monitoring.

use crate::{Action, Context, Middleware, Result, State};
use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;
use std::sync::Arc;
use tokio::sync::RwLock;
use log::{debug, info};

use async_trait::async_trait;

use crate::websocket::WebSocketServer;

/// Configuration for the logging middleware
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct LoggingConfig {
    /// Whether logging is enabled
    #[serde(default = "default_true")]
    pub enabled: bool,

    /// Port for the WebSocket server (None to disable)
    pub websocket_port: Option<u16>,

    /// Whether to output to console
    #[serde(default = "default_true")]
    pub console_output: bool,

    /// Maximum number of log entries to keep in memory
    #[serde(default = "default_log_limit")]
    pub log_limit: usize,

    /// Whether to measure action processing time
    #[serde(default = "default_true")]
    pub measure_performance: bool,

    /// Whether to pretty-print JSON when logging to console
    #[serde(default = "default_false")]
    pub pretty_print: bool,

    /// Whether to log verbose debug information
    #[serde(default = "default_false")]
    pub verbose: bool,

    /// Serialization format for WebSocket messages
    #[serde(default = "default_serialization_format")]
    pub serialization_format: SerializationFormat,
}

/// Available serialization formats for WebSocket messages
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub enum SerializationFormat {
    /// JSON format - more human-readable, compatible with browsers
    Json,
    /// MessagePack format - more efficient binary format
    MessagePack,
}

fn default_true() -> bool {
    true
}

fn default_false() -> bool {
    false
}

fn default_log_limit() -> usize {
    1000
}

fn default_serialization_format() -> SerializationFormat {
    SerializationFormat::Json
}

impl Default for LoggingConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            websocket_port: None,
            console_output: true,
            log_limit: default_log_limit(),
            measure_performance: true,
            pretty_print: false,
            verbose: false,
            serialization_format: default_serialization_format(),
        }
    }
}

/// Log entry for an action or state change
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct LogEntry {
    /// Timestamp of the log entry
    pub timestamp: chrono::DateTime<chrono::Utc>,

    /// Type of log entry
    pub entry_type: LogEntryType,

    /// Action that was dispatched (for action logs)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub action: Option<Action>,

    /// State snapshot (for state logs)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub state: Option<State>,

    /// State summary with metrics for analysis
    #[serde(skip_serializing_if = "Option::is_none")]
    pub state_summary: Option<StateSummary>,

    /// Only the changed parts of state since previous update
    #[serde(skip_serializing_if = "Option::is_none")]
    pub state_delta: Option<serde_json::Value>,

    /// Context ID for tracking related logs
    pub context_id: String,

    /// Processing time in milliseconds (for action logs with performance measurement)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub processing_time_ms: Option<f64>,
}

/// Types of log entries
#[derive(Clone, Debug, Serialize, Deserialize)]
pub enum LogEntryType {
    /// An action was dispatched
    ActionDispatched,

    /// An action was processed and state was updated
    StateUpdated,

    /// An action was cancelled by middleware
    ActionCancelled,

    /// An error occurred
    Error,
}

/// Summary information about the state
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct StateSummary {
    /// Approximate size of state in bytes
    pub size_bytes: usize,

    /// Number of top-level properties
    pub property_count: usize,

    /// List of top-level property names
    pub properties: Vec<String>,
}

/// Middleware for logging actions and state changes
pub struct LoggingMiddleware {
    /// Configuration for the logging middleware
    config: LoggingConfig,

    /// WebSocket server for broadcasting log entries
    websocket: Option<Arc<WebSocketServer>>,

    /// Log history
    log_history: Arc<RwLock<Vec<LogEntry>>>,

    /// Last state for calculating deltas
    last_state: Arc<RwLock<Option<State>>>,
}

impl LoggingMiddleware {
    /// Create a new logging middleware with the specified configuration
    pub fn new(config: LoggingConfig) -> Self {
        // Configure log level based on verbose setting
        if config.verbose {
            // Set more verbose logging for our crate
            log::set_max_level(log::LevelFilter::Debug);
        }

        let log_history = Arc::new(RwLock::new(Vec::with_capacity(config.log_limit)));
        let last_state = Arc::new(RwLock::new(None));

        // Start WebSocket server if enabled
        let websocket = if let Some(port) = config.websocket_port {
            let websocket = WebSocketServer::new(port, log_history.clone(), config.serialization_format.clone());
            let websocket_arc = Arc::new(websocket);

            // Spawn WebSocket server
            let ws = websocket_arc.clone();
            tokio::spawn(async move {
                if let Err(err) = ws.start().await {
                    log::error!("WebSocket server error: {}", err);
                }
            });

            Some(websocket_arc)
        } else {
            None
        };

        Self {
            config,
            websocket,
            log_history,
            last_state,
        }
    }

    /// Check if performance measurement is enabled
    pub fn is_performance_measurement_enabled(&self) -> bool {
        self.config.measure_performance
    }

    /// Get a reference to the configuration
    pub fn get_config(&self) -> &LoggingConfig {
        &self.config
    }

    /// Add a log entry to history and optionally broadcast it
    async fn add_log_entry(&self, entry: LogEntry) -> Result<()> {
        // Log to console if enabled
        if self.config.console_output {
            match &entry.entry_type {
                LogEntryType::ActionDispatched => {
                    if let Some(action) = &entry.action {
                        info!("Action dispatched: {} (ctx: {})", action.action_type, entry.context_id);
                        if let Some(payload) = &action.payload {
                            if self.config.pretty_print {
                                let pretty_json = serde_json::to_string_pretty(payload)
                                    .unwrap_or_else(|_| payload.to_string());
                                debug!("Action payload (pretty): \n{}", pretty_json);
                            } else {
                                debug!("Action payload: {}", payload);
                            }
                        }
                    }
                }
                LogEntryType::StateUpdated => {
                    let processing_info = match entry.processing_time_ms {
                        Some(time) => format!(" processed in {:.2}ms", time),
                        None => String::new(),
                    };

                    info!("State updated after action{} (ctx: {})",
                        processing_info, entry.context_id);

                    if let Some(state) = &entry.state {
                        if self.config.pretty_print {
                            let pretty_json = serde_json::to_string_pretty(state)
                                .unwrap_or_else(|_| state.to_string());
                            debug!("New state (pretty): \n{}", pretty_json);
                        } else {
                            debug!("New state: {}", state);
                        }
                    }
                }
                LogEntryType::ActionCancelled => {
                    info!("Action cancelled by middleware (ctx: {})", entry.context_id);
                    if let Some(action) = &entry.action {
                        debug!("Cancelled action: {}", action.action_type);
                    }
                }
                LogEntryType::Error => {
                    log::error!("Error in middleware (ctx: {})", entry.context_id);
                }
            }
        }

        // Add to history with limit
        {
            let mut history = self.log_history.write().await;
            history.push(entry.clone());

            // Trim if over limit - fix the borrowing issue
            if history.len() > self.config.log_limit {
                // Create a new vector instead of using split_off which borrows history mutably twice
                let start_idx = history.len() - self.config.log_limit;
                let mut new_history = Vec::with_capacity(self.config.log_limit);
                new_history.extend_from_slice(&history[start_idx..]);
                *history = new_history;
            }
        }

        // Broadcast if WebSocket is enabled
        if let Some(websocket) = &self.websocket {
            websocket.broadcast(&entry).await?;
        }

        Ok(())
    }

    /// Get the log history
    pub async fn get_history(&self) -> Vec<LogEntry> {
        self.log_history.read().await.clone()
    }

    /// Clear the log history
    pub async fn clear_history(&self) -> Result<()> {
        let mut history = self.log_history.write().await;
        history.clear();
        Ok(())
    }

    /// Calculate state summary information
    fn create_state_summary(&self, state: &State) -> Option<StateSummary> {
        let state_json = serde_json::to_string(state).ok()?;

        // Calculate property information from the state object
        let state_value = serde_json::from_str::<serde_json::Value>(&state_json).ok()?;
        let property_names = match &state_value {
            serde_json::Value::Object(map) => {
                map.keys().map(|k| k.clone()).collect::<Vec<String>>()
            },
            _ => Vec::new(),
        };

        Some(StateSummary {
            size_bytes: state_json.len(),
            property_count: property_names.len(),
            properties: property_names,
        })
    }

    /// Calculate state delta (what changed since last state)
    async fn calculate_state_delta(&self, state: &State) -> Option<serde_json::Value> {
        let last_state = self.last_state.read().await;

        if let Some(prev_state) = &*last_state {
            // Convert both states to JSON values for comparison
            let prev_json = serde_json::to_value(prev_state).ok()?;
            let current_json = serde_json::to_value(state).ok()?;

            // Only handle Object types for delta calculation
            match (prev_json, current_json) {
                (serde_json::Value::Object(prev_map), serde_json::Value::Object(current_map)) => {
                    let mut delta = serde_json::Map::new();

                    // Find changed or new properties
                    for (key, value) in current_map.iter() {
                        if !prev_map.contains_key(key) || prev_map[key] != *value {
                            delta.insert(key.clone(), value.clone());
                        }
                    }

                    // If no changes, return None instead of an empty object
                    if delta.is_empty() {
                        None
                    } else {
                        Some(serde_json::Value::Object(delta))
                    }
                },
                // If not objects, just return None
                _ => None
            }
        } else {
            // First state, no delta to calculate
            None
        }
    }
}

#[async_trait]
impl Middleware for LoggingMiddleware {
    async fn before_action(&self, action: &Action, ctx: &Context) -> Option<Action> {
        // Log the action
        let entry = LogEntry {
            timestamp: chrono::Utc::now(),
            entry_type: LogEntryType::ActionDispatched,
            action: Some(action.clone()),
            state: None,
            state_summary: None,
            state_delta: None,
            context_id: ctx.id.clone(),
            processing_time_ms: None,
        };

        if let Err(err) = self.add_log_entry(entry).await {
            log::error!("Error logging action: {}", err);
        }

        // Continue processing
        Some(action.clone())
    }

    async fn after_action(&self, action: &Action, state: &State, ctx: &Context) {
        // Get performance measurement if available
        let processing_time_ms = if self.config.measure_performance {
            // Fix the type mismatch by properly handling the JSON value conversion
            ctx.metadata.get("processing_time_ms")
                .and_then(|v| match v {
                    JsonValue::String(s) => s.parse::<f64>().ok(),
                    JsonValue::Number(n) => n.as_f64(),
                    _ => None,
                })
        } else {
            None
        };

        // Calculate state summary
        let state_summary = self.create_state_summary(state);

        // Calculate state delta
        let state_delta = self.calculate_state_delta(state).await;

        // Update last state for future deltas
        {
            let mut last_state = self.last_state.write().await;
            *last_state = Some(state.clone());
        }

        // Log the state after action
        let entry = LogEntry {
            timestamp: chrono::Utc::now(),
            entry_type: LogEntryType::StateUpdated,
            action: Some(action.clone()),
            state: Some(state.clone()),
            state_summary,
            state_delta,
            context_id: ctx.id.clone(),
            processing_time_ms,
        };

        if let Err(err) = self.add_log_entry(entry).await {
            log::error!("Error logging state: {}", err);
        }
    }
}
