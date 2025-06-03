//! Zubridge Middleware Framework
//!
//! A middleware framework for the Zubridge state management system, providing
//! observability and extensibility for both Tauri and Electron applications.

mod error;
mod metrics;
mod middleware;
mod serialization;
mod telemetry;
mod transaction;
mod websocket;

use std::any::Any;
use std::collections::HashMap;
use std::time::{SystemTime, UNIX_EPOCH};

use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;
use uuid;
use chrono;
use log::LevelFilter;
use fern;

use thiserror::Error;

pub use error::{Error, Result};
pub use metrics::{Metrics as PerformanceMetrics, DetailLevel as PerformanceDetail, Config as PerformanceConfig};
pub use middleware::ZubridgeMiddleware;
pub use serialization::Format as SerializationFormat;
pub use telemetry::{TelemetryConfig, TelemetryMiddleware, TelemetryEntry, TelemetryEntryType};
pub use transaction::{TransactionManager, Config as TransactionConfig};
pub use websocket::WebSocketServer;

/// Represents any action that can be dispatched to modify state
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Action {
    /// The type of action being performed
    pub action_type: String,

    /// Optional payload data associated with the action
    #[serde(skip_serializing_if = "Option::is_none")]
    pub payload: Option<JsonValue>,
    
    /// Unique identifier for tracking the action
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    
    /// Source window ID (for tracking IPC communication)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source_window_id: Option<u32>,
}

/// Represents application state
pub type State = JsonValue;

/// Stores IPC transaction timing data
#[derive(Clone, Debug)]
pub struct PerformanceTransaction {
    /// Action type
    pub action_type: String,
    
    /// Action ID
    pub action_id: Option<String>,
    
    /// Timestamp when action was dispatched from renderer
    pub dispatch_timestamp: u128,
    
    /// Timestamp when action was received in main process
    pub receive_timestamp: Option<u128>,
    
    /// Timestamp when state was updated
    pub state_update_timestamp: Option<u128>,
    
    /// Timestamp when acknowledgment was sent back to renderer
    pub acknowledge_timestamp: Option<u128>,
}

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
    
    /// Reference to the active transaction if this is part of an IPC flow
    #[doc(hidden)]
    #[allow(dead_code)]
    pub(crate) transaction_id: Option<String>,
}

impl Context {
    /// Create a new context with a random ID
    pub fn new() -> Self {
        Self {
            id: format!("{}", uuid::Uuid::new_v4()),
            metadata: HashMap::new(),
            start_time: Some(SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_nanos()),
            transaction_id: None,
        }
    }
    
    /// Create a new context with a specific transaction ID
    pub fn with_transaction_id(transaction_id: String) -> Self {
        let mut ctx = Self::new();
        ctx.transaction_id = Some(transaction_id);
        ctx
    }

    /// Add metadata to the context
    pub fn with_metadata(mut self, key: impl Into<String>, value: impl Serialize) -> Result<Self> {
        let key = key.into();
        let value = serde_json::to_value(value).map_err(|e| Error::Json(e))?;
        self.metadata.insert(key, value);
        Ok(self)
    }

    /// Add a performance metric to the context metadata
    ///
    /// This is a helper method to simplify adding timing metrics
    /// for the logging middleware.
    pub fn add_performance_metric(&mut self, name: &str, value: f64) {
        self.metadata.insert(name.to_string(), serde_json::json!(value));
    }

