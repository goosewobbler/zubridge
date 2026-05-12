use thiserror::Error;

#[derive(Debug, Error)]
pub enum ZubridgeError {
    #[error("state error: {0}")]
    StateError(String),
    #[error("action processing error: {0}")]
    ActionProcessing(String),
    #[error("state manager missing")]
    StateManagerMissing,
    #[error("thunk not found: {thunk_id}")]
    ThunkNotFound { thunk_id: String },
    #[error("thunk registration failed for {thunk_id}: {message}")]
    ThunkRegistration { thunk_id: String, message: String },
    #[error("subscription error for {source_label}: {message}")]
    Subscription { source_label: String, message: String },
    #[error("emit error: {0}")]
    EmitError(String),
    #[error("serialization error: {0}")]
    Serialization(String),
}

pub type Result<T> = std::result::Result<T, ZubridgeError>;
