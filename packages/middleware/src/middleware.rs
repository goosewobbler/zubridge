//! Core middleware implementation
//!
//! This module contains the central ZubridgeMiddleware implementation that
//! orchestrates all middleware components and manages state.

use std::any::Any;
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};
use log;
use tokio::sync::RwLock;

use serde_json;

use crate::{Action, Context, Middleware, Result, State};
use crate::telemetry::TelemetryMiddleware;
use crate::transaction::{TransactionManager, Config as TransactionConfig};

/// Main middleware manager that orchestrates all middleware components
pub struct ZubridgeMiddleware {
    /// List of middlewares to apply in order
    pub middlewares: Vec<Arc<dyn Middleware>>,

    /// Current application state
    state: Arc<RwLock<State>>,

    /// Configuration
    config: crate::ZubridgeMiddlewareConfig,
    
    /// Transaction manager for tracking IPC performance
    transaction_manager: Arc<TransactionManager>,
}

impl ZubridgeMiddleware {
    /// Create a new middleware manager with the specified configuration
    pub fn new(config: crate::ZubridgeMiddlewareConfig) -> Self {
        // Create the transaction manager with default config
        let transaction_manager = Arc::new(TransactionManager::new());
        
        // Get a reference to the transaction store for sharing
        let transactions = transaction_manager.get_transaction_store();
        
        let mut middleware = Self {
            middlewares: Vec::new(),
            state: Arc::new(RwLock::new(serde_json::Value::Object(serde_json::Map::new()))),
            config,
            transaction_manager,
        };

        // Add telemetry middleware if enabled, passing transaction data
        if middleware.config.telemetry.enabled {
            middleware.add(Arc::new(TelemetryMiddleware::new(
                middleware.config.telemetry.clone(),
                transactions, // Pass the shared transaction store
            )));
        }

        middleware
    }
    
