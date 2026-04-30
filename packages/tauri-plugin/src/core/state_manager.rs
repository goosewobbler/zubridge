use std::sync::{Arc, Mutex};

use crate::models::{JsonValue, StateManager};

/// Thread-safe handle to the user-supplied [`StateManager`] implementation.
pub type StateManagerHandle = Arc<Mutex<dyn StateManager>>;

pub fn new_handle<S: StateManager>(state_manager: S) -> StateManagerHandle {
    Arc::new(Mutex::new(state_manager))
}

/// Apply an action via the supplied state manager. Returns the new state.
pub fn dispatch(
    handle: &StateManagerHandle,
    action: JsonValue,
) -> crate::Result<JsonValue> {
    let mut guard = handle
        .lock()
        .map_err(|e| crate::Error::StateError(e.to_string()))?;
    Ok(guard.dispatch_action(action))
}

/// Read the current state via the supplied state manager.
pub fn read_state(handle: &StateManagerHandle) -> crate::Result<JsonValue> {
    let guard = handle
        .lock()
        .map_err(|e| crate::Error::StateError(e.to_string()))?;
    Ok(guard.get_initial_state())
}
