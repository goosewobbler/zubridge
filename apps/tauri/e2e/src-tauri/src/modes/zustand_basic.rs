//! Mirrors `apps/electron/e2e/src/modes/zustand-basic` - in the JS fixture
//! handlers are attached directly to a Zustand state object. Translated to
//! Rust this becomes a single `BasicStore` struct that mutates its
//! `BaseState` in-place when an action arrives.

use std::sync::Mutex;

use serde_json::Value;
use tauri_plugin_zubridge::StateManager;

use crate::features::{counter, state::BaseState, theme::Theme};
use crate::store::{error_envelope, filler_for, AppAction};

const LOG_TAG: &str = "[Basic]";

pub struct BasicStore {
    state: Mutex<BaseState>,
}

impl BasicStore {
    pub fn new() -> Self {
        Self {
            state: Mutex::new(BaseState::initial()),
        }
    }

    fn apply(&self, action: AppAction) -> Result<BaseState, crate::features::error::ActionError> {
        let mut guard = self
            .state
            .lock()
            .expect("BasicStore mutex should not be poisoned");
        match action {
            AppAction::CounterIncrement => {
                println!("{} Incrementing counter", LOG_TAG);
                counter::increment(&mut guard);
            }
            AppAction::CounterDecrement => {
                println!("{} Decrementing counter", LOG_TAG);
                counter::decrement(&mut guard);
            }
            AppAction::CounterSet(value) => {
                println!("{} Setting counter to {}", LOG_TAG, value);
                counter::set(&mut guard, value);
            }
            AppAction::CounterDouble => {
                println!("{} Doubling counter", LOG_TAG);
                counter::double(&mut guard);
            }
            AppAction::CounterHalve => {
                println!("{} Halving counter", LOG_TAG);
                counter::halve(&mut guard);
            }
            AppAction::CounterReset => {
                println!("{} Resetting counter", LOG_TAG);
                counter::set(&mut guard, 0);
            }
            AppAction::ThemeToggle => {
                println!("{} Toggling theme", LOG_TAG);
                guard.theme = guard.theme.toggle();
            }
            AppAction::ThemeSet(is_dark) => {
                println!("{} Setting theme is_dark={}", LOG_TAG, is_dark);
                guard.theme = Theme::from_is_dark(is_dark);
            }
            AppAction::StateReset => {
                println!("{} Resetting state to defaults", LOG_TAG);
                *guard = BaseState::initial();
            }
            AppAction::StateGenerateFiller(variant) => {
                println!("{} Generating filler ({:?})", LOG_TAG, variant);
                guard.filler = Some(filler_for(variant));
            }
            AppAction::ErrorTriggerMainProcessError => {
                println!("{} Triggering main process error", LOG_TAG);
                return Err(crate::features::error::trigger_main_process_error());
            }
        }
        Ok(guard.clone())
    }

    fn snapshot(&self) -> BaseState {
        self.state
            .lock()
            .expect("BasicStore mutex should not be poisoned")
            .clone()
    }
}

impl Default for BasicStore {
    fn default() -> Self {
        Self::new()
    }
}

impl StateManager for BasicStore {
    fn get_initial_state(&self) -> Value {
        serde_json::to_value(self.snapshot()).unwrap_or(Value::Null)
    }

    fn dispatch_action(&mut self, action: Value) -> Value {
        match AppAction::parse(&action) {
            Ok(parsed) => match self.apply(parsed) {
                Ok(new_state) => serde_json::to_value(new_state).unwrap_or(Value::Null),
                Err(error) => error_envelope(&self.snapshot(), &error),
            },
            Err(error) => error_envelope(&self.snapshot(), &error),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn dispatch_increment_increments_state() {
        let mut store = BasicStore::new();
        let result = store.dispatch_action(json!({ "type": "COUNTER:INCREMENT" }));
        assert_eq!(result.get("counter").and_then(Value::as_i64), Some(1));
    }

    #[test]
    fn dispatch_unknown_returns_error_envelope() {
        let mut store = BasicStore::new();
        let result = store.dispatch_action(json!({ "type": "MYSTERY" }));
        assert_eq!(result.get("success").and_then(Value::as_bool), Some(false));
        assert!(result
            .get("error")
            .and_then(Value::as_str)
            .unwrap_or("")
            .contains("Unknown action"));
    }

    #[test]
    fn theme_toggle_flips_state() {
        let mut store = BasicStore::new();
        let after_toggle = store.dispatch_action(json!({ "type": "THEME:TOGGLE" }));
        assert_eq!(
            after_toggle.get("theme").and_then(Value::as_str),
            Some("light")
        );
    }
}
