use serde::{Deserialize};
use std::fmt::Debug;

pub use serde_json::Value as JsonValue;

/// An action to be dispatched to the state manager.
#[derive(Deserialize, Debug)]
pub struct ZubridgeAction {
    /// A string label for the action
    pub action_type: String,
    /// An optional payload for the action
    pub payload: Option<JsonValue>,
}

/// Options for the Zubridge plugin.
#[derive(Clone)]
pub struct ZubridgeOptions {
    /// The event name to use for state updates. Defaults to "zubridge://state-update".
    pub event_name: String,
}

impl Default for ZubridgeOptions {
    fn default() -> Self {
        Self {
            event_name: "zubridge://state-update".to_string(),
        }
    }
}

/// A trait that manages state for the app.
pub trait StateManager: Send + Sync + 'static {
    /// Get the initial state of the app.
    fn get_initial_state(&self) -> JsonValue;

    /// Apply an action to the state and return the new state.
    fn dispatch_action(&mut self, action: JsonValue) -> JsonValue;
}
