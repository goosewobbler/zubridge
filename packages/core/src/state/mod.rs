use std::sync::{Arc, Mutex};

use crate::error::{Result, ZubridgeError};
use crate::models::{JsonValue, StateManager};

/// Thread-safe handle to a [`StateManager`] implementation.
pub type StateManagerHandle = Arc<Mutex<dyn StateManager>>;

/// Wrap a concrete state manager in a thread-safe handle.
pub fn new_handle<S: StateManager>(state_manager: S) -> StateManagerHandle {
    Arc::new(Mutex::new(state_manager))
}

/// Apply an action via the supplied state manager. Returns the new state.
pub fn dispatch(handle: &StateManagerHandle, action: JsonValue) -> Result<JsonValue> {
    let mut guard = handle
        .lock()
        .map_err(|e| ZubridgeError::StateError(e.to_string()))?;
    Ok(guard.dispatch_action(action))
}

/// Read the current state via the supplied state manager.
pub fn read_state(handle: &StateManagerHandle) -> Result<JsonValue> {
    let guard = handle
        .lock()
        .map_err(|e| ZubridgeError::StateError(e.to_string()))?;
    Ok(guard.get_initial_state())
}
