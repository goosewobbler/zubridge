//! Mirrors `apps/electron/e2e/src/modes/zustand-handlers` - the JS version
//! exposes one handler factory per action and registers them on the store.
//! Here we keep the same flavour: a `HandlerMap` from action label to a boxed
//! closure that mutates the shared state.

use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use serde_json::Value;
use tauri_plugin_zubridge::StateManager;

use crate::features::{
    counter,
    error::{trigger_main_process_error, ActionError},
    state::BaseState,
    theme::Theme,
};
use crate::store::{action_types, error_envelope, filler_for, AppAction};

const LOG_TAG: &str = "[Handlers]";

type Handler = Box<dyn Fn(&mut BaseState, AppAction) -> Result<(), ActionError> + Send + Sync>;

pub struct HandlersStore {
    state: Arc<Mutex<BaseState>>,
    handlers: HashMap<&'static str, Handler>,
}

impl HandlersStore {
    pub fn new() -> Self {
        let mut handlers: HashMap<&'static str, Handler> = HashMap::new();
        handlers.insert(
            action_types::COUNTER_INCREMENT,
            Box::new(|state, _| {
                println!("{} Incrementing counter", LOG_TAG);
                counter::increment(state);
                Ok(())
            }),
        );
        handlers.insert(
            action_types::COUNTER_DECREMENT,
            Box::new(|state, _| {
                println!("{} Decrementing counter", LOG_TAG);
                counter::decrement(state);
                Ok(())
            }),
        );
        handlers.insert(
            action_types::COUNTER_SET,
            Box::new(|state, action| {
                if let AppAction::CounterSet(value) = action {
                    println!("{} Setting counter to {}", LOG_TAG, value);
                    counter::set(state, value);
                }
                Ok(())
            }),
        );
        handlers.insert(
            action_types::COUNTER_DOUBLE,
            Box::new(|state, _| {
                println!("{} Doubling counter", LOG_TAG);
                counter::double(state);
                Ok(())
            }),
        );
        handlers.insert(
            action_types::COUNTER_HALVE,
            Box::new(|state, _| {
                println!("{} Halving counter", LOG_TAG);
                counter::halve(state);
                Ok(())
            }),
        );
        handlers.insert(
            action_types::COUNTER_RESET,
            Box::new(|state, _| {
                println!("{} Resetting counter", LOG_TAG);
                counter::set(state, 0);
                Ok(())
            }),
        );
        handlers.insert(
            action_types::THEME_TOGGLE,
            Box::new(|state, _| {
                println!("{} Toggling theme", LOG_TAG);
                state.theme = state.theme.toggle();
                Ok(())
            }),
        );
        handlers.insert(
            action_types::THEME_SET,
            Box::new(|state, action| {
                if let AppAction::ThemeSet(is_dark) = action {
                    println!("{} Setting theme is_dark={}", LOG_TAG, is_dark);
                    state.theme = Theme::from_is_dark(is_dark);
                }
                Ok(())
            }),
        );
        handlers.insert(
            action_types::STATE_RESET,
            Box::new(|state, _| {
                println!("{} Resetting state", LOG_TAG);
                *state = BaseState::initial();
                Ok(())
            }),
        );
        handlers.insert(
            action_types::STATE_GENERATE_FILLER,
            Box::new(|state, action| {
                if let AppAction::StateGenerateFiller(variant) = action {
                    println!("{} Generating filler ({:?})", LOG_TAG, variant);
                    state.filler = Some(filler_for(variant));
                }
                Ok(())
            }),
        );
        handlers.insert(
            action_types::ERROR_TRIGGER_MAIN_PROCESS_ERROR,
            Box::new(|_, _| Err(trigger_main_process_error())),
        );

        Self {
            state: Arc::new(Mutex::new(BaseState::initial())),
            handlers,
        }
    }

    fn snapshot(&self) -> BaseState {
        self.state
            .lock()
            .expect("HandlersStore mutex should not be poisoned")
            .clone()
    }

    fn handler_key_for(action: &AppAction) -> &'static str {
        match action {
            AppAction::CounterIncrement => action_types::COUNTER_INCREMENT,
            AppAction::CounterDecrement => action_types::COUNTER_DECREMENT,
            AppAction::CounterSet(_) => action_types::COUNTER_SET,
            AppAction::CounterDouble => action_types::COUNTER_DOUBLE,
            AppAction::CounterHalve => action_types::COUNTER_HALVE,
            AppAction::CounterReset => action_types::COUNTER_RESET,
            AppAction::ThemeToggle => action_types::THEME_TOGGLE,
            AppAction::ThemeSet(_) => action_types::THEME_SET,
            AppAction::StateReset => action_types::STATE_RESET,
            AppAction::StateGenerateFiller(_) => action_types::STATE_GENERATE_FILLER,
            AppAction::ErrorTriggerMainProcessError => action_types::ERROR_TRIGGER_MAIN_PROCESS_ERROR,
        }
    }
}

impl Default for HandlersStore {
    fn default() -> Self {
        Self::new()
    }
}

impl StateManager for HandlersStore {
    fn get_initial_state(&self) -> Value {
        serde_json::to_value(self.snapshot()).unwrap_or(Value::Null)
    }

    fn dispatch_action(&mut self, action: Value) -> Value {
        match AppAction::parse(&action) {
            Ok(parsed) => {
                let key = Self::handler_key_for(&parsed);
                if let Some(handler) = self.handlers.get(key) {
                    let mut guard = self
                        .state
                        .lock()
                        .expect("HandlersStore mutex should not be poisoned");
                    match handler(&mut guard, parsed) {
                        Ok(()) => serde_json::to_value(guard.clone()).unwrap_or(Value::Null),
                        Err(error) => error_envelope(&guard.clone(), &error),
                    }
                } else {
                    error_envelope(
                        &self.snapshot(),
                        &ActionError::UnknownAction(key.to_string()),
                    )
                }
            }
            Err(error) => error_envelope(&self.snapshot(), &error),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn handlers_increment_works() {
        let mut store = HandlersStore::new();
        let result = store.dispatch_action(json!({ "type": "COUNTER:INCREMENT" }));
        assert_eq!(result.get("counter").and_then(Value::as_i64), Some(1));
    }

    #[test]
    fn handlers_set_payload_round_trips() {
        let mut store = HandlersStore::new();
        let result = store.dispatch_action(json!({ "type": "COUNTER:SET", "payload": 17 }));
        assert_eq!(result.get("counter").and_then(Value::as_i64), Some(17));
    }
}
