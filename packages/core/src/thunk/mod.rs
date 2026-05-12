//! Full thunk lifecycle management.
//!
//! Upgrades the registry-only `ThunkRegistry` from P1 to a complete
//! `ThunkManager` that tracks the root thunk, emits lifecycle events, and
//! supports parent-child thunk relationships.
//!
//! Ports (combined):
//! - `packages/electron/src/thunk/Thunk.ts`
//! - `packages/electron/src/thunk/ThunkManager.ts`
//! - `packages/electron/src/thunk/lifecycle/ThunkLifecycleManager.ts`
//! - `packages/electron/src/thunk/tracking/StateUpdateTracker.ts`

use std::collections::{HashMap, HashSet};
use std::time::Instant;

// ── ThunkState ────────────────────────────────────────────────────────────────

/// Lifecycle state of a thunk. Mirrors `ThunkState` in `Thunk.ts`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ThunkState {
    Pending,
    Executing,
    Completed,
    Failed,
}

// ── ThunkRecord ───────────────────────────────────────────────────────────────

/// Persistent record for a registered thunk.
#[derive(Debug, Clone)]
pub struct ThunkRecord {
    pub thunk_id: String,
    /// Parent thunk ID if this is a nested thunk.
    pub parent_id: Option<String>,
    /// Webview label or "main" for main-process thunks.
    pub source_label: String,
    /// State keys this thunk will affect (for key-based access control).
    pub keys: Option<Vec<String>>,
    pub bypass_access_control: bool,
    pub immediate: bool,
    pub state: ThunkState,
    pub error: Option<String>,
    /// Child thunk IDs (populated as children are registered).
    pub children: Vec<String>,
    #[allow(dead_code)]
    pub registered_at: Instant,
}

// ── ThunkEvent ────────────────────────────────────────────────────────────────

/// Events emitted by [`ThunkManager`] lifecycle operations.
///
/// Returned from mutating methods so the caller (e.g. `ActionQueueManager`)
/// can react without needing callbacks or async runtime wiring.
///
/// Mirrors the `ThunkManagerEvent` enum from `ThunkLifecycleManager.ts`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ThunkEvent {
    ThunkRegistered(String),
    ThunkStarted(String),
    ThunkCompleted(String),
    ThunkFailed { thunk_id: String, error: String },
    /// New root thunk set; `None` means the root thunk was cleared.
    RootThunkChanged(Option<String>),
    /// The root thunk completed (triggers action-queue drain).
    RootThunkCompleted(String),
}

// ── Running task ──────────────────────────────────────────────────────────────

/// A task record used to track concurrency for thunk-action execution.
///
/// Mirrors `ThunkTask` from `ThunkScheduler.ts`.
#[derive(Debug, Clone)]
pub struct RunningTask {
    pub task_id: String,
    pub thunk_id: String,
    pub can_run_concurrently: bool,
}

// ── ThunkManager ──────────────────────────────────────────────────────────────

/// Manages the full lifecycle of registered thunks.
///
/// # Root thunk concept
///
/// The first thunk executed with no parent becomes the *root thunk*. While a
/// root thunk is active, the `ActionScheduler` blocks regular (non-thunk,
/// non-immediate) actions. When the root thunk completes, a
/// [`ThunkEvent::RootThunkCompleted`] is returned and the queue is drained.
///
/// # Concurrency model
///
/// Non-concurrent tasks (default) block each other via the `running_tasks`
/// registry. The caller passes [`SchedulerContext`] derived from
/// [`ThunkManager::scheduler_context`] to [`ActionScheduler::enqueue`] /
/// [`ActionScheduler::drain_ready`].
///
/// [`SchedulerContext`]: crate::action::SchedulerContext
#[derive(Debug, Default)]
pub struct ThunkManager {
    by_id: HashMap<String, ThunkRecord>,
    root_thunk_id: Option<String>,
    running_tasks: Vec<RunningTask>,
    update_tracker: StateUpdateTracker,
}

