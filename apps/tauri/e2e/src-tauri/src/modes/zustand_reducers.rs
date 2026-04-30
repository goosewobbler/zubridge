//! Mirrors `apps/electron/e2e/src/modes/zustand-reducers` - the JS version
//! breaks state by slice (counter, theme, ...) and assigns a pure reducer
//! per slice. Here we keep the same shape: each slice has a private
//! `reduce_*` function and the `StateManager` impl wires them together.

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

const LOG_TAG: &str = "[Reducers]";

fn reduce_counter(value: i32, action: &AppAction) -> i32 {
    let mut tmp = BaseState {
        counter: value,
        theme: Theme::Dark,
        filler: None,
    };
    match action {
        AppAction::CounterIncrement => counter::increment(&mut tmp),
        AppAction::CounterDecrement => counter::decrement(&mut tmp),
        AppAction::CounterSet(v) => counter::set(&mut tmp, *v),
        AppAction::CounterDouble => counter::double(&mut tmp),
        AppAction::CounterHalve => counter::halve(&mut tmp),
        AppAction::CounterReset => counter::set(&mut tmp, 0),
        _ => {}
    }
    tmp.counter
}

fn reduce_theme(theme: Theme, action: &AppAction) -> Theme {
    match action {
        AppAction::ThemeToggle => theme.toggle(),
        AppAction::ThemeSet(is_dark) => Theme::from_is_dark(*is_dark),
        _ => theme,
    }
}

fn reduce_filler(filler: Option<Value>, action: &AppAction) -> Option<Value> {
    match action {
        AppAction::StateGenerateFiller(variant) => Some(filler_for(*variant)),
        _ => filler,
    }
}

pub struct ReducersStore {
    state: Mutex<BaseState>,
}

impl ReducersStore {
    pub fn new() -> Self {
        Self {
            state: Mutex::new(BaseState::initial()),
        }
    }

    fn snapshot(&self) -> BaseState {
        self.state
            .lock()
            .expect("ReducersStore mutex should not be poisoned")
            .clone()
    }

    fn apply(&self, action: AppAction) -> Result<BaseState, ActionError> {
        if matches!(action, AppAction::ErrorTriggerMainProcessError) {
            return Err(trigger_main_process_error());
        }
        let mut guard = self
            .state
            .lock()
            .expect("ReducersStore mutex should not be poisoned");

        if matches!(action, AppAction::StateReset) {
            println!("{} Resetting state", LOG_TAG);
            *guard = BaseState::initial();
            return Ok(guard.clone());
        }

        println!("{} Reducing action {:?}", LOG_TAG, action);
        guard.counter = reduce_counter(guard.counter, &action);
        guard.theme = reduce_theme(guard.theme, &action);
        guard.filler = reduce_filler(guard.filler.take(), &action);
        Ok(guard.clone())
    }
}

impl Default for ReducersStore {
    fn default() -> Self {
        Self::new()
    }
}

impl StateManager for ReducersStore {
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
    fn counter_reducer_handles_increment_and_double() {
        assert_eq!(reduce_counter(0, &AppAction::CounterIncrement), 1);
        assert_eq!(reduce_counter(3, &AppAction::CounterDouble), 6);
    }

    #[test]
    fn theme_reducer_toggles() {
        assert_eq!(reduce_theme(Theme::Light, &AppAction::ThemeToggle), Theme::Dark);
    }

    #[test]
    fn dispatch_returns_new_state_with_increment() {
        let mut store = ReducersStore::new();
        let result = store.dispatch_action(json!({ "type": "COUNTER:INCREMENT" }));
        assert_eq!(result.get("counter").and_then(Value::as_i64), Some(1));
    }
}
