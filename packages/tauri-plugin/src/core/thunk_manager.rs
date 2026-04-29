use std::collections::{HashMap, HashSet};
use std::time::Instant;

/// Lifecycle state of a thunk registered with the plugin.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ThunkState {
    Pending,
    Executing,
    Completed,
    Failed,
}

#[derive(Debug, Clone)]
pub struct ThunkRecord {
    pub thunk_id: String,
    pub parent_id: Option<String>,
    pub source_label: String,
    pub keys: Option<Vec<String>>,
    pub bypass_access_control: bool,
    pub immediate: bool,
    pub state: ThunkState,
    pub error: Option<String>,
    #[allow(dead_code)]
    pub registered_at: Instant,
}

#[derive(Debug, Default)]
pub struct ThunkRegistry {
    by_id: HashMap<String, ThunkRecord>,
}

impl ThunkRegistry {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn register(
        &mut self,
        thunk_id: String,
        parent_id: Option<String>,
        source_label: String,
        keys: Option<Vec<String>>,
        bypass_access_control: bool,
        immediate: bool,
    ) -> Result<(), String> {
        if self.by_id.contains_key(&thunk_id) {
            return Err(format!("thunk {thunk_id} already registered"));
        }
        self.by_id.insert(
            thunk_id.clone(),
            ThunkRecord {
                thunk_id,
                parent_id,
                source_label,
                keys,
                bypass_access_control,
                immediate,
                state: ThunkState::Pending,
                error: None,
                registered_at: Instant::now(),
            },
        );
        Ok(())
    }

    pub fn mark_executing(&mut self, thunk_id: &str) {
        if let Some(record) = self.by_id.get_mut(thunk_id) {
            record.state = ThunkState::Executing;
        }
    }

    pub fn complete(&mut self, thunk_id: &str, error: Option<String>) -> Result<(), String> {
        let record = self
            .by_id
            .get_mut(thunk_id)
            .ok_or_else(|| format!("thunk {thunk_id} not found"))?;
        record.state = if error.is_some() {
            ThunkState::Failed
        } else {
            ThunkState::Completed
        };
        record.error = error;
        Ok(())
    }

    pub fn get(&self, thunk_id: &str) -> Option<&ThunkRecord> {
        self.by_id.get(thunk_id)
    }

    /// Drop completed/failed thunks. Useful for periodic cleanup; not currently
    /// scheduled but exposed for future maintenance.
    #[allow(dead_code)]
    pub fn drain_terminal(&mut self) {
        self.by_id
            .retain(|_, r| !matches!(r.state, ThunkState::Completed | ThunkState::Failed));
    }
}

/// Tracks which state-update events each webview has acknowledged.
///
/// The renderer calls `state_update_ack` after applying a state-update; the
/// plugin records the receipt here. Future ordering / backpressure logic can
/// inspect this to decide whether to throttle a slow webview.
#[derive(Debug, Default)]
pub struct StateUpdateTracker {
    pending_by_label: HashMap<String, HashSet<String>>,
}

impl StateUpdateTracker {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn record_pending(&mut self, label: &str, update_id: &str) {
        self.pending_by_label
            .entry(label.to_string())
            .or_default()
            .insert(update_id.to_string());
    }

    /// Mark `update_id` for `label` as acked. Returns true if the entry existed
    /// and was removed.
    pub fn ack(&mut self, label: &str, update_id: &str) -> bool {
        let Some(entry) = self.pending_by_label.get_mut(label) else {
            return false;
        };
        let removed = entry.remove(update_id);
        if entry.is_empty() {
            self.pending_by_label.remove(label);
        }
        removed
    }

    pub fn drop_label(&mut self, label: &str) {
        self.pending_by_label.remove(label);
    }

    pub fn pending_count(&self, label: &str) -> usize {
        self.pending_by_label
            .get(label)
            .map(|s| s.len())
            .unwrap_or(0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn register_then_complete() {
        let mut reg = ThunkRegistry::new();
        reg.register("t1".into(), None, "main".into(), None, false, false)
            .unwrap();
        assert_eq!(reg.get("t1").unwrap().state, ThunkState::Pending);
        reg.mark_executing("t1");
        assert_eq!(reg.get("t1").unwrap().state, ThunkState::Executing);
        reg.complete("t1", None).unwrap();
        assert_eq!(reg.get("t1").unwrap().state, ThunkState::Completed);
    }

    #[test]
    fn register_duplicate_fails() {
        let mut reg = ThunkRegistry::new();
        reg.register("t1".into(), None, "main".into(), None, false, false)
            .unwrap();
        assert!(reg
            .register("t1".into(), None, "main".into(), None, false, false)
            .is_err());
    }

    #[test]
    fn ack_tracks_pending() {
        let mut tracker = StateUpdateTracker::new();
        tracker.record_pending("main", "u1");
        tracker.record_pending("main", "u2");
        assert_eq!(tracker.pending_count("main"), 2);
        assert!(tracker.ack("main", "u1"));
        assert_eq!(tracker.pending_count("main"), 1);
        assert!(!tracker.ack("main", "u-missing"));
    }
}
