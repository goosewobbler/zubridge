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
                // After any execution, drain any newly unblocked queue items.
                self.drain_queue()?;
                Ok(Some(new_state))
            }
            EnqueueResult::Queued => Ok(None),
            EnqueueResult::Rejected(e) => Err(e),
        }
    }

    /// Called by the platform layer when a thunk completes (or fails).
    ///
    /// Processes any actions that were waiting for the thunk to finish.
    /// Returns the updated state if any queued actions were executed.
    pub fn on_thunk_complete(
        &mut self,
        thunk_id: &str,
        error: Option<String>,
    ) -> Result<Option<JsonValue>> {
        match self.thunk_manager.complete(thunk_id, error) {
            Ok(_) => {}
            Err(_) => return Ok(None), // Thunk not found — ignore.
        };

        // Drain unconditionally: child-thunk completions remove non-concurrent
        // tasks that may have been blocking already-queued actions.
        self.drain_queue()?;

        Ok(None) // State updates emitted by drain_queue callers.
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
    fn drain_queue(&mut self) -> Result<()> {
        loop {
            let ctx = self.thunk_manager.scheduler_context();
            let ready = self.scheduler.drain_ready(&ctx);
            if ready.is_empty() {
                break;
            }
            for queued in ready {
                self.execute_action(queued)?;
            }
        }
        Ok(())
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
