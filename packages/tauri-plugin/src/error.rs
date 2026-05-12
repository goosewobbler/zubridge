use serde::{ser::Serializer, Serialize};

pub type Result<T> = std::result::Result<T, Error>;

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error(transparent)]
    Io(#[from] std::io::Error),

    #[cfg(mobile)]
    #[error(transparent)]
    PluginInvoke(#[from] tauri::plugin::mobile::PluginInvokeError),

    #[error("State error: {0}")]
    StateError(String),

    #[error("Event emission error: {0}")]
    EmitError(String),

    #[error("Serialization error: {0}")]
    SerializationError(String),

    #[error("Action processing failed for action {action_id:?}: {message}")]
    ActionProcessing {
        action_id: Option<String>,
        message: String,
    },

    #[error("Action queue overflow ({queue_size}/{max_size})")]
    QueueOverflow {
        queue_size: usize,
        max_size: usize,
    },

    #[error("Subscription error for {source_label}: {message}")]
    Subscription {
        source_label: String,
        message: String,
    },

    #[error("Thunk registration failed for {thunk_id}: {message}")]
    ThunkRegistration {
        thunk_id: String,
        message: String,
    },

    #[error("Thunk not found: {thunk_id}")]
    ThunkNotFound {
        thunk_id: String,
    },

    #[error("State manager not registered")]
    StateManagerMissing,
}

impl From<zubridge_core::ZubridgeError> for Error {
    fn from(err: zubridge_core::ZubridgeError) -> Self {
        use zubridge_core::ZubridgeError as Z;
        match err {
            Z::StateError(msg) => Error::StateError(msg),
            Z::ActionProcessing(msg) => Error::ActionProcessing {
                action_id: None,
                message: msg,
            },
            Z::StateManagerMissing => Error::StateManagerMissing,
            Z::ThunkNotFound { thunk_id } => Error::ThunkNotFound { thunk_id },
            Z::ThunkRegistration { thunk_id, message } => {
                Error::ThunkRegistration { thunk_id, message }
            }
            Z::Subscription { source_label, message } => {
                Error::Subscription { source_label, message }
            }
            Z::EmitError(msg) => Error::EmitError(msg),
            Z::Serialization(msg) => Error::SerializationError(msg),
        }
    }
}

impl Serialize for Error {
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_str(self.to_string().as_ref())
    }
}
