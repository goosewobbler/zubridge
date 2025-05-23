#![deny(clippy::all)]

use std::sync::Arc;

use napi_derive::napi;
use napi::bindgen_prelude::*;

// Re-export the types we need from the middleware crate
use zubridge_middleware::{
  ZubridgeMiddleware as RustZubridgeMiddleware,
  ZubridgeMiddlewareConfig as RustZubridgeMiddlewareConfig,
  LoggingConfig as RustLoggingConfig,
  Action as RustAction,
};

#[napi(object)]
pub struct LoggingConfig {
  pub enabled: Option<bool>,
  pub websocket_port: Option<u32>,
  pub console_output: Option<bool>,
  pub log_limit: Option<u32>,
  pub measure_performance: Option<bool>,
  pub pretty_print: Option<bool>,
  pub verbose: Option<bool>,
}

#[napi(object)]
pub struct ZubridgeMiddlewareConfig {
  pub logging: Option<LoggingConfig>,
}

#[napi(object)]
pub struct Action {
  pub r#type: String,
  pub payload: Option<String>,
}

/// Convert JS LoggingConfig to Rust LoggingConfig
impl From<LoggingConfig> for RustLoggingConfig {
  fn from(config: LoggingConfig) -> Self {
    let mut result = RustLoggingConfig::default();

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

    if let Some(pretty_print) = config.pretty_print {
      result.pretty_print = pretty_print;
    }

    if let Some(verbose) = config.verbose {
      result.verbose = verbose;
    }

    result
  }
}

/// Convert JS ZubridgeMiddlewareConfig to Rust ZubridgeMiddlewareConfig
impl From<ZubridgeMiddlewareConfig> for RustZubridgeMiddlewareConfig {
  fn from(config: ZubridgeMiddlewareConfig) -> Self {
    let mut result = RustZubridgeMiddlewareConfig::default();

    if let Some(logging) = config.logging {
      result.logging = RustLoggingConfig::from(logging);
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
}

#[napi]
pub fn init_zubridge_middleware(config: Option<ZubridgeMiddlewareConfig>) -> ZubridgeMiddleware {
  let rust_config = match config {
    Some(config) => RustZubridgeMiddlewareConfig::from(config),
    None => RustZubridgeMiddlewareConfig::default(),
  };

  let middleware = zubridge_middleware::init_middleware(rust_config);

  ZubridgeMiddleware {
    inner: Arc::new(middleware),
  }
}