impl ThunkManager {
    pub fn new() -> Self {
        Self::default()
    }

    // ── Registration ──────────────────────────────────────────────────────────

    /// Register a new thunk in `Pending` state.
    ///
    /// If `parent_id` is provided and that parent exists, the new thunk is
    /// added to the parent's `children` list.
    pub fn register(
        &mut self,
        thunk_id: String,
        parent_id: Option<String>,
        source_label: String,
        keys: Option<Vec<String>>,
        bypass_access_control: bool,
        immediate: bool,
    ) -> Result<Vec<ThunkEvent>, String> {
        if self.by_id.contains_key(&thunk_id) {
            return Err(format!("thunk {thunk_id} already registered"));
        }

        // Wire up parent-child relationship.
        if let Some(pid) = &parent_id {
            if let Some(parent) = self.by_id.get_mut(pid) {
                parent.children.push(thunk_id.clone());
            }
        }

        self.by_id.insert(
            thunk_id.clone(),
            ThunkRecord {
                thunk_id: thunk_id.clone(),
                parent_id,
                source_label,
                keys,
                bypass_access_control,
                immediate,
                state: ThunkState::Pending,
                error: None,
                children: Vec::new(),
                registered_at: Instant::now(),
            },
        );

        Ok(vec![ThunkEvent::ThunkRegistered(thunk_id)])
    }

    // ── Execution ─────────────────────────────────────────────────────────────

    /// Transition a `Pending` thunk to `Executing`.
    ///
    /// If there is no current root thunk and this thunk has no parent, it
    /// becomes the root thunk.
    pub fn execute_thunk(&mut self, thunk_id: &str) -> Vec<ThunkEvent> {
        let Some(record) = self.by_id.get_mut(thunk_id) else {
            return Vec::new();
        };
        record.state = ThunkState::Executing;

        let mut events = vec![ThunkEvent::ThunkStarted(thunk_id.to_string())];

        // Promote to root thunk if no root is active AND this is a root-level thunk.
        let is_root_level = record.parent_id.is_none();
        if self.root_thunk_id.is_none() && is_root_level {
            self.root_thunk_id = Some(thunk_id.to_string());
            events.push(ThunkEvent::RootThunkChanged(Some(thunk_id.to_string())));
        }

        events
    }

    /// Backward-compatible alias used by the Tauri plugin.
    pub fn mark_executing(&mut self, thunk_id: &str) {
        let _ = self.execute_thunk(thunk_id);
    }

    // ── Completion ────────────────────────────────────────────────────────────

    /// Complete (or fail) a thunk. Removes it from the live registry.
    ///
    /// Returns the final `ThunkRecord` plus any lifecycle events. The events
    /// include `RootThunkCompleted` when the root thunk finishes, which the
    /// caller should use to trigger an action-queue drain.
    pub fn complete(
        &mut self,
        thunk_id: &str,
        error: Option<String>,
    ) -> Result<(ThunkRecord, Vec<ThunkEvent>), String> {
        let mut record = self
            .by_id
            .remove(thunk_id)
            .ok_or_else(|| format!("thunk {thunk_id} not found"))?;

        record.state = if error.is_some() {
            ThunkState::Failed
        } else {
            ThunkState::Completed
        };
        record.error = error.clone();

        let mut events = if error.is_some() {
            vec![ThunkEvent::ThunkFailed {
                thunk_id: thunk_id.to_string(),
                error: error.unwrap_or_default(),
            }]
        } else {
            vec![ThunkEvent::ThunkCompleted(thunk_id.to_string())]
        };

        // If this was the root thunk, clear it and emit ROOT_THUNK_COMPLETED.
        if self.root_thunk_id.as_deref() == Some(thunk_id) {
            self.root_thunk_id = None;
            events.push(ThunkEvent::RootThunkCompleted(thunk_id.to_string()));
            events.push(ThunkEvent::RootThunkChanged(None));
        }

        // Clean up task tracking for this thunk.
        self.running_tasks.retain(|t| t.thunk_id != thunk_id);

        Ok((record, events))
    }

