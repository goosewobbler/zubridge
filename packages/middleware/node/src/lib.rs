#![deny(clippy::all)]

use std::sync::Arc;

use napi_derive::napi;
use napi::bindgen_prelude::*;
use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;

// Re-export the types we need from the middleware crate
use zubridge_middleware::{
  ZubridgeMiddleware as RustZubridgeMiddleware,
  ZubridgeMiddlewareConfig as RustZubridgeMiddlewareConfig,
  LoggingConfig as RustLoggingConfig,
  Action as RustAction,
  Error as RustError,
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
  pub payload: Option<Unknown>,
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

/// Convert JS Action to Rust Action
impl TryFrom<Action> for RustAction {
  type Error = napi::Error;

  fn try_from(action: Action) -> Result<Self> {
    let payload = match action.payload {
      Some(unknown) => {
        let json: JsonValue = serde_json::from_str(&unknown.to_string()?)?;
        Some(json)
      },
      None => None,
    };

    Ok(RustAction {
      action_type: action.r#type,
      payload,
    })
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
    let rust_action = RustAction::try_from(action)?;

    self.inner.process_action(rust_action)
      .await
      .map_err(|e| napi::Error::from_reason(format!("Failed to process action: {}", e)))?;

    Ok(())
  }

  #[napi]
  pub async fn get_state(&self) -> Result<Unknown> {
    let state = self.inner.get_state()
      .await;

    let json_str = serde_json::to_string(&state)
      .map_err(|e| napi::Error::from_reason(format!("Failed to serialize state: {}", e)))?;

    Ok(Unknown::from_json(&json_str)?)
  }

  #[napi]
  pub async fn set_state(&self, state: Unknown) -> Result<()> {
    let json_str = state.to_string()?;
    let json_value: JsonValue = serde_json::from_str(&json_str)
      .map_err(|e| napi::Error::from_reason(format!("Failed to parse state: {}", e)))?;

    self.inner.set_state(json_value)
      .await
      .map_err(|e| napi::Error::from_reason(format!("Failed to set state: {}", e)))?;

    Ok(())
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
