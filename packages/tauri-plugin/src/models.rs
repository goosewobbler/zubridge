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
///
/// # Contract
///
/// `get_initial_state` **must** always return the current state — i.e. the state
/// that reflects every `dispatch_action` call made so far.  The plugin reads
/// `get_initial_state` after dispatching one or more actions to obtain the
/// authoritative state to emit to the frontend.  If an implementation returns a
/// stale or cached snapshot the emitted state will be inconsistent with what
/// `dispatch_action` actually applied.
pub trait StateManager: Send + Sync + 'static {
    /// Get the current state of the app.
    ///
    /// Must reflect all prior `dispatch_action` calls immediately; returning a
    /// stale snapshot will cause the frontend to receive outdated state.
    fn get_initial_state(&self) -> JsonValue;

    /// Apply an action to the state and return the new state.
    fn dispatch_action(&mut self, action: JsonValue) -> JsonValue;
}
