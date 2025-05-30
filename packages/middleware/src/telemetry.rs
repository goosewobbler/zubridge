//! Telemetry middleware for Zubridge
//!
//! This module provides a middleware for tracking actions and state changes
//! with options for WebSocket broadcasting for remote monitoring.

use crate::{Action, Context, Error, Middleware, Result, State, PerformanceTransaction};
use crate::metrics;
use crate::websocket::WebSocketServer;
use crate::{PerformanceMetrics, PerformanceDetail, PerformanceConfig, SerializationFormat};

use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use log::info;

use async_trait::async_trait;

/// Configuration for the telemetry middleware
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct TelemetryConfig {
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

    /// Whether to record state size metrics
    #[serde(default = "default_true")]
    pub record_state_size: bool,

    /// Whether to record state deltas between updates
    #[serde(default = "default_true")]
    pub record_state_delta: bool,

    /// Whether to pretty-print JSON when logging to console
    #[serde(default = "default_false")]
    pub pretty_print: bool,

    /// Whether to log verbose debug information
    #[serde(default = "default_false")]
    pub verbose: bool,

    /// Serialization format for WebSocket messages
    #[serde(default = "default_serialization_format")]
    pub serialization_format: SerializationFormat,

    /// Detailed performance metrics configuration
    #[serde(default)]
    pub performance: PerformanceConfig,

    /// Additional metadata/configuration not directly handled by the struct fields
    #[serde(default, skip_serializing_if = "HashMap::is_empty")]
    pub metadata: HashMap<String, JsonValue>,
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

impl Default for TelemetryConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            websocket_port: Some(9000),
            console_output: true,
            log_limit: default_log_limit(),
            measure_performance: true,
            record_state_size: true,
            record_state_delta: true,
            pretty_print: false,
            verbose: false,
            serialization_format: default_serialization_format(),
            performance: PerformanceConfig::default(),
            metadata: HashMap::new(),
        }
    }
}

/// Log entry for an action or state change
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct TelemetryEntry {
    /// Timestamp of the log entry
    pub timestamp: chrono::DateTime<chrono::Utc>,

    /// Type of log entry
    pub entry_type: TelemetryEntryType,

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

    /// Detailed processing time metrics in milliseconds
    #[serde(skip_serializing_if = "Option::is_none")]
    pub processing_metrics: Option<PerformanceMetrics>,
}

/// Types of log entries
#[derive(Clone, Debug, Serialize, Deserialize)]
pub enum TelemetryEntryType {
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
pub struct TelemetryMiddleware {
    /// Configuration for the telemetry middleware
    config: TelemetryConfig,

    /// WebSocket server for broadcasting log entries
    websocket: Option<Arc<WebSocketServer>>,

    /// Log history
    log_history: Arc<RwLock<Vec<TelemetryEntry>>>,

    /// Last state for calculating deltas
    last_state: Arc<RwLock<Option<State>>>,

