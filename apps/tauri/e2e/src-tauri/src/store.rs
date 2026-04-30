//! Shared store plumbing - extracts the legacy `{ type, payload }` action
//! shape that `StateManager::dispatch_action` receives and exposes a
//! mode-agnostic `AppAction` enum the modes can match on.

use serde_json::Value;

use crate::features::error::ActionError;
use crate::features::state::{generate_filler, BaseState, FillerVariant};

/// Action labels mirrored from the Electron e2e fixture so the same renderer
/// code drives the Tauri backend.
pub mod action_types {
    pub const COUNTER_INCREMENT: &str = "COUNTER:INCREMENT";
    pub const COUNTER_DECREMENT: &str = "COUNTER:DECREMENT";
    pub const COUNTER_SET: &str = "COUNTER:SET";
    pub const COUNTER_SET_SLOW: &str = "COUNTER:SET:SLOW";
    pub const COUNTER_DOUBLE: &str = "COUNTER:DOUBLE";
    pub const COUNTER_HALVE: &str = "COUNTER:HALVE";
    pub const COUNTER_DOUBLE_SLOW: &str = "COUNTER:DOUBLE:SLOW";
    pub const COUNTER_HALVE_SLOW: &str = "COUNTER:HALVE:SLOW";
    pub const COUNTER_RESET: &str = "COUNTER:RESET";
    pub const THEME_TOGGLE: &str = "THEME:TOGGLE";
    pub const THEME_SET: &str = "THEME:SET";
    pub const STATE_RESET: &str = "STATE:RESET";
    pub const STATE_GENERATE_FILLER: &str = "STATE:GENERATE-FILLER";
    pub const ERROR_TRIGGER_MAIN_PROCESS_ERROR: &str = "ERROR:TRIGGER_MAIN_PROCESS_ERROR";
}

#[derive(Debug, Clone)]
pub enum AppAction {
    CounterIncrement,
    CounterDecrement,
    CounterSet(i32),
    CounterDouble,
    CounterHalve,
    CounterReset,
    ThemeToggle,
    ThemeSet(bool),
    StateReset,
    StateGenerateFiller(FillerVariant),
    ErrorTriggerMainProcessError,
}

impl AppAction {
    pub fn parse(action: &Value) -> Result<Self, ActionError> {
        let action_type = action
            .get("type")
            .and_then(Value::as_str)
            .ok_or(ActionError::MissingType)?
            .to_string();
        let payload = action.get("payload");

        match action_type.as_str() {
            action_types::COUNTER_INCREMENT => Ok(Self::CounterIncrement),
            action_types::COUNTER_DECREMENT => Ok(Self::CounterDecrement),
            action_types::COUNTER_SET | action_types::COUNTER_SET_SLOW => {
                let value = payload.and_then(Value::as_i64).ok_or_else(|| {
                    ActionError::InvalidPayload {
                        action_type: action_type.clone(),
                        message: "expected an integer payload".into(),
                    }
                })?;
                Ok(Self::CounterSet(value as i32))
            }
            action_types::COUNTER_DOUBLE | action_types::COUNTER_DOUBLE_SLOW => {
                Ok(Self::CounterDouble)
            }
            action_types::COUNTER_HALVE | action_types::COUNTER_HALVE_SLOW => {
                Ok(Self::CounterHalve)
            }
            action_types::COUNTER_RESET => Ok(Self::CounterReset),
            action_types::THEME_TOGGLE => Ok(Self::ThemeToggle),
            action_types::THEME_SET => {
                let is_dark = payload.and_then(Value::as_bool).ok_or_else(|| {
                    ActionError::InvalidPayload {
                        action_type: action_type.clone(),
                        message: "expected a boolean payload".into(),
                    }
                })?;
                Ok(Self::ThemeSet(is_dark))
            }
            action_types::STATE_RESET => Ok(Self::StateReset),
            action_types::STATE_GENERATE_FILLER => {
                Ok(Self::StateGenerateFiller(FillerVariant::from_payload(payload)))
            }
            action_types::ERROR_TRIGGER_MAIN_PROCESS_ERROR => Ok(Self::ErrorTriggerMainProcessError),
            other => Err(ActionError::UnknownAction(other.to_string())),
        }
    }
}

/// Common JSON envelope used when a mode wants to surface a soft error
/// without poisoning the stored state.
pub fn error_envelope(state: &BaseState, error: &ActionError) -> Value {
    let mut response = serde_json::Map::new();
    response.insert(
        "state".to_string(),
        serde_json::to_value(state).unwrap_or(Value::Null),
    );
    response.insert("success".to_string(), Value::Bool(false));
    response.insert("error".to_string(), Value::String(error.to_string()));
    Value::Object(response)
}

/// Re-export `generate_filler` so modes can build filler state without
/// reaching into `features::state` directly.
pub fn filler_for(variant: FillerVariant) -> Value {
    generate_filler(variant)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn counter_set_requires_integer_payload() {
        let action = json!({ "type": "COUNTER:SET" });
        let result = AppAction::parse(&action);
        assert!(matches!(
            result,
            Err(ActionError::InvalidPayload { .. })
        ));
    }

    #[test]
    fn counter_set_parses_integer() {
        let action = json!({ "type": "COUNTER:SET", "payload": 42 });
        let parsed = AppAction::parse(&action).unwrap();
        assert!(matches!(parsed, AppAction::CounterSet(42)));
    }

    #[test]
    fn unknown_action_is_reported() {
        let action = json!({ "type": "MYSTERY" });
        let result = AppAction::parse(&action);
        assert!(matches!(result, Err(ActionError::UnknownAction(_))));
    }

    #[test]
    fn slow_variants_alias_canonical_actions() {
        let action = json!({ "type": "COUNTER:DOUBLE:SLOW" });
        assert!(matches!(
            AppAction::parse(&action).unwrap(),
            AppAction::CounterDouble
        ));
    }
}
