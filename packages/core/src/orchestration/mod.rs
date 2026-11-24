//! Central action queue orchestration.
//!
//! Ties together [`ActionScheduler`], [`ThunkManager`], and the
//! [`StateManager`] into a single entry point for action dispatch.
//!
//! Ports the coordination logic from:
//! - `packages/electron/src/main/actionQueue.ts`
//! - `packages/electron/src/main/mainThunkProcessor.ts`

use crate::action::{ActionScheduler, EnqueueResult, QueuedAction};
use crate::error::{Result, ZubridgeError};
use crate::models::{JsonValue, StateManager, ZubridgeAction};
use crate::state::StateManagerHandle;
use crate::thunk::{ThunkEvent, ThunkManager};

// ── DrainedState ──────────────────────────────────────────────────────────────

/// A state update produced by draining a queued action, tagged with the
/// originating action's provenance so the platform layer can attribute the
/// broadcast (matching the `source` metadata carried by an immediately
/// dispatched action's broadcast) instead of emitting it anonymously.
#[derive(Debug, Clone)]
pub struct DrainedState {
    pub state: JsonValue,
    pub action_id: Option<String>,
    pub thunk_id: Option<String>,
}

// ── ActionQueueManager ────────────────────────────────────────────────────────

/// Central orchestrator for action dispatch and thunk lifecycle.
///
/// Holds an [`ActionScheduler`] (priority queue + concurrency control) and a
/// [`ThunkManager`] (lifecycle state). Callers submit actions via
/// [`dispatch`]; the manager decides whether to execute immediately or queue,
/// and processes the queue when thunks complete.
///
/// # Execution model
///
/// The queue is entirely synchronous. "Async" behavior in the TS equivalent
/// (Promise chains, setTimeout) is handled at the platform-wrapper level
/// (Tauri async command handlers, NAPI ThreadsafeFunction). The core only
/// decides *ordering* and *eligibility* for execution.
pub struct ActionQueueManager {
    scheduler: ActionScheduler,
    thunk_manager: ThunkManager,
    state_handle: StateManagerHandle,
}

impl ActionQueueManager {
    pub fn new(state_manager: impl StateManager + 'static) -> Self {
        Self {
            scheduler: ActionScheduler::new(),
            thunk_manager: ThunkManager::new(),
            state_handle: crate::state::new_handle(state_manager),
        }
    }

    pub fn with_state_handle(state_handle: StateManagerHandle) -> Self {
        Self {
            scheduler: ActionScheduler::new(),
            thunk_manager: ThunkManager::new(),
            state_handle,
        }
    }

    // ── Public API ────────────────────────────────────────────────────────────

    /// Dispatch `action` from `source_label`.
    ///
    /// If the action can execute immediately it is processed and the new state
    /// is returned. Otherwise the action is queued and `Ok(None)` is returned;
    /// the caller receives the state update via the platform's event system
    /// (Tauri `emit`, NAPI callback, etc.).
    pub fn dispatch(
        &mut self,
        action: ZubridgeAction,
        source_label: String,
    ) -> Result<Option<JsonValue>> {
        let ctx = self.thunk_manager.scheduler_context();
        match self.scheduler.enqueue(action, source_label, &ctx) {
            EnqueueResult::ExecuteNow(queued) => {
                let new_state = self.execute_action(queued)?;
                // Draining here is a no-op: executing an immediate action doesn't change
                // thunk state, so it can't unblock a queued action. Queued actions are
                // drained — with their states returned for the platform to broadcast — by
                // on_thunk_complete / on_label_forgotten. Assert the invariant so a future
                // change that breaks it fails loudly instead of silently dropping states.
                let drained = self.drain_queue()?;
                debug_assert!(
                    drained.is_empty(),
                    "immediate execution unexpectedly unblocked {} queued action(s)",
                    drained.len()
                );
                Ok(Some(new_state))
            }
            EnqueueResult::Queued => Ok(None),
            EnqueueResult::Rejected(e) => Err(e),
        }
    }

    /// Called by the platform layer when a thunk completes (or fails).
    ///
    /// Drains any queued actions that became eligible and returns both the
    /// lifecycle events and the new state produced by each drained action.
    /// Platform wrappers must emit the returned states to subscribers —
    /// `StateManager` has no subscriber mechanism, so this is the only path
    /// through which those updates become visible after thunk completion.
    pub fn on_thunk_complete(
        &mut self,
        thunk_id: &str,
        error: Option<String>,
    ) -> Result<(Vec<ThunkEvent>, Vec<DrainedState>)> {
        let (_, events) = match self.thunk_manager.complete(thunk_id, error) {
            Ok(result) => result,
            Err(_) => return Ok((Vec::new(), Vec::new())), // Thunk not found — ignore.
        };

        // Drain unconditionally: child-thunk completions remove non-concurrent
        // tasks that may have been blocking already-queued actions.
        let states = self.drain_queue()?;

        Ok((events, states))
    }