    /// Map of action IDs to transaction data for tracking IPC performance
    /// This reference is maintained for compatibility with the transaction module
    /// but the actual transaction management is handled by TransactionManager
    transactions: Arc<RwLock<HashMap<String, PerformanceTransaction>>>,
}

impl TelemetryMiddleware {
    /// Create a new telemetry middleware with the specified configuration
    pub fn new(config: TelemetryConfig, transactions: Arc<RwLock<HashMap<String, PerformanceTransaction>>>) -> Self {
        // Configure log level based on verbose setting
        if config.verbose {
            // Set more verbose logging for our crate
            log::set_max_level(log::LevelFilter::Debug);
        }

        // Check for performance config in metadata
        let mut updated_config = config.clone();
        if let Some(perf_config) = config.metadata.get("performance_config") {
            log::debug!("Found performance_config in metadata: {:?}", perf_config);
            
            if let Some(perf_map) = perf_config.as_object() {
                // Update enabled flag
                if let Some(enabled) = perf_map.get("enabled") {
                    if let Some(value) = enabled.as_bool() {
                        updated_config.performance.enabled = value;
                        log::debug!("Setting performance.enabled = {}", value);
                    }
                }
                
                // Update detail level
                if let Some(detail) = perf_map.get("detail") {
                    if let Some(value) = detail.as_str() {
                        updated_config.performance.detail = match value.to_lowercase().as_str() {
                            "high" => PerformanceDetail::High,
                            "medium" => PerformanceDetail::Medium,
                            "low" => PerformanceDetail::Low,
                            _ => {
                                log::debug!("Unknown performance detail level: {}, using Medium", value);
                                PerformanceDetail::Medium
                            }
                        };
                        log::debug!("Setting performance.detail = {:?}", updated_config.performance.detail);
                    }
                }
                
                // Update include_in_logs flag
                if let Some(include) = perf_map.get("include_in_logs") {
                    if let Some(value) = include.as_bool() {
                        updated_config.performance.include_in_logs = value;
                        log::debug!("Setting performance.include_in_logs = {}", value);
                    }
                }
                
                // Update record_timings flag
                if let Some(record) = perf_map.get("record_timings") {
                    if let Some(value) = record.as_bool() {
                        updated_config.performance.record_timings = value;
                        log::debug!("Setting performance.record_timings = {}", value);
                    }
                }
                
                // Update verbose_output flag
                if let Some(verbose) = perf_map.get("verbose_output") {
                    if let Some(value) = verbose.as_bool() {
                        updated_config.performance.verbose_output = value;
                        log::debug!("Setting performance.verbose_output = {}", value);
                    }
                }
            }
        }

        log::debug!("Final performance config: {:?}", updated_config.performance);
        if updated_config.measure_performance && updated_config.performance.enabled {
            log::debug!("Performance measurement is ENABLED");
        } else {
            log::debug!("Performance measurement is DISABLED");
        }

        let log_history = Arc::new(RwLock::new(Vec::with_capacity(updated_config.log_limit)));
        let last_state = Arc::new(RwLock::new(None));

        // Extract the serialization format to avoid the partial move issue
        let serialization_format = updated_config.serialization_format;
        
        // Start WebSocket server if enabled
        let websocket = if let Some(port) = updated_config.websocket_port {
            log::info!("Initializing WebSocket server on port {}", port);
            
            let websocket = WebSocketServer::new(
                port, 
                log_history.clone(), 
                serialization_format,
            );
            let websocket_arc = Arc::new(websocket);

            // Spawn WebSocket server with improved error handling
            let ws = websocket_arc.clone();
            
            // Use spawn_blocking to ensure WebSocket server runs even if the current thread doesn't have a runtime
            tokio::task::spawn(async move {
                log::info!("Starting WebSocket server on port {}...", port);
                match ws.start().await {
                    Ok(_) => {
                        log::info!("WebSocket server stopped normally");
                    },
                    Err(err) => {
                        log::error!("WebSocket server error: {}", err);
                        // Log more detailed error info for debugging
                        if let Error::WebSocket(msg) = &err {
                            log::error!("WebSocket error details: {}", msg);
                        }
                    }
                }
            });

            log::info!("WebSocket server initialized successfully on port {}", port);
            Some(websocket_arc)
        } else {
            log::debug!("WebSocket server disabled (no port specified)");
            None
        };

        Self {
            config: updated_config,
            websocket,
            log_history,
            last_state,
            transactions,
        }
    }

    /// Check if performance measurement is enabled
    pub fn is_performance_measurement_enabled(&self) -> bool {
        self.config.measure_performance
    }

    /// Get a reference to the configuration
    pub fn get_config(&self) -> &TelemetryConfig {
        &self.config
    }

