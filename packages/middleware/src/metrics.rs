//! Performance metrics collection and reporting
//!
//! This module provides functionality for measuring and analyzing performance
//! of action processing and state updates.

use std::time::{SystemTime, UNIX_EPOCH};

use log::warn;
use serde::{Deserialize, Serialize};

use crate::{Context, PerformanceTransaction, Result};

/// Detail level for performance metrics
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum DetailLevel {
    /// Basic metrics (total time only)
    Low,
    /// Medium detail (total time + main phases)
    Medium,
    /// High detail (all available metrics)
    High,
}

impl Default for DetailLevel {
    fn default() -> Self {
        Self::Medium
    }
}

/// Performance metrics configuration
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Config {
    /// Whether performance measurement is enabled
    #[serde(default = "default_true")]
    pub enabled: bool,
    
    /// Level of detail for performance metrics
    #[serde(default)]
    pub detail: DetailLevel,
    
    /// Whether to include performance metrics in logs
    #[serde(default = "default_true")]
    pub include_in_logs: bool,
    
    /// Whether to record detailed timing metrics
    #[serde(default = "default_true")]
    pub record_timings: bool,
    
    /// Whether to output verbose performance details
    #[serde(default = "default_false")]
    pub verbose_output: bool,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            enabled: true,
            detail: DetailLevel::default(),
            include_in_logs: true,
            record_timings: true,
            verbose_output: false,
        }
    }
}

/// Performance metrics for action and state processing
///
/// To populate these metrics, add the following metadata to the Context object:
/// - `processing_time_ms`: Required - total processing time
/// - `deserialization_time_ms`: Time spent deserializing the action
/// - `action_processing_time_ms`: Time spent in business logic
/// - `state_update_time_ms`: Time spent updating the state
/// - `serialization_time_ms`: Time spent serializing the response
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Metrics {
    /// Total processing time in milliseconds
    pub total_ms: f64,

    /// Time spent deserializing the action in milliseconds
    #[serde(skip_serializing_if = "Option::is_none")]
    pub deserialization_ms: Option<f64>,

    /// Time spent processing the action in milliseconds
    #[serde(skip_serializing_if = "Option::is_none")]
    pub action_processing_ms: Option<f64>,

    /// Time spent updating the state in milliseconds
    #[serde(skip_serializing_if = "Option::is_none")]
    pub state_update_ms: Option<f64>,

    /// Time spent serializing the response in milliseconds
    #[serde(skip_serializing_if = "Option::is_none")]
    pub serialization_ms: Option<f64>,
}

/// Calculate metrics from transaction data with improved error handling
pub fn calculate_from_transaction(transaction: &PerformanceTransaction) -> Result<Option<Metrics>> {
    // Check for required timestamps
    let ack_timestamp = match transaction.acknowledge_timestamp {
        Some(ts) => ts,
        None => {
            warn!("Missing acknowledgement timestamp for transaction");
            return Ok(None);
        }
    };
    
    let receive_timestamp = match transaction.receive_timestamp {
        Some(ts) => ts,
        None => {
            warn!("Missing receive timestamp for transaction");
            return Ok(None);
        }
    };
    
    // Check for potential integer overflow or other calculation issues
    let dispatch_timestamp = transaction.dispatch_timestamp;
    
    // Verify timestamps are in logical order
    if ack_timestamp < dispatch_timestamp {
        warn!("Invalid timestamp order: ack ({}) before dispatch ({})", 
              ack_timestamp, dispatch_timestamp);
        return Ok(None);
    }
    
    if receive_timestamp < dispatch_timestamp {
        warn!("Invalid timestamp order: receive ({}) before dispatch ({})", 
              receive_timestamp, dispatch_timestamp);
        return Ok(None);
    }
    
    // Calculate timing metrics with safety checks
    let dispatch_to_receive = (receive_timestamp as f64 - dispatch_timestamp as f64) / 1_000_000.0;
    
    let receive_to_update = transaction.state_update_timestamp
        .map(|update_timestamp| {
            // Check for logical ordering
            if update_timestamp < receive_timestamp {
                warn!("Invalid timestamp order: update ({}) before receive ({})",
                     update_timestamp, receive_timestamp);
                0.0
            } else {
                (update_timestamp as f64 - receive_timestamp as f64) / 1_000_000.0
            }
        })
        .unwrap_or(0.0);
        
    let update_to_ack = transaction.state_update_timestamp
        .map(|update_timestamp| {
            // Check for logical ordering
            if ack_timestamp < update_timestamp {
                warn!("Invalid timestamp order: ack ({}) before update ({})",
                     ack_timestamp, update_timestamp);
                0.0
            } else {
                (ack_timestamp as f64 - update_timestamp as f64) / 1_000_000.0
            }
        })
        .unwrap_or_else(|| (ack_timestamp as f64 - receive_timestamp as f64) / 1_000_000.0);
        
    let total_time = (ack_timestamp as f64 - dispatch_timestamp as f64) / 1_000_000.0;
    
    // Validate calculated times
    if total_time < 0.0 || dispatch_to_receive < 0.0 || receive_to_update < 0.0 || update_to_ack < 0.0 {
        warn!("Negative time calculated for transaction, timestamps may be invalid");
        return Ok(None);
    }
    
    Ok(Some(Metrics {
        total_ms: total_time,
        deserialization_ms: Some(dispatch_to_receive),
        action_processing_ms: Some(receive_to_update),
        state_update_ms: Some(update_to_ack),
        serialization_ms: None,
    }))
}