    /// Called by the platform layer when a webview is destroyed.
    ///
    /// Drops every thunk owned by `source_label` and drains any actions that
    /// were queued behind them, returning their states for the platform layer
    /// to broadcast. Without this drain a destroyed window's blocking thunk
    /// would leave its dependent actions stuck in the scheduler indefinitely —
    /// the same escape valve as [`on_thunk_complete`], for the teardown path.
    pub fn on_label_forgotten(&mut self, source_label: &str) -> Result<Vec<DrainedState>> {
        self.thunk_manager.drop_label(source_label);
        self.drain_queue()
    }

    /// Register a thunk.
    pub fn register_thunk(
        &mut self,
        thunk_id: String,
        parent_id: Option<String>,
        source_label: String,
        keys: Option<Vec<String>>,
        bypass_access_control: bool,
        immediate: bool,
    ) -> Result<()> {
        self.thunk_manager
            .register(
                thunk_id.clone(),
                parent_id,
                source_label,
                keys,
                bypass_access_control,
                immediate,
            )
            .map_err(|msg| ZubridgeError::ThunkRegistration {
                thunk_id,
                message: msg,
            })?;
        Ok(())
    }

    /// Transition a registered thunk to Executing state.
    pub fn execute_thunk(&mut self, thunk_id: &str) -> Vec<ThunkEvent> {
        self.thunk_manager.execute_thunk(thunk_id)
    }

    pub fn thunk_manager(&self) -> &ThunkManager {
        &self.thunk_manager
    }

    pub fn thunk_manager_mut(&mut self) -> &mut ThunkManager {
        &mut self.thunk_manager
    }

    pub fn scheduler(&self) -> &ActionScheduler {
        &self.scheduler
    }

