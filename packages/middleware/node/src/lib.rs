#![deny(clippy::all)]

use std::sync::Arc;

use napi_derive::napi;
use napi::bindgen_prelude::*;

// Re-export the types we need from the middleware crate
use zubridge_middleware::{
  ZubridgeMiddleware as RustZubridgeMiddleware,
  ZubridgeMiddlewareConfig as RustZubridgeMiddlewareConfig,
  TelemetryConfig as RustTelemetryConfig,
  Action as RustAction,
};

#[napi(object)]
pub struct PerformanceConfig {
  pub enabled: Option<bool>,
  pub detail: Option<String>,
  pub include_in_logs: Option<bool>,
  pub record_timings: Option<bool>,
  pub verbose_output: Option<bool>,
}

#[napi(object)]
pub struct TelemetryConfig {
  pub enabled: Option<bool>,
  pub websocket_port: Option<u32>,
  pub console_output: Option<bool>,
  pub log_limit: Option<u32>,
  pub measure_performance: Option<bool>,
  pub record_state_size: Option<bool>,
  pub record_state_delta: Option<bool>,
  pub pretty_print: Option<bool>,
  pub verbose: Option<bool>,
  pub performance: Option<PerformanceConfig>,
}

#[napi(object)]
pub struct ZubridgeMiddlewareConfig {
  pub telemetry: Option<TelemetryConfig>,
}

#[napi(object)]
pub struct Action {
  pub r#type: String,
  pub payload: Option<String>,
  pub id: Option<String>,
  pub source_window_id: Option<u32>,
}

/// Convert JS TelemetryConfig to Rust TelemetryConfig
impl From<TelemetryConfig> for RustTelemetryConfig {
  fn from(config: TelemetryConfig) -> Self {
    let mut result = RustTelemetryConfig::default();

    if let Some(enabled) = config.enabled {
      result.enabled = enabled;
    }

    if let Some(port) = config.websocket_port {
      result.websocket_port = Some(port as u16);
    }

    if let Some(console_output) = config.console_output {
      result.console_output = console_output;
    }

    if let Some(log_limit) = config.log_limit {
      result.log_limit = log_limit as usize;
    }

    if let Some(measure_performance) = config.measure_performance {
      result.measure_performance = measure_performance;
    }

    if let Some(record_state_size) = config.record_state_size {
      result.record_state_size = record_state_size;
    }

    if let Some(record_state_delta) = config.record_state_delta {
      result.record_state_delta = record_state_delta;
    }

    if let Some(pretty_print) = config.pretty_print {
      result.pretty_print = pretty_print;
    }

    if let Some(verbose) = config.verbose {
      result.verbose = verbose;
    }

    // Handle performance config if present
    if let Some(perf) = config.performance {
      // We can't directly access the performance struct fields using module path
      // because the telemetry module is private, so we need to use the metadata approach
      let mut perf_map = std::collections::HashMap::new();
      
      if let Some(enabled) = perf.enabled {
        // Set the performance.enabled field directly (this one is accessible)
        result.performance.enabled = enabled;
        perf_map.insert("enabled".to_string(), serde_json::json!(enabled));
      }
      
      if let Some(detail) = &perf.detail {
        // We'll use the metadata approach for the detail field since we can't access the enum directly
        perf_map.insert("detail".to_string(), serde_json::json!(detail));
      }
      
      if let Some(include_in_logs) = perf.include_in_logs {
        // Set the field directly
        result.performance.include_in_logs = include_in_logs;
        perf_map.insert("include_in_logs".to_string(), serde_json::json!(include_in_logs));
      }
      
      if let Some(record_timings) = perf.record_timings {
        // Set the field directly
        result.performance.record_timings = record_timings;
        perf_map.insert("record_timings".to_string(), serde_json::json!(record_timings));
      }
      
      if let Some(verbose_output) = perf.verbose_output {
        // Set the field directly
        result.performance.verbose_output = verbose_output;
        perf_map.insert("verbose_output".to_string(), serde_json::json!(verbose_output));
      }
      
      // Add the performance_config to metadata for the internal interpretation
      result.metadata.insert("performance_config".to_string(), serde_json::json!(perf_map));
    }

    result
  }
}

/// Convert JS ZubridgeMiddlewareConfig to Rust ZubridgeMiddlewareConfig
impl From<ZubridgeMiddlewareConfig> for RustZubridgeMiddlewareConfig {
  fn from(config: ZubridgeMiddlewareConfig) -> Self {
    let mut result = RustZubridgeMiddlewareConfig::default();

    if let Some(telemetry) = config.telemetry {
      result.telemetry = RustTelemetryConfig::from(telemetry);
    }

    result
  }
}

/// Wrapper for Rust ZubridgeMiddleware to expose to JS
#[napi]
pub struct ZubridgeMiddleware {
  inner: Arc<RustZubridgeMiddleware>,
}

