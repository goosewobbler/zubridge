//! Mirrors `apps/electron/e2e/src/modes/custom` - the JS version subclasses
//! `EventEmitter` and writes its own `processAction`. Translated to Rust we
//! keep the same intent: a hand-written store with an internal change
//! listener list driven by a broadcast channel.

use std::sync::{Arc, Mutex};

use serde_json::Value;
use tauri_plugin_zubridge::StateManager;
use tokio::sync::broadcast;

use crate::features::{
    counter,
    error::{trigger_main_process_error, ActionError},
    state::BaseState,
    theme::Theme,
};
use crate::store::{error_envelope, filler_for, AppAction};

const LOG_TAG: &str = "[Custom]";
const STATE_CHANGE_CAPACITY: usize = 32;

/// A custom store that does not depend on Zustand or Redux. Mirrors the
/// `EventEmitter`-based store in the JS fixture.
pub struct CustomStore {
    state: Arc<Mutex<BaseState>>,
    change_tx: broadcast::Sender<BaseState>,
}

impl CustomStore {
    pub fn new() -> Self {
        let (change_tx, _rx) = broadcast::channel(STATE_CHANGE_CAPACITY);
        Self {
            state: Arc::new(Mutex::new(BaseState::initial())),
            change_tx,
        }
    }

    /// Subscribe to state-change notifications. Used by the tray to refresh
    /// its menu in lockstep with the bridge.
    pub fn subscribe(&self) -> broadcast::Receiver<BaseState> {
        self.change_tx.subscribe()
    }

    fn snapshot(&self) -> BaseState {
        self.state
            .lock()
            .expect("CustomStore mutex should not be poisoned")
            .clone()
    }

    fn emit_change(&self, state: &BaseState) {
        // We deliberately ignore send errors - they only happen when no one
        // is listening, which is fine for this fixture.
        let _ = self.change_tx.send(state.clone());
    }

    fn apply(&self, action: AppAction) -> Result<BaseState, ActionError> {
        if matches!(action, AppAction::ErrorTriggerMainProcessError) {
            return Err(trigger_main_process_error());
        }
        let mut guard = self
            .state
            .lock()
            .expect("CustomStore mutex should not be poisoned");
        match action {
            AppAction::CounterIncrement => counter::increment(&mut guard),
            AppAction::CounterDecrement => counter::decrement(&mut guard),
            AppAction::CounterSet(value) => counter::set(&mut guard, value),
            AppAction::CounterDouble => counter::double(&mut guard),
            AppAction::CounterHalve => counter::halve(&mut guard),
            AppAction::CounterReset => counter::set(&mut guard, 0),
            AppAction::ThemeToggle => guard.theme = guard.theme.toggle(),
            AppAction::ThemeSet(is_dark) => guard.theme = Theme::from_is_dark(is_dark),
            AppAction::StateReset => *guard = BaseState::initial(),
            AppAction::StateGenerateFiller(variant) => guard.filler = Some(filler_for(variant)),
            AppAction::ErrorTriggerMainProcessError => unreachable!(),
        }
        let snapshot = guard.clone();
        drop(guard);
        self.emit_change(&snapshot);
        Ok(snapshot)
    }
}

impl Default for CustomStore {
    fn default() -> Self {
        Self::new()
    }
}

impl StateManager for CustomStore {
    fn get_initial_state(&self) -> Value {
        serde_json::to_value(self.snapshot()).unwrap_or(Value::Null)
    }

    fn dispatch_action(&mut self, action: Value) -> Value {
        match AppAction::parse(&action) {
            Ok(parsed) => {
                println!("{} Processing {:?}", LOG_TAG, parsed);
                match self.apply(parsed) {
                    Ok(new_state) => serde_json::to_value(new_state).unwrap_or(Value::Null),
                    Err(error) => error_envelope(&self.snapshot(), &error),
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
    fn dispatch_increment_works() {
        let mut store = CustomStore::new();
        let result = store.dispatch_action(json!({ "type": "COUNTER:INCREMENT" }));
        assert_eq!(result.get("counter").and_then(Value::as_i64), Some(1));
    }

    #[test]
    fn subscribe_receives_state_after_dispatch() {
        let mut store = CustomStore::new();
        let mut rx = store.subscribe();
        store.dispatch_action(json!({ "type": "COUNTER:INCREMENT" }));
        // Receiver runs synchronously here because we're using broadcast.
        let received = rx.try_recv().unwrap();
        assert_eq!(received.counter, 1);
    }
}
