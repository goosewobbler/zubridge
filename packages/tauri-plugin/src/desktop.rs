use serde::de::DeserializeOwned;
use std::sync::{Arc, Mutex};
use tauri::{plugin::PluginApi, AppHandle, Runtime, Manager, Emitter};

use crate::models::*;

pub fn init<R: Runtime, C: DeserializeOwned>(
  app: &AppHandle<R>,
  _api: PluginApi<R, C>,
) -> crate::Result<Zubridge<R>> {
  // Initialize with default options
  let options = ZubridgeOptions::default();

  // Create the Zubridge struct with app handle and options
  Ok(Zubridge {
    app: app.clone(),
    options,
  })
}

/// Access to the zubridge APIs.
pub struct Zubridge<R: Runtime> {
  app: AppHandle<R>,
  options: ZubridgeOptions,
}

impl<R: Runtime> Zubridge<R> {
  /// Get the event name used for state updates
  pub fn get_event_name(&self) -> String {
    self.options.event_name.clone()
  }

  /// Get the initial state from the state manager
  pub fn get_initial_state(&self) -> crate::Result<JsonValue> {
    if let Some(state_manager) = self.app.try_state::<Arc<Mutex<dyn StateManager>>>() {
      let state_guard = state_manager.inner().lock().map_err(|e| crate::Error::StateError(e.to_string()))?;
      let initial_state = state_guard.get_initial_state();
      Ok(initial_state)
    } else {
      Err(crate::Error::StateError("StateManager not found in app state".into()))
    }
  }

  /// Dispatch an action to the state manager and emit the updated state
  pub fn dispatch_action(&self, action: ZubridgeAction) -> crate::Result<JsonValue> {
    // Convert the action to JSON
    let action_json = serde_json::json!({
      "type": action.action_type,
      "payload": action.payload
    });

    // Get the state manager from app state
    if let Some(state_manager) = self.app.try_state::<Arc<Mutex<dyn StateManager>>>() {
      // Lock the mutex to get mutable access to the state manager
      let mut state_guard = state_manager.inner().lock().map_err(|e| crate::Error::StateError(e.to_string()))?;
      let updated_state = state_guard.dispatch_action(action_json);

      // Drop the lock before emitting events
      drop(state_guard);

      // Emit state update event
      self.app
        .emit(&self.options.event_name, updated_state.clone())
        .map_err(|err| crate::Error::EmitError(err.to_string()))?;

      Ok(updated_state)
    } else {
      Err(crate::Error::StateError("StateManager not found in app state".into()))
    }
  }

  /// Set the options for the plugin
  pub fn set_options(&mut self, options: ZubridgeOptions) {
    self.options = options;
  }

  /// Register a state manager
  pub fn register_state_manager<S: StateManager>(&self, state_manager: S) -> crate::Result<()> {
    let state_arc: Arc<Mutex<dyn StateManager>> = Arc::new(Mutex::new(state_manager));
    self.app.manage(state_arc);
    Ok(())
  }
}
