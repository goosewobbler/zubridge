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
    #[error("thunk registration error: {0}")]
    ThunkRegistration(String),
    #[error("subscription error: {0}")]
    Subscription(String),
    #[error("emit error: {0}")]
    EmitError(String),
    #[error("serialization error: {0}")]
    Serialization(String),
}

pub type Result<T> = std::result::Result<T, ZubridgeError>;