#[napi]
impl ZubridgeMiddleware {
  #[napi]
  pub async fn process_action(&self, action: Action) -> Result<()> {
    // Convert payload string to JSON if present
    let payload = if let Some(json_str) = action.payload {
      match serde_json::from_str(&json_str) {
        Ok(value) => Some(value),
        Err(e) => return Err(Error::from_reason(format!("Failed to parse action payload: {}", e))),
      }
    } else {
      None
    };

    // Create Rust action
    let rust_action = RustAction {
      action_type: action.r#type,
      payload,
      id: action.id,
      source_window_id: action.source_window_id,
    };

    // Process the action
    self.inner.process_action(rust_action)
      .await
      .map_err(|e| Error::from_reason(format!("Failed to process action: {}", e)))
  }

  #[napi]
  pub async fn get_state(&self) -> Result<String> {
    // Get state
    let state = self.inner.get_state().await;

    // Serialize to JSON string
    serde_json::to_string(&state)
      .map_err(|e| Error::from_reason(format!("Failed to serialize state: {}", e)))
  }

  #[napi]
  pub async fn set_state(&self, state_json: String) -> Result<()> {
    // Parse JSON string
    let state = serde_json::from_str(&state_json)
      .map_err(|e| Error::from_reason(format!("Failed to parse state JSON: {}", e)))?;

    // Set state
    self.inner.set_state(state)
      .await
      .map_err(|e| Error::from_reason(format!("Failed to set state: {}", e)))
  }
  
  #[napi]
  pub async fn track_action_dispatch(&self, action: Action) -> Result<()> {
    // Convert payload string to JSON if present
    let payload = if let Some(json_str) = action.payload {
      match serde_json::from_str(&json_str) {
        Ok(value) => Some(value),
        Err(e) => return Err(Error::from_reason(format!("Failed to parse action payload: {}", e))),
      }
    } else {
      None
    };

    // Create Rust action
    let rust_action = RustAction {
      action_type: action.r#type,
      payload,
      id: action.id,
      source_window_id: action.source_window_id,
    };
    
    // Track the action dispatch
    for middleware in &self.inner.middlewares {
      middleware.record_action_dispatch(&rust_action).await;
    }
    
    Ok(())
  }
  
  #[napi]
  pub async fn track_action_received(&self, action: Action) -> Result<()> {
    // Convert payload string to JSON if present
    let payload = if let Some(json_str) = action.payload {
      match serde_json::from_str(&json_str) {
        Ok(value) => Some(value),
        Err(e) => return Err(Error::from_reason(format!("Failed to parse action payload: {}", e))),
      }
    } else {
      None
    };

    // Create Rust action
    let rust_action = RustAction {
      action_type: action.r#type,
      payload,
      id: action.id,
      source_window_id: action.source_window_id,
    };
    
    // Track the action received in main process
    for middleware in &self.inner.middlewares {
      middleware.record_action_received(&rust_action).await;
    }
    
    Ok(())
  }
  
  #[napi]
  pub async fn track_state_update(&self, action: Action, state_json: String) -> Result<()> {
    // Convert payload string to JSON if present
    let payload = if let Some(json_str) = action.payload {
      match serde_json::from_str(&json_str) {
        Ok(value) => Some(value),
        Err(e) => return Err(Error::from_reason(format!("Failed to parse action payload: {}", e))),
      }
    } else {
      None
    };

    // Create Rust action
    let rust_action = RustAction {
      action_type: action.r#type,
      payload,
      id: action.id,
      source_window_id: action.source_window_id,
    };
    
    // Parse the state JSON
    let state = serde_json::from_str(&state_json)
      .map_err(|e| Error::from_reason(format!("Failed to parse state JSON: {}", e)))?;
    
    // Track the state update
    for middleware in &self.inner.middlewares {
      middleware.record_state_update(&rust_action, &state).await;
    }
    
    Ok(())
  }
  
  #[napi]
  pub async fn track_action_acknowledged(&self, action_id: String) -> Result<()> {
    // Track the action acknowledged
    for middleware in &self.inner.middlewares {
      middleware.record_action_acknowledgement(&action_id).await;
    }
    
    Ok(())
  }
}

#[napi]
pub fn init_zubridge_middleware(config: Option<ZubridgeMiddlewareConfig>) -> ZubridgeMiddleware {
  // Create default config if none provided
  let rust_config = if let Some(js_config) = config {
    RustZubridgeMiddlewareConfig::from(js_config)
  } else {
    RustZubridgeMiddlewareConfig::default()
  };
  
  // Initialize middleware
  let middleware = zubridge_middleware::init_middleware(rust_config);
  
  // Wrap in our JS-friendly wrapper
  ZubridgeMiddleware {
    inner: Arc::new(middleware),
  }
}