    /// Set all performance metrics at once
    ///
    /// Adds all the timing metrics used by the logging middleware:
    /// - total_ms: Total processing time
    /// - deserialization_ms: Time spent deserializing
    /// - action_ms: Time spent in action handlers
    /// - state_ms: Time spent updating state
    /// - serialization_ms: Time spent serializing
    pub fn set_performance_metrics(
        &mut self,
        total_ms: f64,
        deserialization_ms: Option<f64>,
        action_ms: Option<f64>,
        state_ms: Option<f64>,
        serialization_ms: Option<f64>,
    ) {
        self.add_performance_metric("processing_time_ms", total_ms);

        if let Some(deser_ms) = deserialization_ms {
            self.add_performance_metric("deserialization_time_ms", deser_ms);
        }

        if let Some(action_ms) = action_ms {
            self.add_performance_metric("action_processing_time_ms", action_ms);
        }

        if let Some(state_ms) = state_ms {
            self.add_performance_metric("state_update_time_ms", state_ms);
        }

        if let Some(ser_ms) = serialization_ms {
            self.add_performance_metric("serialization_time_ms", ser_ms);
        }
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
    
    /// Track when an action is dispatched from the renderer process
    async fn record_action_dispatch(&self, _action: &Action) {
        // Default implementation does nothing
    }
    
    /// Track when an action is received in the main process
    async fn record_action_received(&self, _action: &Action) {
        // Default implementation does nothing 
    }
    
    /// Track when a state update is ready to be sent to renderers
    async fn record_state_update(&self, _action: &Action, _state: &State) {
        // Default implementation does nothing
    }
    
    /// Track when an action acknowledgment is sent back to renderer
    async fn record_action_acknowledgement(&self, _action_id: &str) {
        // Default implementation does nothing
    }

    /// Get self as Any for downcasting
    fn as_any(&self) -> &dyn Any;
}

/// Configuration for the Zubridge middleware
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ZubridgeMiddlewareConfig {
    /// Configuration for the telemetry middleware
    #[serde(default)]
    pub telemetry: TelemetryConfig,
    
    /// Configuration for transaction tracking
    #[serde(default)]
    pub transaction: TransactionConfig,
}

impl Default for ZubridgeMiddlewareConfig {
    fn default() -> Self {
        Self {
            telemetry: TelemetryConfig::default(),
            transaction: TransactionConfig::default(),
        }
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
    // Get a platform-appropriate temp directory path for logging
    let temp_dir = std::env::temp_dir();
    let log_path = temp_dir.join("zubridge_middleware_debug.log");
    let log_path_str = log_path.to_string_lossy();
    
    // Try to set up logging to a file using fern, but continue even if it fails
    let logger = fern::Dispatch::new()
        .format(|out, message, record| {
            out.finish(format_args!(
                "[{}][{}][{}] {}",
                chrono::Utc::now().to_rfc3339(),
                record.level(),
                record.target(),
                message
            ))
        })
        .level(LevelFilter::Debug);
        
    // Try to open the log file, but don't fail if we can't
    match fern::log_file(&log_path) {
        Ok(log_file) => {
            // If we successfully opened the log file, chain it to the logger
            match logger.chain(log_file).apply() {
                Ok(_) => {
                    log::info!("Zubridge middleware logging initialized to {} (fern)", log_path_str);
                },
                Err(e) => {
                    eprintln!("Warning: Failed to apply fern logger: {}. Continuing without file logging.", e);
                }
            }
        },
        Err(e) => {
            eprintln!("Warning: Failed to open log file for fern: {}. Continuing without file logging.", e);
            // Still apply the logger to stderr at least
            if let Err(e) = logger.chain(std::io::stderr()).apply() {
                eprintln!("Warning: Failed to initialize any logging: {}", e);
            }
        }
    };

    // Assume Tokio runtime is available
    log::debug!("Initializing middleware with Tokio runtime");
    
    // Create debug logs only in debug mode
    #[cfg(debug_assertions)]
    {
        log::debug!("Initializing Zubridge middleware with config: {:?}", config);
        log::debug!("Performance measurement enabled in config: {}", config.telemetry.measure_performance);
        log::debug!("Performance config: {:?}", config.telemetry.performance);
        log::debug!("Transaction config: {:?}", config.transaction);
        
        if let Some(port) = config.telemetry.websocket_port {
            log::debug!("WebSocket server enabled on port {}", port);
        } else {
            log::debug!("WebSocket server disabled");
        }
        
        // Check metadata for special performance config
        if let Some(perf_config) = config.telemetry.metadata.get("performance_config") {
            log::debug!("Found performance_config in metadata: {:?}", perf_config);
        } else {
            log::debug!("No performance_config found in metadata");
        }
        
        // Extra diagnostic log for test validation
        if config.telemetry.performance.verbose_output {
            log::debug!("DIAGNOSTIC CONFIG CHECK:");
            log::debug!("  performance.enabled = {}", config.telemetry.performance.enabled);
            log::debug!("  performance.detail = {:?}", config.telemetry.performance.detail);
            log::debug!("  performance.include_in_logs = {}", config.telemetry.performance.include_in_logs);
            log::debug!("  performance.record_timings = {}", config.telemetry.performance.record_timings);
            log::debug!("  performance.verbose_output = {}", config.telemetry.performance.verbose_output);
            log::debug!("  measure_performance = {}", config.telemetry.measure_performance);
            log::debug!("TRANSACTION CONFIG CHECK:");
            log::debug!("  max_age_seconds = {}", config.transaction.max_age_seconds);
            log::debug!("  max_transactions = {}", config.transaction.max_transactions);
            log::debug!("  cleanup_interval_seconds = {}", config.transaction.cleanup_interval_seconds);
        }
    }
    
    // Create middleware with the transaction configuration
    let middleware = ZubridgeMiddleware::with_transaction_config(
        config.clone(), 
        config.transaction
    );
    
    #[cfg(debug_assertions)]
    log::debug!("Zubridge middleware initialized successfully");
    
    middleware
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::time::Duration;
    use tokio::time::sleep;

    // Diagnostic function to verify that performance metrics are being set properly
    fn diagnostic_log_context(ctx: &Context, label: &str) {
        log::debug!("DIAGNOSTIC {}: Context ID: {}", label, ctx.id);
        log::debug!("DIAGNOSTIC {}: Start time present: {}", label, ctx.start_time.is_some());
        log::debug!("DIAGNOSTIC {}: Metadata keys: {:?}", label, ctx.metadata.keys().collect::<Vec<_>>());
        
        if let Some(time_value) = ctx.metadata.get("processing_time_ms") {
            log::debug!("DIAGNOSTIC {}: processing_time_ms = {:?}", label, time_value);
        }
        
        if let Some(deser_value) = ctx.metadata.get("deserialization_time_ms") {
            log::debug!("DIAGNOSTIC {}: deserialization_time_ms = {:?}", label, deser_value);
        }
        
        if let Some(action_value) = ctx.metadata.get("action_processing_time_ms") {
            log::debug!("DIAGNOSTIC {}: action_processing_time_ms = {:?}", label, action_value);
        }
        
        if let Some(state_value) = ctx.metadata.get("state_update_time_ms") {
            log::debug!("DIAGNOSTIC {}: state_update_time_ms = {:?}", label, state_value);
        }
        
        if let Some(ser_value) = ctx.metadata.get("serialization_time_ms") {
            log::debug!("DIAGNOSTIC {}: serialization_time_ms = {:?}", label, ser_value);
        }
    }

    #[tokio::test]
    async fn test_performance_metrics_collection() {
        // Create middleware with performance measurement enabled
        let config = ZubridgeMiddlewareConfig {
            telemetry: TelemetryConfig {
                enabled: true,
                websocket_port: None, // Disable WebSocket to avoid port conflicts in tests
                console_output: false, // Disable console output for cleaner test output
                measure_performance: true,
                performance: telemetry::PerformanceConfig {
                    enabled: true,
                    detail: telemetry::PerformanceDetail::High,
                    include_in_logs: true,
                    record_timings: true,
                    verbose_output: true,
                },
                ..Default::default()
            },
            transaction: TransactionConfig {
                max_age_seconds: 60, // Short lifetime for tests
                max_transactions: 100,
                cleanup_interval_seconds: 10,
            },
        };

        let middleware = ZubridgeMiddleware::new(config);

        // Create a test action
        let action = Action {
            action_type: "TEST_ACTION".to_string(),
            payload: Some(json!({ "test": true })),
            id: None,
            source_window_id: None,
        };

        // Process the action - this should include performance metrics
        let process_result = middleware.process_action(action).await;
        assert!(process_result.is_ok(), "Action processing should succeed");

        // Check if we can find any TelemetryMiddleware
        let telemetry_middleware = middleware.middlewares.iter()
            .find(|m| (**m).type_id() == std::any::TypeId::of::<TelemetryMiddleware>())
            .and_then(|m| {
                let middleware = m.as_ref() as &dyn Any;
                middleware.downcast_ref::<TelemetryMiddleware>()
            });
        
        assert!(telemetry_middleware.is_some(), "Telemetry middleware should be present");
        
        // Get the log history which should contain metrics
        let log_history = telemetry_middleware.unwrap().get_history().await;
        assert!(!log_history.is_empty(), "Log history should not be empty");
        
        // Check the state updates for performance metrics
        let state_updates = log_history.iter()
            .filter(|entry| matches!(entry.entry_type, telemetry::TelemetryEntryType::StateUpdated))
            .collect::<Vec<_>>();
        
        assert!(!state_updates.is_empty(), "Should have state update entries");
        
        // At least one state update should have performance metrics
        let updates_with_metrics = state_updates.iter()
            .filter(|entry| entry.processing_metrics.is_some())
            .collect::<Vec<_>>();
        
        // Log for diagnostic purposes
        log::debug!("Found {} state updates, {} with metrics", 
                   state_updates.len(), updates_with_metrics.len());
        
        if !updates_with_metrics.is_empty() {
            log::debug!("Performance metrics in first entry: {:?}", 
                       updates_with_metrics[0].processing_metrics);
        } else {
            log::debug!("No entries with performance metrics found");
            
            // Log the first state update for diagnostic purposes
            if !state_updates.is_empty() {
                log::debug!("First state update: {:?}", state_updates[0]);
                log::debug!("Context ID: {}", state_updates[0].context_id);
            }
        }
        
        assert!(!updates_with_metrics.is_empty(), 
                "At least one state update should have performance metrics");
    }

    #[tokio::test]
    async fn test_performance_metrics_detail_levels() {
        async fn process_with_detail(detail: telemetry::PerformanceDetail) -> Result<()> {
            let config = ZubridgeMiddlewareConfig {
                telemetry: TelemetryConfig {
                    enabled: true,
                    websocket_port: None,
                    console_output: false,
                    measure_performance: true,
                    performance: telemetry::PerformanceConfig {
                        enabled: true,
                        detail,
                        include_in_logs: true,
                        record_timings: true,
                        verbose_output: false,
                    },
                    ..Default::default()
                },
                transaction: TransactionConfig {
                    max_age_seconds: 30, // Very short lifetime for tests
                    max_transactions: 50,
                    cleanup_interval_seconds: 5,
                },
            };

            let middleware = ZubridgeMiddleware::new(config);

            // Create a test action that sleeps to ensure measurable performance
            let action = Action {
                action_type: "SLOW_ACTION".to_string(),
                payload: Some(json!({ "delay_ms": 50 })),
                id: None,
                source_window_id: None,
            };

            // Process the action with artificial delay to simulate work
            let start = std::time::Instant::now();
            
            // Start processing
            let process_future = middleware.process_action(action);
            
            // Simulate some processing time
            sleep(Duration::from_millis(50)).await;
            
            // Complete processing
            process_future.await?;
            
            let elapsed = start.elapsed();
            println!("Action processed in {:?}", elapsed);

            Ok(())
        }

        // Test with different detail levels
        let high_detail_result = process_with_detail(telemetry::PerformanceDetail::High).await;
        assert!(high_detail_result.is_ok(), "High detail processing should succeed");

        let medium_detail_result = process_with_detail(telemetry::PerformanceDetail::Medium).await;
        assert!(medium_detail_result.is_ok(), "Medium detail processing should succeed");

        let low_detail_result = process_with_detail(telemetry::PerformanceDetail::Low).await;
        assert!(low_detail_result.is_ok(), "Low detail processing should succeed");
    }
    
    #[tokio::test]
    async fn test_websocket_includes_performance_metrics() {
        // Enable WebSocket server but on a high port unlikely to conflict
        let config = ZubridgeMiddlewareConfig {
            telemetry: TelemetryConfig {
                enabled: true,
                websocket_port: Some(54321), // Use high port for test
                console_output: false,
                measure_performance: true,
                performance: telemetry::PerformanceConfig {
                    enabled: true,
                    detail: telemetry::PerformanceDetail::High,
                    include_in_logs: true,
                    record_timings: true,
                    verbose_output: true,
                },
                ..Default::default()
            },
        };

        let middleware = ZubridgeMiddleware::new(config);

        // Create a test action
        let action = Action {
            action_type: "TEST_ACTION".to_string(),
            payload: Some(json!({ "test": true })),
            id: None,
            source_window_id: None,
        };

        // Process the action
        let process_result = middleware.process_action(action).await;
        assert!(process_result.is_ok(), "Action processing should succeed");

        // Wait a moment for WebSocket to process
        sleep(Duration::from_millis(100)).await;

        // Get the telemetry middleware
        let telemetry_middleware = middleware.middlewares.iter()
            .find(|m| (**m).type_id() == std::any::TypeId::of::<TelemetryMiddleware>())
            .and_then(|m| {
                let middleware = m.as_ref() as &dyn Any;
                middleware.downcast_ref::<TelemetryMiddleware>()
            });
        
        assert!(telemetry_middleware.is_some(), "Telemetry middleware should be present");
        
        // Get the log history
        let log_history = telemetry_middleware.unwrap().get_history().await;
        
        // Find StateUpdated entries
        let state_updates = log_history.iter()
            .filter(|entry| matches!(entry.entry_type, telemetry::TelemetryEntryType::StateUpdated))
            .collect::<Vec<_>>();
        
        assert!(!state_updates.is_empty(), "Should have state update entries");
        
        // Verify metrics are included
        for (i, update) in state_updates.iter().enumerate() {
            log::debug!("State update {}: has metrics = {}", i, update.processing_metrics.is_some());
            
            // Serialize to verify what would be sent over WebSocket
            let serialized = serde_json::to_string(update).unwrap_or_default();
            log::debug!("Serialized update {}: {}", i, serialized);
            
            // Check if serialized output includes metrics
            assert!(serialized.contains("processing_metrics") || i > 0, 
                    "Serialized output should include processing metrics");
        }
        
        // At least the first update should have metrics
        assert!(state_updates[0].processing_metrics.is_some(), 
                "First state update should have performance metrics");
    }
}
