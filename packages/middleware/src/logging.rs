//! Logging middleware for Zubridge
//!
//! This module provides a middleware for logging actions and state changes
//! with options for WebSocket broadcasting for remote monitoring.

use std::sync::Arc;

use async_trait::async_trait;
use log::{debug, info};
use serde::{Deserialize, Serialize};
use tokio::sync::RwLock;

use crate::websocket::WebSocketServer;
use crate::{Action, Context, Error, Middleware, Result, State};

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

/// Middleware for logging actions and state changes
pub struct LoggingMiddleware {
    /// Configuration for the logging middleware
    config: LoggingConfig,

    /// WebSocket server for broadcasting log entries
    websocket: Option<Arc<WebSocketServer>>,

    /// Log history
    log_history: Arc<RwLock<Vec<LogEntry>>>,
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

        // Start WebSocket server if enabled
        let websocket = if let Some(port) = config.websocket_port {
            let websocket = WebSocketServer::new(port, log_history.clone());
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
        }
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

            // Trim if over limit
            if history.len() > self.config.log_limit {
                *history = history.split_off(history.len() - self.config.log_limit);
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
            if let Some(Ok(time_str)) = ctx.metadata.get("processing_time_ms").map(|v| v.as_str()) {
                time_str.parse::<f64>().ok()
            } else {
                None
            }
        } else {
            None
        };

        // Log the state after action
        let entry = LogEntry {
            timestamp: chrono::Utc::now(),
            entry_type: LogEntryType::StateUpdated,
            action: Some(action.clone()),
            state: Some(state.clone()),
            context_id: ctx.id.clone(),
            processing_time_ms,
        };

        if let Err(err) = self.add_log_entry(entry).await {
            log::error!("Error logging state: {}", err);
        }
    }
}