    pub fn queue_len(&self) -> usize {
        self.scheduler.queue_len()
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    fn execute_action(&mut self, queued: QueuedAction) -> Result<JsonValue> {
        let action = queued.action;
        let action_json = action.to_legacy_json();

        let new_state = {
            let mut guard = self
                .state_handle
                .lock()
                .map_err(|e| ZubridgeError::StateError(e.to_string()))?;
            guard.dispatch_action(action_json)
        };

        Ok(new_state)
    }

    /// Drain all immediately-eligible actions from the queue and execute them.
    ///
    /// Returns the new state produced by each executed action in order, tagged
    /// with that action's provenance (captured before the action is consumed).
    fn drain_queue(&mut self) -> Result<Vec<DrainedState>> {
        let mut states = Vec::new();
        loop {
            let ctx = self.thunk_manager.scheduler_context();
            let ready = self.scheduler.drain_ready(&ctx);
            if ready.is_empty() {
                break;
            }
            for queued in ready {
                let action_id = queued.action.id.clone();
                let thunk_id = queued.action.thunk_parent_id.clone();
                let state = self.execute_action(queued)?;
                states.push(DrainedState {
                    state,
                    action_id,
                    thunk_id,
                });
            }
        }
        Ok(states)
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::StateManager;
    use std::sync::{Arc, Mutex};

    /// Minimal state manager that counts dispatched actions.
    struct CountingState {
        count: Arc<Mutex<usize>>,
    }

    impl StateManager for CountingState {
        fn get_initial_state(&self) -> JsonValue {
            serde_json::json!({ "count": *self.count.lock().unwrap() })
        }
        fn dispatch_action(&mut self, _action: JsonValue) -> JsonValue {
            let mut c = self.count.lock().unwrap();
            *c += 1;
            serde_json::json!({ "count": *c })
        }
    }

    fn manager() -> (ActionQueueManager, Arc<Mutex<usize>>) {
        let counter = Arc::new(Mutex::new(0_usize));
        let mgr = ActionQueueManager::new(CountingState {
            count: counter.clone(),
        });
        (mgr, counter)
    }

    fn action(t: &str) -> ZubridgeAction {
        ZubridgeAction {
            id: Some(uuid::Uuid::new_v4().to_string()),
            action_type: t.to_string(),
            payload: None,
            source_label: None,
            thunk_parent_id: None,
            immediate: None,
            keys: None,
            bypass_access_control: None,
            starts_thunk: None,
            ends_thunk: None,
        }
    }

    fn thunk_action(t: &str, parent: &str) -> ZubridgeAction {
        ZubridgeAction {
            thunk_parent_id: Some(parent.to_string()),
            ..action(t)
        }
    }

    fn immediate_action(t: &str) -> ZubridgeAction {
        ZubridgeAction {
            immediate: Some(true),
            ..action(t)
        }
    }

    #[test]
    fn normal_action_dispatched_immediately_when_idle() {
        let (mut mgr, counter) = manager();
        let result = mgr.dispatch(action("INC"), "main".into()).unwrap();
        assert!(result.is_some());
        assert_eq!(*counter.lock().unwrap(), 1);
        assert_eq!(mgr.queue_len(), 0);
    }

    #[test]
    fn normal_action_queued_while_thunk_active() {
        let (mut mgr, counter) = manager();

        // Register and execute a root thunk.
        mgr.register_thunk("t1".into(), None, "main".into(), None, false, false)
            .unwrap();
        mgr.execute_thunk("t1");

        // Normal action should be queued, not executed yet.
        let result = mgr.dispatch(action("INC"), "main".into()).unwrap();
        assert!(result.is_none()); // queued
        assert_eq!(*counter.lock().unwrap(), 0);
        assert_eq!(mgr.queue_len(), 1);
    }

    #[test]
    fn queue_drained_on_thunk_complete() {
        let (mut mgr, counter) = manager();

        mgr.register_thunk("t1".into(), None, "main".into(), None, false, false)
            .unwrap();
        mgr.execute_thunk("t1");

        // Queue two normal actions.
        mgr.dispatch(action("INC"), "main".into()).unwrap();
        mgr.dispatch(action("INC"), "main".into()).unwrap();
        assert_eq!(mgr.queue_len(), 2);
        assert_eq!(*counter.lock().unwrap(), 0);

        // Complete the thunk — queued actions should now execute.
        mgr.on_thunk_complete("t1", None).unwrap();
        assert_eq!(mgr.queue_len(), 0);
        assert_eq!(*counter.lock().unwrap(), 2);
    }

    #[test]
    fn queue_drained_on_child_thunk_complete() {
        let (mut mgr, counter) = manager();

        // Root T1 active; T2 is a registered child with a non-concurrent task.
        mgr.register_thunk("t1".into(), None, "main".into(), None, false, false)
            .unwrap();
        mgr.register_thunk("t2".into(), Some("t1".into()), "main".into(), None, false, false)
            .unwrap();
        mgr.execute_thunk("t1");
        mgr.thunk_manager_mut().start_task("task_t2".into(), "t2".into(), false);

        // Action for root T1 is blocked because T2's non-concurrent task is running.
        let result = mgr.dispatch(thunk_action("INC", "t1"), "main".into()).unwrap();
        assert!(result.is_none());
        assert_eq!(mgr.queue_len(), 1);

        // Child T2 completes — its task is removed; drain should unblock the queued action.
        mgr.on_thunk_complete("t2", None).unwrap();
        assert_eq!(mgr.queue_len(), 0);
        assert_eq!(*counter.lock().unwrap(), 1);
    }

    #[test]
    fn on_thunk_complete_returns_drained_states() {
        let (mut mgr, _counter) = manager();

        mgr.register_thunk("t1".into(), None, "main".into(), None, false, false)
            .unwrap();
        mgr.execute_thunk("t1");

        // Queue two normal actions while the thunk blocks.
        mgr.dispatch(action("INC"), "main".into()).unwrap();
        mgr.dispatch(action("INC"), "main".into()).unwrap();
        assert_eq!(mgr.queue_len(), 2);

        // Complete the thunk — states from both drained actions are returned.
        let (_events, states) = mgr.on_thunk_complete("t1", None).unwrap();
        assert_eq!(mgr.queue_len(), 0);
        assert_eq!(states.len(), 2, "one state per drained action");
        assert_eq!(states[0].state, serde_json::json!({ "count": 1 }));
        assert_eq!(states[1].state, serde_json::json!({ "count": 2 }));
        // Provenance is threaded through so drained broadcasts can be attributed.
        assert!(
            states[0].action_id.is_some(),
            "drained state carries the originating action id"
        );
    }

    #[test]
    fn queue_drained_when_label_forgotten() {
        let (mut mgr, counter) = manager();

        mgr.register_thunk("t1".into(), None, "main".into(), None, false, false)
            .unwrap();
        mgr.execute_thunk("t1");

        // Queue two normal actions behind the active thunk.
        mgr.dispatch(action("INC"), "main".into()).unwrap();
        mgr.dispatch(action("INC"), "main".into()).unwrap();
        assert_eq!(mgr.queue_len(), 2);
        assert_eq!(*counter.lock().unwrap(), 0);

        // The window owning t1 is destroyed — dropping its thunk must drain the
        // actions queued behind it instead of leaving them stuck forever.
        let drained = mgr.on_label_forgotten("main").unwrap();
        assert_eq!(mgr.queue_len(), 0);
        assert_eq!(*counter.lock().unwrap(), 2);
        assert_eq!(drained.len(), 2, "both queued actions drained");
    }

    #[test]
    fn immediate_action_bypasses_blocking_thunk() {
        let (mut mgr, counter) = manager();

        mgr.register_thunk("t1".into(), None, "main".into(), None, false, false)
            .unwrap();
        mgr.execute_thunk("t1");

        let result = mgr.dispatch(immediate_action("INC"), "main".into()).unwrap();
        assert!(result.is_some()); // executed immediately
        assert_eq!(*counter.lock().unwrap(), 1);
    }

    #[test]
    fn thunk_action_for_root_executes_while_root_active() {
        let (mut mgr, counter) = manager();

        mgr.register_thunk("t1".into(), None, "main".into(), None, false, false)
            .unwrap();
        mgr.execute_thunk("t1");

        // Action belonging to root thunk t1 should execute immediately.
        let result = mgr
            .dispatch(thunk_action("INC", "t1"), "main".into())
            .unwrap();
        assert!(result.is_some());
        assert_eq!(*counter.lock().unwrap(), 1);
    }
}
