use std::collections::HashMap;

use crate::models::{JsonValue, StateDelta};

/// Tracks the last state sent to each webview and computes deltas.
///
/// State is assumed to be a JSON object at the top level (the convention used
/// by Zubridge state managers). For non-object states, the delta calculator
/// always emits a full-state payload.
#[derive(Debug, Default)]
pub struct DeltaCalculator {
    last_by_label: HashMap<String, JsonValue>,
}

impl DeltaCalculator {
    pub fn new() -> Self {
        Self::default()
    }

    /// Compute the delta for `label`. Returns `None` to indicate the renderer
    /// should receive a full-state payload (no prior state, non-object state,
    /// or shape change). Returns `Some(delta)` when an incremental update is
    /// safe to send.
    pub fn compute(&self, label: &str, new_state: &JsonValue) -> Option<StateDelta> {
        let Some(prev) = self.last_by_label.get(label) else {
            return None;
        };
        let (JsonValue::Object(prev_map), JsonValue::Object(next_map)) = (prev, new_state) else {
            return None;
        };

        let mut changed = serde_json::Map::new();
        let mut removed = Vec::new();

        for (key, value) in next_map {
            match prev_map.get(key) {
                Some(prev_value) if prev_value == value => {}
                _ => {
                    changed.insert(key.clone(), value.clone());
                }
            }
        }
        for key in prev_map.keys() {
            if !next_map.contains_key(key) {
                removed.push(key.clone());
            }
        }

        if changed.is_empty() && removed.is_empty() {
            return Some(StateDelta::default());
        }

        Some(StateDelta { changed, removed })
    }

    /// Record `state` as the last state sent to `label`. Always called after a
    /// state-update event has been emitted to that webview.
    pub fn record(&mut self, label: &str, state: JsonValue) {
        self.last_by_label.insert(label.to_string(), state);
    }

    /// Clear stored history for `label` (e.g. on webview close or resync).
    pub fn forget(&mut self, label: &str) {
        self.last_by_label.remove(label);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn first_update_returns_none_for_full_state() {
        let calc = DeltaCalculator::new();
        let state = serde_json::json!({ "a": 1 });
        assert!(calc.compute("main", &state).is_none());
    }

    #[test]
    fn changed_keys_are_reported() {
        let mut calc = DeltaCalculator::new();
        calc.record("main", serde_json::json!({ "a": 1, "b": 2 }));
        let delta = calc
            .compute("main", &serde_json::json!({ "a": 1, "b": 3 }))
            .expect("delta");
        assert!(delta.removed.is_empty());
        assert_eq!(delta.changed.get("b").unwrap(), &serde_json::json!(3));
    }

    #[test]
    fn removed_keys_are_reported() {
        let mut calc = DeltaCalculator::new();
        calc.record("main", serde_json::json!({ "a": 1, "b": 2 }));
        let delta = calc
            .compute("main", &serde_json::json!({ "a": 1 }))
            .expect("delta");
        assert_eq!(delta.removed, vec!["b".to_string()]);
    }

    #[test]
    fn unchanged_state_returns_empty_delta() {
        let mut calc = DeltaCalculator::new();
        calc.record("main", serde_json::json!({ "a": 1 }));
        let delta = calc
            .compute("main", &serde_json::json!({ "a": 1 }))
            .expect("delta");
        assert!(delta.changed.is_empty() && delta.removed.is_empty());
    }
}