    // ── Task concurrency ──────────────────────────────────────────────────────

    /// Register a task (an action execution slot within a thunk).
    ///
    /// Non-concurrent tasks block other non-concurrent tasks from starting
    /// until they complete.
    pub fn start_task(&mut self, task_id: String, thunk_id: String, can_run_concurrently: bool) {
        self.running_tasks.push(RunningTask {
            task_id,
            thunk_id,
            can_run_concurrently,
        });
    }

    /// Remove a completed task.
    pub fn complete_task(&mut self, task_id: &str) {
        self.running_tasks.retain(|t| t.task_id != task_id);
    }

    // ── Queries ───────────────────────────────────────────────────────────────

    pub fn get(&self, thunk_id: &str) -> Option<&ThunkRecord> {
        self.by_id.get(thunk_id)
    }

    pub fn has_thunk(&self, thunk_id: &str) -> bool {
        self.by_id.contains_key(thunk_id)
    }

    pub fn root_thunk_id(&self) -> Option<&str> {
        self.root_thunk_id.as_deref()
    }

    pub fn is_thunk_active(&self, thunk_id: &str) -> bool {
        self.by_id
            .get(thunk_id)
            .map(|r| r.state == ThunkState::Executing)
            .unwrap_or(false)
    }

    /// True when there is a root thunk in `Executing` state.
    pub fn has_active_root_thunk(&self) -> bool {
        self.root_thunk_id
            .as_deref()
            .and_then(|id| self.by_id.get(id))
            .map(|r| r.state == ThunkState::Executing)
            .unwrap_or(false)
    }

    /// IDs of all non-concurrent tasks that are currently running.
    pub fn non_concurrent_thunk_ids(&self) -> Vec<String> {
        self.running_tasks
            .iter()
            .filter(|t| !t.can_run_concurrently)
            .map(|t| t.thunk_id.clone())
            .collect()
    }

    /// Build the [`SchedulerContext`] needed by [`ActionScheduler`].
    ///
    /// [`SchedulerContext`]: crate::action::SchedulerContext
    pub fn scheduler_context(&self) -> crate::action::SchedulerContext {
        crate::action::SchedulerContext {
            root_thunk_id: self.root_thunk_id.clone(),
            is_root_thunk_active: self.has_active_root_thunk(),
            running_non_concurrent_thunk_ids: self.non_concurrent_thunk_ids(),
        }
    }

    // ── Cleanup ───────────────────────────────────────────────────────────────

    /// Drop completed/failed thunks. Defensive escape hatch; normally thunks
    /// are removed on completion.
    pub fn drain_terminal(&mut self) {
        self.by_id
            .retain(|_, r| !matches!(r.state, ThunkState::Completed | ThunkState::Failed));
    }

    /// Remove every thunk registered against `source_label`.
    pub fn drop_label(&mut self, source_label: &str) {
        let dropped_ids: HashSet<String> = self
            .by_id
            .iter()
            .filter(|(_, r)| r.source_label == source_label)
            .map(|(id, _)| id.clone())
            .collect();
        self.by_id.retain(|_, r| r.source_label != source_label);
        self.running_tasks.retain(|t| !dropped_ids.contains(&t.thunk_id));
        // Clean root thunk pointer if the root was owned by this label.
        if let Some(root_id) = &self.root_thunk_id.clone() {
            if !self.by_id.contains_key(root_id.as_str()) {
                self.root_thunk_id = None;
            }
        }
    }

    pub fn clear(&mut self) {
        self.by_id.clear();
        self.root_thunk_id = None;
        self.running_tasks.clear();
        self.update_tracker.clear();
    }

    // ── State update tracking (delegated) ────────────────────────────────────

    pub fn update_tracker(&self) -> &StateUpdateTracker {
        &self.update_tracker
    }

    pub fn update_tracker_mut(&mut self) -> &mut StateUpdateTracker {
        &mut self.update_tracker
    }
}