/// Extract metrics from a context object
pub fn extract_from_context(ctx: &Context, config: &Config) -> Option<Metrics> {
    // Skip if performance measurement is disabled
    if !config.enabled {
        return None;
    }

    // Helper function to extract f64 value from JsonValue
    let extract_f64 = |value: &serde_json::Value| -> Option<f64> {
        if let Some(num) = value.as_f64() {
            return Some(num);
        } else if let Some(str_val) = value.as_str() {
            // Try to parse string as f64
            if let Ok(num) = str_val.parse::<f64>() {
                return Some(num);
            }
        } else if let Some(int) = value.as_i64() {
            return Some(int as f64);
        } else if let Some(uint) = value.as_u64() {
            return Some(uint as f64);
        }
        None
    };
    
    // Look for processing time first or calculate from start_time
    let total_ms = match ctx.metadata.get("processing_time_ms") {
        Some(time_value) => {
            if let Some(time) = extract_f64(time_value) {
                time
            } else {
                // Calculate from start_time if available
                if let Some(start_time) = ctx.start_time {
                    let end_time = SystemTime::now()
                        .duration_since(UNIX_EPOCH)
                        .map(|d| d.as_nanos())
                        .unwrap_or(0);
                    let elapsed_nanos = end_time - start_time;
                    elapsed_nanos as f64 / 1_000_000.0
                } else {
                    return None; // No valid timing information
                }
            }
        }
        None => {
            // Also try the deprecated name for compatibility
            match ctx.metadata.get("total_ms") {
                Some(time_value) => {
                    if let Some(time) = extract_f64(time_value) {
                        time
                    } else {
                        // Calculate from start_time if available
                        if let Some(start_time) = ctx.start_time {
                            let end_time = SystemTime::now()
                                .duration_since(UNIX_EPOCH)
                                .map(|d| d.as_nanos())
                                .unwrap_or(0);
                            let elapsed_nanos = end_time - start_time;
                            elapsed_nanos as f64 / 1_000_000.0
                        } else {
                            return None; // No valid timing information
                        }
                    }
                }
                None => {
                    // If we have a start_time, calculate the elapsed time
                    if let Some(start_time) = ctx.start_time {
                        let end_time = SystemTime::now()
                            .duration_since(UNIX_EPOCH)
                            .map(|d| d.as_nanos())
                            .unwrap_or(0);
                        let elapsed_nanos = end_time - start_time;
                        elapsed_nanos as f64 / 1_000_000.0
                    } else {
                        return None; // No timing information
                    }
                }
            }
        }
    };

    // For low detail level, only return the total time
    if config.detail == DetailLevel::Low {
        return Some(Metrics {
            total_ms,
            deserialization_ms: None,
            action_processing_ms: None,
            state_update_ms: None,
            serialization_ms: None,
        });
    }

    // Extract optional metrics based on detail level
    let deserialization_ms = if config.detail != DetailLevel::Low {
        ctx.metadata
            .get("deserialization_time_ms")
            .and_then(extract_f64)
            .or_else(|| ctx.metadata.get("deserialization_ms").and_then(extract_f64))
    } else {
        None
    };

    let action_processing_ms = if config.detail != DetailLevel::Low {
        ctx.metadata
            .get("action_processing_time_ms")
            .and_then(extract_f64)
            .or_else(|| ctx.metadata.get("action_ms").and_then(extract_f64))
    } else {
        None
    };

    let state_update_ms = if config.detail != DetailLevel::Low {
        ctx.metadata
            .get("state_update_time_ms")
            .and_then(extract_f64)
            .or_else(|| ctx.metadata.get("state_ms").and_then(extract_f64))
    } else {
        None
    };

    let serialization_ms = if config.detail == DetailLevel::High {
        ctx.metadata
            .get("serialization_time_ms")
            .and_then(extract_f64)
            .or_else(|| ctx.metadata.get("serialization_ms").and_then(extract_f64))
    } else {
        None
    };

    Some(Metrics {
        total_ms,
        deserialization_ms,
        action_processing_ms,
        state_update_ms,
        serialization_ms,
    })
}

// Helper functions for default values in derives
fn default_true() -> bool {
    true
}

fn default_false() -> bool {
    false
} 
 