    /// Add a log entry to history and optionally broadcast it
    async fn add_log_entry(&self, entry: TelemetryEntry) -> Result<()> {
        // Log to console if enabled
        if self.config.console_output {
            match &entry.entry_type {
                TelemetryEntryType::ActionDispatched => {
                    if let Some(action) = &entry.action {
                        info!("Action dispatched: {} (ctx: {})", action.action_type, entry.context_id);
                        if let Some(_payload) = &action.payload {
                            #[cfg(debug_assertions)]
                            if self.config.pretty_print {
                                let pretty_json = serde_json::to_string_pretty(_payload)
                                    .unwrap_or_else(|_| _payload.to_string());
                                debug!("Action payload (pretty): \n{}", pretty_json);
                            } else {
                                debug!("Action payload: {}", _payload);
                            }
                        }
                    }
                }
                TelemetryEntryType::StateUpdated => {
                    let processing_info = match &entry.processing_metrics {
                        Some(metrics) => format!(" processed in {:.2}ms", metrics.total_ms),
                        None => String::new(),
                    };

                    info!("State updated after action{} (ctx: {})",
                        processing_info, entry.context_id);

                    #[cfg(debug_assertions)]
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
                TelemetryEntryType::ActionCancelled => {
                    info!("Action cancelled by middleware (ctx: {})", entry.context_id);
                    #[cfg(debug_assertions)]
                    if let Some(action) = &entry.action {
                        debug!("Cancelled action: {}", action.action_type);
                    }
                }
                TelemetryEntryType::Error => {
                    log::error!("Error in middleware (ctx: {})", entry.context_id);
                }
            }
        }

        // Add to history with limit - use a more efficient approach to avoid excessive cloning
        {
            let mut history = self.log_history.write().await;
            
            // Check if we need to trim before adding the new entry
            if history.len() >= self.config.log_limit {
                // Keep only the most recent entries up to the limit (minus 1 for the new entry)
                let start_idx = history.len() - self.config.log_limit + 1;
                if start_idx > 0 {
                    // More efficient than creating a new vector
                    history.drain(0..start_idx);
                }
            }
            
            // Add the new entry
            history.push(entry.clone());
        }

        // Broadcast if WebSocket is enabled - but don't clone unnecessarily
        if let Some(websocket) = &self.websocket {
            websocket.broadcast(&entry).await?;
        }

        Ok(())
    }

    /// Get the log history
    pub async fn get_history(&self) -> Vec<TelemetryEntry> {
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
impl Middleware for TelemetryMiddleware {
    async fn before_action(&self, action: &Action, ctx: &Context) -> Option<Action> {
        // Log the action - avoid cloning the action when possible
        let entry = TelemetryEntry {
            timestamp: chrono::Utc::now(),
            entry_type: TelemetryEntryType::ActionDispatched,
            action: Some(action.clone()), // Still need to clone for history
            state: None,
            state_summary: None,
            state_delta: None,
            context_id: ctx.id.clone(),
            processing_metrics: None,
        };

        if let Err(err) = self.add_log_entry(entry).await {
            log::error!("Error logging action: {}", err);
        }

        // Continue processing
        Some(action.clone())
    }

    async fn after_action(&self, action: &Action, state: &State, ctx: &Context) {
        #[cfg(debug_assertions)]
        log::debug!("TelemetryMiddleware::after_action called");
        #[cfg(debug_assertions)]
        log::debug!("Context ID: {}", ctx.id);
        
        // Check if this is a special action acknowledgment with performance metrics
        #[cfg(debug_assertions)]
        let has_performance_metrics = action.payload.as_ref()
            .and_then(|p| p.get("performance_metrics"))
            .is_some();
            
        #[cfg(debug_assertions)]
        if has_performance_metrics && ctx.id.starts_with("ipc-ack-") {
            log::debug!("Found performance metrics in action payload for IPC acknowledgment");
        }
        
        #[cfg(debug_assertions)]
        if self.config.performance.verbose_output {
            log::debug!("Context metadata keys: {:?}", ctx.metadata.keys().collect::<Vec<_>>());
            
            // Check if we have context start time (implies performance measurement)
            if let Some(start_time) = ctx.start_time {
                log::debug!("Context has start_time: {:?}", start_time);
                
                // Calculate and log elapsed time for comparison
                let now = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .map(|d| d.as_nanos())
                    .unwrap_or(0);
                let elapsed_nanos = now - start_time;
                let elapsed_ms = elapsed_nanos as f64 / 1_000_000.0;
                log::debug!("Elapsed time since context creation: {:.2}ms", elapsed_ms);
            } else {
                log::debug!("Context doesn't have start_time");
            }
        }

        // Extract performance metrics using the metrics module
        let processing_metrics = if self.config.measure_performance && self.config.performance.include_in_logs {
            metrics::extract_from_context(ctx, &self.config.performance)
        } else {
            None
        };
        
        // Calculate state delta if configured - avoid if not needed
        let state_delta = if self.config.record_state_delta {
            self.calculate_state_delta(state).await
        } else {
            None
        };

        // Calculate state summary if configured - avoid if not needed
        let state_summary = if self.config.record_state_size {
            self.create_state_summary(state)
        } else {
            None
        };

        // Create the state update log entry
        let state_update = TelemetryEntry {
            timestamp: chrono::Utc::now(),
            entry_type: TelemetryEntryType::StateUpdated,
            action: Some(action.clone()),  // Still need to clone for history
            state: Some(state.clone()),    // Still need to clone for history
            state_summary,
            state_delta,
            context_id: ctx.id.clone(),
            processing_metrics,
        };

        #[cfg(debug_assertions)]
        if self.config.console_output {
            if self.config.pretty_print {
                if let Ok(pretty) = serde_json::to_string_pretty(&state_update) {
                    log::info!("State updated: {}", pretty);
                }
            } else {
                log::info!("State updated for action: {}", action.action_type);
            }
        }

        // Add to history and broadcast
        if let Err(err) = self.add_log_entry(state_update).await {
            log::error!("Failed to add state update log: {}", err);
        }
    }
    
    // IPC performance tracking methods
    
    async fn record_action_dispatch(&self, action: &Action) {
        log::debug!("IPC action dispatched: {}", action.action_type);
        
        // Create a log entry for the dispatched action
        let entry = TelemetryEntry {
            timestamp: chrono::Utc::now(),
            entry_type: TelemetryEntryType::ActionDispatched,
            action: Some(action.clone()),
            state: None,
            state_summary: None,
            state_delta: None,
            context_id: format!("ipc-dispatch-{}", action.id.as_ref().unwrap_or(&"unknown".to_string())),
            processing_metrics: None,
        };
        
        if let Err(err) = self.add_log_entry(entry).await {
            log::error!("Error logging IPC action dispatch: {}", err);
        }
    }
    
    async fn record_action_received(&self, action: &Action) {
        log::debug!("IPC action received in main process: {}", action.action_type);
        
        // Create a log entry for the received action
        let entry = TelemetryEntry {
            timestamp: chrono::Utc::now(),
            entry_type: TelemetryEntryType::ActionDispatched,
            action: Some(action.clone()),
            state: None,
            state_summary: None,
            state_delta: None,
            context_id: format!("ipc-receive-{}", action.id.as_ref().unwrap_or(&"unknown".to_string())),
            processing_metrics: None,
        };
        
        if let Err(err) = self.add_log_entry(entry).await {
            log::error!("Error logging IPC action receive: {}", err);
        }
    }
    
    async fn record_state_update(&self, action: &Action, state: &State) {
        log::debug!("IPC state update for action: {}", action.action_type);
        
        // Calculate state summary
        let state_summary = if self.config.record_state_size {
            self.create_state_summary(state)
        } else {
            None
        };
        
        // Create a log entry for the state update
        let entry = TelemetryEntry {
            timestamp: chrono::Utc::now(),
            entry_type: TelemetryEntryType::StateUpdated,
            action: Some(action.clone()),
            state: Some(state.clone()),
            state_summary,
            state_delta: None,
            context_id: format!("ipc-update-{}", action.id.as_ref().unwrap_or(&"unknown".to_string())),
            processing_metrics: None,
        };
        
        if let Err(err) = self.add_log_entry(entry).await {
            log::error!("Error logging IPC state update: {}", err);
        }
    }
    
    async fn record_action_acknowledgement(&self, action_id: &str) {
        log::debug!("IPC action acknowledged: {}", action_id);

        // Context ID for the log entry
        let context_id = format!("ipc-ack-{}", action_id);
        
        // Don't create metrics if we don't have them - let's make this explicit
        let processing_metrics = None;
        
        // Create a synthetic action for the acknowledgment
        let action = Action {
            action_type: "ACTION_ACKNOWLEDGED".to_string(),
            payload: Some(serde_json::json!({ "action_id": action_id })),
            id: Some(action_id.to_string()),
            source_window_id: None,
        };
        
        // Create a log entry - without metrics if we don't have them
        let entry = TelemetryEntry {
            timestamp: chrono::Utc::now(),
            entry_type: TelemetryEntryType::StateUpdated,
            action: Some(action),
            state: Some(serde_json::json!({ "action_id": action_id, "acknowledged": true })),
            state_summary: None,
            state_delta: None,
            context_id,
            processing_metrics,
        };
        
        if let Err(err) = self.add_log_entry(entry).await {
            log::error!("Error logging IPC action acknowledgment: {}", err);
        }
    }

    // Implement the required as_any method
    fn as_any(&self) -> &dyn std::any::Any {
        self
    }
}

// Add a non-trait method for handling transactions directly
impl TelemetryMiddleware {
    /// This is a regular method, not part of the trait
    pub async fn track_action_acknowledged_with_transaction(&self, action_id: &str, transaction: &PerformanceTransaction) {
        log::debug!("IPC action acknowledged with transaction data: {}", action_id);

        // Context ID for the log entry
        let context_id = format!("ipc-ack-{}", action_id);
        
        // Calculate accurate metrics from transaction data using the metrics module
        let processing_metrics = match metrics::calculate_from_transaction(transaction) {
            Ok(Some(metrics)) => Some(metrics),
            Ok(None) => {
                log::warn!("Could not calculate metrics for transaction {}: insufficient data", action_id);
                None
            },
            Err(err) => {
                log::error!("Error calculating metrics for transaction {}: {}", action_id, err);
                None
            }
        };
        
        // Create a synthetic action for the acknowledgment
        let action = Action {
            action_type: transaction.action_type.clone(),
            payload: Some(serde_json::json!({ 
                "action_id": action_id,
                "has_metrics": processing_metrics.is_some() 
            })),
            id: Some(action_id.to_string()),
            source_window_id: None,
        };
        
        // Create a log entry with the performance metrics
        let entry = TelemetryEntry {
            timestamp: chrono::Utc::now(),
            entry_type: TelemetryEntryType::StateUpdated,
            action: Some(action),
            state: Some(serde_json::json!({ "action_id": action_id, "acknowledged": true })),
            state_summary: None,
            state_delta: None,
            context_id,
            processing_metrics,
        };
        
        // Add to history and broadcast - with improved error handling
        if let Err(err) = self.add_log_entry(entry).await {
            log::error!("Error logging IPC action acknowledgment: {}", err);
        }
    }
}
