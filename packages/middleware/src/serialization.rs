//! Serialization utilities for Zubridge
//!
//! This module provides serialization helpers for converting data
//! between different formats and ensuring consistent numeric values.

use serde::{Serialize, Deserialize};
use serde_json;
use log;

use crate::error::{Error, Result};

/// Available serialization formats
#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq)]
pub enum Format {
    /// JSON format - more human-readable, compatible with browsers
    Json,
    /// MessagePack format - more efficient binary format
    MessagePack,
}

impl Default for Format {
    fn default() -> Self {
        Self::Json
    }
}

/// Serialize data according to the specified format
pub fn serialize<T: Serialize>(data: &T, format: &Format) -> Result<(String, Vec<u8>)> {
    match format {
        Format::Json => {
            // First convert to a Value to verify/fix numeric values
            let mut value = serde_json::to_value(data).map_err(Error::Json)?;
            
            // Special handling for performance metrics to ensure they're always numeric
            if let Some(obj) = value.as_object_mut() {
                // Process any objects that might contain metrics
                ensure_numeric_metrics(obj);
                
                // Handle arrays of log entries
                if let Some(entries) = obj.get_mut("entries").and_then(|e| e.as_array_mut()) {
                    for entry in entries {
                        if let Some(entry_obj) = entry.as_object_mut() {
                            ensure_numeric_metrics(entry_obj);
                        }
                    }
                }
            } else if let Some(entries) = value.as_array_mut() {
                // Handle arrays directly
                for entry in entries {
                    if let Some(entry_obj) = entry.as_object_mut() {
                        ensure_numeric_metrics(entry_obj);
                    }
                }
            }
            
            // Serialize with robust error handling
            let json_str = match serde_json::to_string(&value) {
                Ok(s) => s,
                Err(e) => {
                    log::error!("Error serializing to JSON: {}", e);
                    // Fallback: try to serialize the original data directly
                    serde_json::to_string(data).map_err(Error::Json)?
                }
            };
            
            // Final verification of numeric values
            let debug_contains_metrics = json_str.contains("processing_metrics");
            let debug_contains_total_ms_string = json_str.contains("\"total_ms\":\"");
            let debug_contains_total_ms_number = json_str.contains("\"total_ms\":");
            
            if debug_contains_metrics {
                if debug_contains_total_ms_string {
                    log::warn!("WARNING: Serialized JSON still contains total_ms as string despite numeric conversion");
                } else if debug_contains_total_ms_number {
                    log::debug!("Serialized JSON contains total_ms as number (good)");
                }
            }
            
            Ok(("json".to_string(), json_str.into_bytes()))
        },
        Format::MessagePack => {
            let binary = rmp_serde::to_vec(data).map_err(Error::MessagePack)?;
            Ok(("messagepack".to_string(), binary))
        }
    }
}

/// Helper method to ensure performance metrics are always numeric values
pub fn ensure_numeric_metrics(obj: &mut serde_json::Map<String, serde_json::Value>) {
    // Check for processing_metrics field
    if let Some(metrics) = obj.get_mut("processing_metrics") {
        if let Some(metrics_obj) = metrics.as_object_mut() {
            // Process all potential metric fields
            for field in ["total_ms", "deserialization_ms", "action_processing_ms", "state_update_ms", "serialization_ms"] {
                if let Some(value) = metrics_obj.get_mut(field) {
                    // Convert string to number if needed
                    if value.is_string() {
                        if let Some(str_val) = value.as_str() {
                            if let Ok(num) = str_val.parse::<f64>() {
                                *value = serde_json::Value::Number(
                                    serde_json::Number::from_f64(num).unwrap_or(serde_json::Number::from(0))
                                );
                                log::debug!("Converted {} from string to number: {}", field, num);
                            }
                        }
                    }
                    // Also check for potential integer values that should be float
                    else if let Some(int_val) = value.as_i64() {
                        let float_val = int_val as f64;
                        *value = serde_json::Value::Number(
                            serde_json::Number::from_f64(float_val).unwrap_or(serde_json::Number::from(int_val))
                        );
                    }
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::metrics::Metrics;
    use crate::telemetry::TelemetryEntry;
    use chrono::Utc;
    use serde_json::json;

    #[test]
    fn test_numeric_value_preservation() {
        // Create test metrics
        let metrics = Metrics {
            total_ms: 15.5,
            deserialization_ms: Some(2.0),
            action_processing_ms: Some(10.0),
            state_update_ms: Some(3.0),
            serialization_ms: Some(0.5),
        };

        // Serialize metrics
        let (_, json_bytes) = serialize(&metrics, &Format::Json).unwrap();
        let json_str = String::from_utf8(json_bytes).unwrap();

        // Verify the serialized output contains numeric values
        assert!(json_str.contains("\"total_ms\":15.5"), "total_ms should be serialized as a number");
        assert!(json_str.contains("\"deserialization_ms\":2.0"), "deserialization_ms should be serialized as a number");
        assert!(!json_str.contains("\"total_ms\":\"15.5\""), "total_ms should not be serialized as a string");
    }

    #[test]
    fn test_string_to_number_conversion() {
        // Create metrics with string values
        let mut value = json!({
            "processing_metrics": {
                "total_ms": "15.5",
                "deserialization_ms": "2.0" 
            }
        });

        if let Some(obj) = value.as_object_mut() {
            ensure_numeric_metrics(obj);
        }

        // Serialize and check conversion
        let (_, json_bytes) = serialize(&value, &Format::Json).unwrap();
        let json_str = String::from_utf8(json_bytes).unwrap();
        
        // Check if values were properly converted to numbers
        assert!(!json_str.contains("\"total_ms\":\"15.5\""), "String total_ms should be converted to number");
        assert!(!json_str.contains("\"deserialization_ms\":\"2.0\""), "String deserialization_ms should be converted to number");
        assert!(json_str.contains("\"total_ms\":15.5"), "total_ms should be converted to a number");
    }
} 