    /// Create a new middleware manager with a custom transaction configuration
    pub fn with_transaction_config(
        config: crate::ZubridgeMiddlewareConfig,
        transaction_config: TransactionConfig,
    ) -> Self {
        // Create the transaction manager with custom config
        let transaction_manager = Arc::new(TransactionManager::with_config(transaction_config));
        
        // Get a reference to the transaction store for sharing
        let transactions = transaction_manager.get_transaction_store();
        
        let mut middleware = Self {
            middlewares: Vec::new(),
            state: Arc::new(RwLock::new(serde_json::Value::Object(serde_json::Map::new()))),
            config,
            transaction_manager,
        };

        // Add telemetry middleware if enabled, passing transaction data
        if middleware.config.telemetry.enabled {
            middleware.add(Arc::new(TelemetryMiddleware::new(
                middleware.config.telemetry.clone(),
                transactions, // Pass the shared transaction store
            )));
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
    
    /// Track when an action is dispatched from the renderer
    pub async fn record_action_dispatch(&self, action: &Action) -> Result<()> {
        log::debug!("ZubridgeMiddleware::record_action_dispatch called for action: {}", action.action_type);
        
        if let Some(action_id) = &action.id {
            // Use transaction manager to record dispatch
            log::debug!("Recording dispatch in transaction manager for action ID: {}", action_id);
            
            match self.transaction_manager.record_dispatch(action_id, &action.action_type).await {
                Ok(_) => {
                    log::debug!("Transaction manager record_dispatch succeeded");
                }
                Err(e) => {
                    return Err(e);
                }
            }
            
            // Log middleware info but SKIP calling their methods to avoid the "Illegal invocation" error
            log::debug!("Skipping middleware notification to avoid binding issues");
            log::debug!("Tracking dispatch of action {} (type: {}) completed", action_id, action.action_type);
        } else {
            log::debug!("Action has no ID, skipping dispatch tracking");
        }
        
        Ok(())
    }
    
    /// Track when an action is received in the main process
    pub async fn record_action_received(&self, action: &Action) -> Result<()> {
        if let Some(action_id) = &action.id {
            // Use transaction manager to record receive
            self.transaction_manager.record_receive(action_id, &action.action_type).await?;
            
            // Notify middlewares
            for middleware in &self.middlewares {
                middleware.record_action_received(action).await;
            }
        }
        
        Ok(())
    }
    
    /// Track when a state update occurs after an action
    pub async fn record_state_update(&self, action: &Action, state: &State) -> Result<()> {
        if let Some(action_id) = &action.id {
            // Use transaction manager to record state update
            self.transaction_manager.record_state_update(action_id).await?;
            
            // Notify middlewares
            for middleware in &self.middlewares {
                middleware.record_state_update(action, state).await;
            }
        }
        
        Ok(())
    }
    
    /// Track when an action is acknowledged back to the renderer
    pub async fn record_action_acknowledgement(&self, action_id: &str) -> Result<()> {
        log::debug!("ZubridgeMiddleware::record_action_acknowledgement called for action ID: {}", action_id);
        
        // Use transaction manager to record acknowledgement
        log::debug!("Recording acknowledgement in transaction manager");
        
        match self.transaction_manager.record_acknowledgement(action_id).await {
            Ok(_) => {
                log::debug!("Transaction manager record_acknowledgement succeeded");
            }
            Err(e) => {
                return Err(e);
            }
        }
        
        // Get the transaction data for metrics
        log::debug!("Getting transaction data");
        
        let transaction_data = self.transaction_manager.get_transaction(action_id).await;
        
        if transaction_data.is_some() {
            log::debug!("Found transaction data");
        } else {
            log::debug!("No transaction data found");
        }
        
        // Log middleware info but SKIP calling their methods to avoid the "Illegal invocation" error
        log::debug!("Skipping middleware notification to avoid binding issues");
        
        log::debug!("Action acknowledgement recording completed");
        
        Ok(())
    }

    /// Process an action through the middleware pipeline
    pub async fn process_action(&self, action: Action) -> Result<()> {
        let mut ctx = Context::new();
        // Reduce debug logging in hot paths
        #[cfg(debug_assertions)]
        log::debug!("Starting process_action for action: {}, context ID: {}", action.action_type, ctx.id);

        // Find the telemetry middleware to check for performance configuration
        let telemetry_middleware = self.middlewares.iter()
            .find(|m| (**m).type_id() == std::any::TypeId::of::<TelemetryMiddleware>())
            .and_then(|m| {
                let middleware = m.as_ref() as &dyn Any;
                middleware.downcast_ref::<TelemetryMiddleware>()
            });
        
        let measure_performance = if let Some(telemetry) = telemetry_middleware {
            #[cfg(debug_assertions)]
            log::debug!("Found TelemetryMiddleware, checking performance config");
            
            let should_measure = telemetry.is_performance_measurement_enabled();
            
            #[cfg(debug_assertions)]
            log::debug!("Performance measurement enabled: {}", should_measure);
            
            should_measure
        } else {
            #[cfg(debug_assertions)]
            log::debug!("No TelemetryMiddleware found, performance measurement disabled");
            
            false
        };

        // Record start time for performance measurement
        let start_time = if measure_performance {
            // Store the start time in context for later calculation
            let now = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|d| d.as_nanos())
                .unwrap_or(0);
            ctx.start_time = Some(now);
            
            #[cfg(debug_assertions)]
            log::debug!("Recording start time: {} ns", now);
            
            Some(std::time::Instant::now())
        } else {
            None
        };

        // Deserialize action if it has a payload
        let deser_start = std::time::Instant::now();
        let _deser_action = if let Some(ref payload) = action.payload {
            // The payload is already a JsonValue, so no need to deserialize
            Some(payload.clone())
        } else {
            None
        };
        
        let deser_time = deser_start.elapsed().as_secs_f64() * 1000.0;
        
        if measure_performance {
            #[cfg(debug_assertions)]
            log::debug!("Deserialization time: {:.2}ms", deser_time);
            
            ctx.metadata.insert("deserialization_time_ms".to_string(), serde_json::json!(deser_time));
        }

        // Begin middleware pipeline execution
        let state = self.state.read().await;
        let action_start = std::time::Instant::now();

        // Call before_action for all middleware
        let mut current_action = Some(action.clone());
        for middleware in &self.middlewares {
            if let Some(ref act) = current_action {
                current_action = middleware.before_action(act, &ctx).await;
            } else {
                break; // Action was cancelled
            }
        }
        
        // If action was cancelled by a middleware, skip the rest
        if current_action.is_none() {
            #[cfg(debug_assertions)]
            log::debug!("Action was cancelled by middleware in before_action");
            
            return Ok(());
        }
        
        // Calculate time spent in before_action handlers
        let _before_action_time = if measure_performance {
            let time = action_start.elapsed().as_secs_f64() * 1000.0;
            
            #[cfg(debug_assertions)]
            log::debug!("Before action time: {:.2}ms", time);
            
            time
        } else {
            0.0
        };

        // Drop read lock to allow state mutations
        drop(state);

        // Process the action
        let state_update_start = std::time::Instant::now();
        
        // Instead of state-specific handling, this is a generic implementation
        // that will capture timing metrics regardless of the action or state structure
        {
            let mut state = self.state.write().await;
            
            // For testing purposes, perform a simple state update based on the action payload
            // This simulates the work that would happen in a real application
            // without assuming any specific state structure
            if let Some(action) = &current_action {
                // For payload-based actions, merge the payload into state
                if let Some(payload) = &action.payload {
                    if payload.is_object() {
                        // If payload is an object, merge it into state
                        if let Some(state_obj) = state.as_object_mut() {
                            if let Some(payload_obj) = payload.as_object() {
                                for (key, value) in payload_obj {
                                    state_obj.insert(key.clone(), value.clone());
                                }
                            }
                        }
                    } else {
                        // For simple values, create a synthetic field based on action type
                        let key = action.action_type.replace(":", "_").to_lowercase();
                        if let Some(state_obj) = state.as_object_mut() {
                            state_obj.insert(key, payload.clone());
                        } else {
                            // If state is not an object, initialize it as one
                            let mut new_state = serde_json::Map::new();
                            new_state.insert(key, payload.clone());
                            *state = serde_json::Value::Object(new_state);
                        }
                    }
                } else {
                    // For actions without payload, record the action in metadata
                    let key = "last_action";
                    if let Some(state_obj) = state.as_object_mut() {
                        state_obj.insert(key.to_string(), serde_json::Value::String(action.action_type.clone()));
                    } else {
                        // If state is not an object, initialize it as one
                        let mut new_state = serde_json::Map::new();
                        new_state.insert(key.to_string(), serde_json::Value::String(action.action_type.clone()));
                        *state = serde_json::Value::Object(new_state);
                    }
                }
                
                // Add artificial delay if specified for testing performance variations
                if let Some(delay_ms) = action.payload.as_ref()
                    .and_then(|p| p.get("delay_ms"))
                    .and_then(|d| d.as_u64()) {
                    if delay_ms > 0 {
                        // Simulate processing work for more realistic metrics
                        let start = std::time::Instant::now();
                        while start.elapsed().as_millis() < delay_ms as u128 {
                            // Busy wait to simulate CPU work
                            std::hint::spin_loop();
                        }
                    }
                }
            }
        }

        // Calculate state update time
        let _state_update_time = if measure_performance {
            let time = state_update_start.elapsed().as_secs_f64() * 1000.0;
            
            #[cfg(debug_assertions)]
            log::debug!("State update time: {:.2}ms", time);
            
            ctx.metadata.insert("state_update_time_ms".to_string(), serde_json::json!(time));
            time
        } else {
            0.0
        };

        let after_action_start = std::time::Instant::now();
        
        // Call after_action for all middleware
        let state = self.state.read().await;
        for middleware in &self.middlewares {
            middleware.after_action(&current_action.as_ref().unwrap(), &state, &ctx).await;
        }
        
        // Calculate after action time
        let _after_action_time = if measure_performance {
            let time = after_action_start.elapsed().as_secs_f64() * 1000.0;
            
            #[cfg(debug_assertions)]
            log::debug!("After action time: {:.2}ms", time);
            
            time
        } else {
            0.0
        };

        // Drop read lock after processing
        drop(state);

        // Calculate action processing time (includes state update and after_action)
        let _action_time = if measure_performance {
            let time = action_start.elapsed().as_secs_f64() * 1000.0;
            
            #[cfg(debug_assertions)]
            log::debug!("Action processing time: {:.2}ms", time);
            
            ctx.metadata.insert("action_processing_time_ms".to_string(), serde_json::json!(time));
            time
        } else {
            0.0
        };

        // Start serialization timer for the response
        let ser_start = std::time::Instant::now();

        // Calculate total processing time
        if let Some(start) = start_time {
            let processing_time = start.elapsed().as_secs_f64() * 1000.0;
            
            #[cfg(debug_assertions)]
            log::debug!("Total processing time: {:.2}ms", processing_time);
            
            ctx.metadata.insert("processing_time_ms".to_string(), serde_json::json!(processing_time));
            
            // Additional debug
            #[cfg(debug_assertions)]
            log::debug!("Performance breakdown: deserialization={:.2}ms, before_action={:.2}ms, state_update={:.2}ms, after_action={:.2}ms", 
                      deser_time, _before_action_time, _state_update_time, _after_action_time);
        }

        // Calculate serialization time after middleware processing
        let _ser_time = if measure_performance {
            let time = ser_start.elapsed().as_secs_f64() * 1000.0;
            
            #[cfg(debug_assertions)]
            log::debug!("Serialization time: {:.2}ms", time);
            
            // Update context with serialization time
            ctx.metadata.insert("serialization_time_ms".to_string(), serde_json::json!(time));
            
            Some(time)
        } else {
            None
        };

        // Update state for transaction tracking
        if let Some(action) = &current_action {
            if let Some(_action_id) = &action.id {
                let state = self.state.read().await.clone();
                self.record_state_update(action, &state).await?;
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