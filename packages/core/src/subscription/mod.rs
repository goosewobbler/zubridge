use std::collections::{HashMap, HashSet};

use crate::models::JsonValue;

/// Tracks which top-level state keys each webview is subscribed to.
///
/// A webview with no entry receives every key (default-all). Once a webview has
/// any explicit subscription, only the keys in its set are forwarded.
#[derive(Debug, Default)]
pub struct SubscriptionManager {
    by_label: HashMap<String, HashSet<String>>,
}

impl SubscriptionManager {
    pub fn new() -> Self {
        Self::default()
    }

    /// Add `keys` to the subscription set for `label`. Returns the resulting set.
    pub fn subscribe(&mut self, label: &str, keys: &[String]) -> Vec<String> {
        let entry = self.by_label.entry(label.to_string()).or_default();
        for key in keys {
            entry.insert(key.clone());
        }
        let mut sorted: Vec<String> = entry.iter().cloned().collect();
        sorted.sort();
        sorted
    }

    /// Remove `keys` from the subscription set for `label`. If the set becomes
    /// empty the entry is removed entirely (which restores default-all behaviour).
    pub fn unsubscribe(&mut self, label: &str, keys: &[String]) -> Vec<String> {
        if let Some(entry) = self.by_label.get_mut(label) {
            for key in keys {
                entry.remove(key);
            }
            if entry.is_empty() {
                self.by_label.remove(label);
                return Vec::new();
            }
            let mut sorted: Vec<String> = entry.iter().cloned().collect();
            sorted.sort();
            sorted
        } else {
            Vec::new()
        }
    }

    /// Returns the current explicit subscription keys for `label`, sorted.
    /// An empty vector indicates default-all (no explicit subscriptions).
    pub fn keys_for(&self, label: &str) -> Vec<String> {
        self.by_label
            .get(label)
            .map(|s| {
                let mut v: Vec<String> = s.iter().cloned().collect();
                v.sort();
                v
            })
            .unwrap_or_default()
    }

    /// Forget the subscription entry for `label` (e.g. on webview close).
    pub fn drop_label(&mut self, label: &str) {
        self.by_label.remove(label);
    }

    /// Filter `state` to only the keys this webview is subscribed to. If the
    /// webview has no explicit subscription, the full state is returned.
    pub fn filter_for<'a>(&self, label: &str, state: &'a JsonValue) -> JsonValue {
        let Some(keys) = self.by_label.get(label) else {
            return state.clone();
        };
        let JsonValue::Object(map) = state else {
            return state.clone();
        };
        let mut filtered = serde_json::Map::with_capacity(keys.len());
        for key in keys {
            if let Some(value) = map.get(key) {
                filtered.insert(key.clone(), value.clone());
            }
        }
        JsonValue::Object(filtered)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn subscribe_dedupes() {
        let mut m = SubscriptionManager::new();
        m.subscribe("main", &["a".into(), "b".into()]);
        let keys = m.subscribe("main", &["a".into(), "c".into()]);
        assert_eq!(keys, vec!["a", "b", "c"]);
    }

    #[test]
    fn unsubscribe_clears_label_when_empty() {
        let mut m = SubscriptionManager::new();
        m.subscribe("main", &["a".into()]);
        m.unsubscribe("main", &["a".into()]);
        assert!(m.keys_for("main").is_empty());
    }

    #[test]
    fn filter_returns_full_state_for_unsubscribed_label() {
        let m = SubscriptionManager::new();
        let state = serde_json::json!({ "a": 1, "b": 2 });
        assert_eq!(m.filter_for("main", &state), state);
    }

    #[test]
    fn filter_returns_only_subscribed_keys() {
        let mut m = SubscriptionManager::new();
        m.subscribe("main", &["a".into()]);
        let state = serde_json::json!({ "a": 1, "b": 2 });
        assert_eq!(m.filter_for("main", &state), serde_json::json!({ "a": 1 }));
    }
}
