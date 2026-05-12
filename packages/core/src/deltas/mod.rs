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

/// Outcome of a delta computation. Three cases instead of an `Option<StateDelta>`
/// where `None` and `Some(empty)` carried different meanings:
///
/// - `FullState`: no prior baseline (first call), non-object state, or shape
///   change. The caller should send a full-state payload.
/// - `Unchanged`: the state for this webview's scoped view is identical to the
///   prior baseline. The caller should skip emitting an event entirely —
///   sending an empty delta still triggers a Zustand replace + re-render
///   cycle on the renderer.
/// - `Delta(StateDelta)`: incremental update; the caller emits the delta.
#[derive(Debug, Clone)]
pub enum DeltaResult {
    FullState,
    Unchanged,
    Delta(StateDelta),
}

impl DeltaCalculator {
    pub fn new() -> Self {
        Self::default()
    }

    /// Compute the delta for `label`. See [`DeltaResult`] for the three cases.
    pub fn compute(&self, label: &str, new_state: &JsonValue) -> DeltaResult {
        let Some(prev) = self.last_by_label.get(label) else {
            return DeltaResult::FullState;
        };
        let (JsonValue::Object(prev_map), JsonValue::Object(next_map)) = (prev, new_state) else {
            return DeltaResult::FullState;
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
            return DeltaResult::Unchanged;
        }

        DeltaResult::Delta(StateDelta { changed, removed })
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

impl StateDelta {
    /// True when the delta has no changes and no removals.
    pub fn is_no_op(&self) -> bool {
        self.changed.is_empty() && self.removed.is_empty()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn first_update_returns_full_state() {
        let calc = DeltaCalculator::new();
        let state = serde_json::json!({ "a": 1 });
        assert!(matches!(calc.compute("main", &state), DeltaResult::FullState));
    }

    #[test]
    fn non_object_state_returns_full_state() {
        let mut calc = DeltaCalculator::new();
        calc.record("main", serde_json::json!({ "a": 1 }));
        assert!(matches!(
            calc.compute("main", &serde_json::json!(42)),
            DeltaResult::FullState
        ));
    }

    #[test]
    fn changed_keys_are_reported() {
        let mut calc = DeltaCalculator::new();
        calc.record("main", serde_json::json!({ "a": 1, "b": 2 }));
        let DeltaResult::Delta(delta) = calc.compute("main", &serde_json::json!({ "a": 1, "b": 3 }))
        else {
            panic!("expected Delta variant");
        };
        assert!(delta.removed.is_empty());
        assert_eq!(delta.changed.get("b").unwrap(), &serde_json::json!(3));
    }

    #[test]
    fn removed_keys_are_reported() {
        let mut calc = DeltaCalculator::new();
        calc.record("main", serde_json::json!({ "a": 1, "b": 2 }));
        let DeltaResult::Delta(delta) = calc.compute("main", &serde_json::json!({ "a": 1 })) else {
            panic!("expected Delta variant");
        };
        assert_eq!(delta.removed, vec!["b".to_string()]);
    }

    #[test]
    fn unchanged_state_returns_unchanged() {
        let mut calc = DeltaCalculator::new();
        calc.record("main", serde_json::json!({ "a": 1 }));
        assert!(matches!(
            calc.compute("main", &serde_json::json!({ "a": 1 })),
            DeltaResult::Unchanged
        ));
    }

    #[test]
    fn is_no_op_distinguishes_empty_from_changed() {
        let empty = StateDelta::default();
        assert!(empty.is_no_op());

        let mut changed = StateDelta::default();
        changed.changed.insert("a".into(), serde_json::json!(1));
        assert!(!changed.is_no_op());

        let mut removed = StateDelta::default();
        removed.removed.push("a".into());
        assert!(!removed.is_no_op());
    }
}
