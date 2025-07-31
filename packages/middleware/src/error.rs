//! Error types for the Zubridge middleware

use thiserror::Error;

/// Result type for Zubridge middleware operations
pub type Result<T> = std::result::Result<T, Error>;

/// Error types that can occur in Zubridge middleware
#[derive(Debug, Error)]
pub enum Error {
    /// Errors related to JSON serialization/deserialization
    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),

    /// Errors related to MessagePack serialization/deserialization
    #[error("MessagePack error: {0}")]
    MessagePack(#[from] rmp_serde::encode::Error),

    /// Errors related to MessagePack deserialization
    #[error("MessagePack decode error: {0}")]
    MessagePackDecode(#[from] rmp_serde::decode::Error),

    /// Errors related to WebSocket operations
    #[error("WebSocket error: {0}")]
    WebSocket(String),

    /// Errors related to IO operations
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    /// Errors related to Tokio runtime
    #[error("Tokio error: {0}")]
    Tokio(#[from] tokio::task::JoinError),
    
    /// Errors related to timestamp operations
    #[error("Timestamp error: {0}")]
    TimestampError(String),
    
    /// Errors related to missing required data
    #[error("Missing data: {0}")]
    MissingData(String),
    
    /// Errors related to transaction handling
    #[error("Transaction error: {0}")]
    TransactionError(String),

    /// Errors related to middleware operations
    #[error("Middleware error: {0}")]
    Middleware(String),

    /// Other errors
    #[error("Unknown error: {0}")]
    Unknown(String),
}
