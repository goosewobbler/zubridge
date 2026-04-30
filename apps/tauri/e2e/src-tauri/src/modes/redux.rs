//! Mirrors `apps/electron/e2e/src/modes/redux` - the JS version uses Redux
//! Toolkit slices combined into a `rootReducer`. Here we model the same
//! pattern: a single `root_reducer` walks the action through each slice
//! reducer, returning a brand-new state on every dispatch.

use std::sync::Mutex;

use serde_json::Value;
use tauri_plugin_zubridge::StateManager;

use crate::features::{
    counter,
    error::{trigger_main_process_error, ActionError},
    state::BaseState,
    theme::Theme,
};
use crate::store::{error_envelope, filler_for, AppAction};

const LOG_TAG: &str = "[Redux]";

fn counter_reducer(state: i32, action: &AppAction) -> i32 {
    let mut probe = BaseState {
        counter: state,
        theme: Theme::Dark,
        filler: None,
    };
    match action {
        AppAction::CounterIncrement => counter::increment(&mut probe),
        AppAction::CounterDecrement => counter::decrement(&mut probe),
        AppAction::CounterSet(v) => counter::set(&mut probe, *v),
        AppAction::CounterDouble => counter::double(&mut probe),
        AppAction::CounterHalve => counter::halve(&mut probe),
        AppAction::CounterReset => counter::set(&mut probe, 0),
        _ => {}
    }
    probe.counter
}

fn theme_reducer(state: Theme, action: &AppAction) -> Theme {
    match action {
        AppAction::ThemeToggle => state.toggle(),
        AppAction::ThemeSet(is_dark) => Theme::from_is_dark(*is_dark),
        _ => state,
    }
}

fn filler_reducer(state: Option<Value>, action: &AppAction) -> Option<Value> {
    match action {
        AppAction::StateGenerateFiller(variant) => Some(filler_for(*variant)),
        _ => state,
    }
}

fn root_reducer(state: BaseState, action: &AppAction) -> BaseState {
    if matches!(action, AppAction::StateReset) {
        return BaseState::initial();
    }
    BaseState {
        counter: counter_reducer(state.counter, action),
        theme: theme_reducer(state.theme, action),
        filler: filler_reducer(state.filler, action),
    }
}

pub struct ReduxStore {
    state: Mutex<BaseState>,
}

impl ReduxStore {
    pub fn new() -> Self {
        Self {
            state: Mutex::new(BaseState::initial()),
        }
    }

    fn snapshot(&self) -> BaseState {
        self.state
            .lock()
            .expect("ReduxStore mutex should not be poisoned")
            .clone()
    }

    fn apply(&self, action: AppAction) -> Result<BaseState, ActionError> {
        if matches!(action, AppAction::ErrorTriggerMainProcessError) {
            return Err(trigger_main_process_error());
        }
        let mut guard = self
            .state
            .lock()
            .expect("ReduxStore mutex should not be poisoned");
        println!("{} Dispatching {:?}", LOG_TAG, action);
        let next = root_reducer(guard.clone(), &action);
        *guard = next.clone();
        Ok(next)
    }
}

impl Default for ReduxStore {
    fn default() -> Self {
        Self::new()
    }
}

impl StateManager for ReduxStore {
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
    fn root_reducer_returns_initial_on_state_reset() {
        let state = BaseState {
            counter: 99,
            theme: Theme::Light,
            filler: None,
        };
        let result = root_reducer(state, &AppAction::StateReset);
        assert_eq!(result.counter, 0);
        assert_eq!(result.theme, Theme::Dark);
    }

    #[test]
    fn dispatch_double_doubles_counter() {
        let mut store = ReduxStore::new();
        store.dispatch_action(json!({ "type": "COUNTER:SET", "payload": 5 }));
        let result = store.dispatch_action(json!({ "type": "COUNTER:DOUBLE" }));
        assert_eq!(result.get("counter").and_then(Value::as_i64), Some(10));
    }

    #[test]
    fn intentional_error_does_not_mutate_state() {
        let mut store = ReduxStore::new();
        store.dispatch_action(json!({ "type": "COUNTER:SET", "payload": 7 }));
        let result = store.dispatch_action(json!({ "type": "ERROR:TRIGGER_MAIN_PROCESS_ERROR" }));
        assert_eq!(result.get("success").and_then(Value::as_bool), Some(false));
        // Counter still 7
        let snap = store.get_initial_state();
        assert_eq!(snap.get("counter").and_then(Value::as_i64), Some(7));
    }
}