/// Backward-compatibility type alias.
///
/// The Tauri plugin imports `ThunkRegistry`; redirecting it here means no
/// code change is required in the plugin for the P2 upgrade.
pub type ThunkRegistry = ThunkManager;

// ── StateUpdateTracker ────────────────────────────────────────────────────────

/// Tracks which state-update events each webview has acknowledged.
///
/// Carried forward unchanged from P1.
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

    /// Mark `update_id` for `label` as acked. Returns `true` if the entry existed.
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

    pub fn clear(&mut self) {
        self.pending_by_label.clear();
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    fn reg(mgr: &mut ThunkManager, id: &str) {
        mgr.register(id.into(), None, "main".into(), None, false, false)
            .unwrap();
    }

    fn reg_child(mgr: &mut ThunkManager, id: &str, parent: &str) {
        mgr.register(id.into(), Some(parent.into()), "main".into(), None, false, false)
            .unwrap();
    }

    // ── ThunkManager ──────────────────────────────────────────────────────────

    #[test]
    fn register_and_execute_sets_root() {
        let mut mgr = ThunkManager::new();
        reg(&mut mgr, "t1");
        let events = mgr.execute_thunk("t1");
        assert!(events.contains(&ThunkEvent::ThunkStarted("t1".into())));
        assert!(events.contains(&ThunkEvent::RootThunkChanged(Some("t1".into()))));
        assert_eq!(mgr.root_thunk_id(), Some("t1"));
        assert!(mgr.has_active_root_thunk());
    }

    #[test]
    fn child_thunk_does_not_replace_root() {
        let mut mgr = ThunkManager::new();
        reg(&mut mgr, "t1");
        mgr.execute_thunk("t1");
        reg_child(&mut mgr, "t2", "t1");
        let events = mgr.execute_thunk("t2");
        // t2 has a parent, so it should NOT become root.
        assert!(!events.contains(&ThunkEvent::RootThunkChanged(Some("t2".into()))));
        assert_eq!(mgr.root_thunk_id(), Some("t1"));
    }

    #[test]
    fn complete_root_emits_root_completed() {
        let mut mgr = ThunkManager::new();
        reg(&mut mgr, "t1");
        mgr.execute_thunk("t1");
        let (record, events) = mgr.complete("t1", None).unwrap();
        assert_eq!(record.state, ThunkState::Completed);
        assert!(events.contains(&ThunkEvent::ThunkCompleted("t1".into())));
        assert!(events.contains(&ThunkEvent::RootThunkCompleted("t1".into())));
        assert!(events.contains(&ThunkEvent::RootThunkChanged(None)));
        assert_eq!(mgr.root_thunk_id(), None);
        assert!(!mgr.has_active_root_thunk());
    }

    #[test]
    fn complete_with_error_emits_failed_event() {
        let mut mgr = ThunkManager::new();
        reg(&mut mgr, "t1");
        mgr.execute_thunk("t1");
        let (record, events) = mgr.complete("t1", Some("oops".into())).unwrap();
        assert_eq!(record.state, ThunkState::Failed);
        assert!(events.iter().any(|e| matches!(e, ThunkEvent::ThunkFailed { .. })));
    }

    #[test]
    fn register_duplicate_fails() {
        let mut mgr = ThunkManager::new();
        reg(&mut mgr, "t1");
        assert!(mgr.register("t1".into(), None, "main".into(), None, false, false).is_err());
    }

    #[test]
    fn complete_unknown_fails() {
        let mut mgr = ThunkManager::new();
        assert!(mgr.complete("t-missing", None).is_err());
    }

    #[test]
    fn parent_child_wiring() {
        let mut mgr = ThunkManager::new();
        reg(&mut mgr, "parent");
        reg_child(&mut mgr, "child", "parent");
        assert_eq!(mgr.get("parent").unwrap().children, vec!["child"]);
        assert_eq!(mgr.get("child").unwrap().parent_id.as_deref(), Some("parent"));
    }

    #[test]
    fn scheduler_context_reflects_manager_state() {
        let mut mgr = ThunkManager::new();
        reg(&mut mgr, "t1");
        mgr.execute_thunk("t1");
        mgr.start_task("task1".into(), "t1".into(), false);

        let ctx = mgr.scheduler_context();
        assert_eq!(ctx.root_thunk_id.as_deref(), Some("t1"));
        assert!(ctx.is_root_thunk_active);
        assert!(ctx.running_non_concurrent_thunk_ids.contains(&"t1".into()));
    }

    #[test]
    fn concurrent_tasks_not_in_blocking_list() {
        let mut mgr = ThunkManager::new();
        reg(&mut mgr, "t1");
        mgr.execute_thunk("t1");
        mgr.start_task("task1".into(), "t1".into(), true); // concurrent

        let ctx = mgr.scheduler_context();
        assert!(ctx.running_non_concurrent_thunk_ids.is_empty());
    }

    #[test]
    fn drop_label_clears_running_tasks() {
        let mut mgr = ThunkManager::new();
        mgr.register("t1".into(), None, "popup".into(), None, false, false)
            .unwrap();
        mgr.execute_thunk("t1");
        mgr.start_task("task1".into(), "t1".into(), false);
        assert!(!mgr.non_concurrent_thunk_ids().is_empty());
        mgr.drop_label("popup");
        assert!(
            mgr.non_concurrent_thunk_ids().is_empty(),
            "running_tasks for dropped label must be pruned to prevent ghost IDs stalling dispatch"
        );
    }

    #[test]
    fn drop_label_clears_root_if_owned() {
        let mut mgr = ThunkManager::new();
        mgr.register("t1".into(), None, "popup".into(), None, false, false)
            .unwrap();
        mgr.execute_thunk("t1");
        assert_eq!(mgr.root_thunk_id(), Some("t1"));
        mgr.drop_label("popup");
        assert_eq!(mgr.root_thunk_id(), None);
    }

    // ── ThunkRegistry backward compat ─────────────────────────────────────────

    #[test]
    fn thunk_registry_alias_works() {
        let mut reg: ThunkRegistry = ThunkRegistry::new();
        reg.register("t1".into(), None, "main".into(), None, false, false)
            .unwrap();
        reg.mark_executing("t1");
        assert!(reg.has_thunk("t1"));
        let (record, _) = reg.complete("t1", None).unwrap();
        assert_eq!(record.state, ThunkState::Completed);
        assert!(reg.get("t1").is_none());
    }

    // ── Parent-child cascade: root_thunk_completed when root finishes ─────────

    #[test]
    fn root_thunk_completed_fires_once_when_root_finishes() {
        let mut mgr = ThunkManager::new();
        reg(&mut mgr, "root");
        reg_child(&mut mgr, "child", "root");
        mgr.execute_thunk("root");
        mgr.execute_thunk("child");

        // Complete child first — no ROOT_THUNK_COMPLETED yet.
        let (_, events) = mgr.complete("child", None).unwrap();
        assert!(!events.iter().any(|e| matches!(e, ThunkEvent::RootThunkCompleted(_))));

        // Complete root → now ROOT_THUNK_COMPLETED fires.
        let (_, events) = mgr.complete("root", None).unwrap();
        assert!(events.iter().any(|e| matches!(e, ThunkEvent::RootThunkCompleted(_))));
        assert_eq!(mgr.root_thunk_id(), None);
    }

    // ── StateUpdateTracker ────────────────────────────────────────────────────

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

    #[test]
    fn ack_removes_label_when_all_acked() {
        let mut tracker = StateUpdateTracker::new();
        tracker.record_pending("main", "u1");
        tracker.ack("main", "u1");
        assert_eq!(tracker.pending_count("main"), 0);
    }

    #[test]
    fn drop_label_clears_tracker_entry() {
        let mut tracker = StateUpdateTracker::new();
        tracker.record_pending("popup", "u1");
        tracker.drop_label("popup");
        assert_eq!(tracker.pending_count("popup"), 0);
    }
}
