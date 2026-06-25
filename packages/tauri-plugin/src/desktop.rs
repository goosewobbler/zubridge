use serde::de::DeserializeOwned;
use std::sync::{Arc, Mutex, RwLock};

use serde_json::json;
use tauri::{plugin::PluginApi, AppHandle, Emitter, Manager, Runtime};
use uuid::Uuid;

use crate::core::state_manager::{self, StateManagerHandle};
use crate::core::{
    ActionQueueManager, DeltaCalculator, DeltaResult, StateUpdateTracker, SubscriptionManager,
};
use crate::models::{
    BatchDispatchResult, BatchFailure, JsonValue, StateManager, StateUpdatePayload, UpdateSource,
    ZubridgeAction, ZubridgeOptions,
};

/// Per-webview monotonic sequence counter for state-update events.
#[derive(Debug, Default)]
pub struct SequenceTracker {
    by_label: std::collections::HashMap<String, u64>,
}

impl SequenceTracker {
    pub fn next(&mut self, label: &str) -> u64 {
        let entry = self.by_label.entry(label.to_string()).or_insert(0);
        *entry += 1;
        *entry
    }

    pub fn forget(&mut self, label: &str) {
        self.by_label.remove(label);
    }
}

pub fn init<R: Runtime, C: DeserializeOwned>(
    app: &AppHandle<R>,
    _api: PluginApi<R, C>,
) -> crate::Result<Zubridge<R>> {
    Ok(Zubridge {
        app: app.clone(),
        options: ZubridgeOptions::default(),
        subscriptions: Arc::new(RwLock::new(SubscriptionManager::new())),
        deltas: Arc::new(RwLock::new(DeltaCalculator::new())),
        manager: Arc::new(Mutex::new(None)),
        update_tracker: Arc::new(RwLock::new(StateUpdateTracker::new())),
        sequences: Arc::new(RwLock::new(SequenceTracker::default())),
        broadcast_lock: Arc::new(Mutex::new(())),
    })
}

/// Access to the Zubridge plugin from a Tauri runtime.
pub struct Zubridge<R: Runtime> {
    app: AppHandle<R>,
    options: ZubridgeOptions,
    subscriptions: Arc<RwLock<SubscriptionManager>>,
    deltas: Arc<RwLock<DeltaCalculator>>,
    /// Central orchestrator (priority scheduler + thunk lifecycle + state
    /// handle). Lazily constructed on first use from the registered state
    /// manager — `init` runs before a state manager may exist, so we defer
    /// construction to the first dispatch/thunk call (see `locked_manager`).
    manager: Arc<Mutex<Option<ActionQueueManager>>>,
    update_tracker: Arc<RwLock<StateUpdateTracker>>,
    sequences: Arc<RwLock<SequenceTracker>>,
    /// Serialises broadcast_state calls so concurrent dispatches can't interleave
    /// the (read prev → compute delta → emit → record new prev) sequence and
    /// produce stale deltas computed against an outdated baseline. Acquired
    /// *before* `manager` wherever both are held, to keep a consistent lock order.
    broadcast_lock: Arc<Mutex<()>>,
}

impl<R: Runtime> Zubridge<R> {
    pub fn options(&self) -> &ZubridgeOptions {
        &self.options
    }

    pub fn set_options(&mut self, options: ZubridgeOptions) {
        self.options = options;
    }

    pub fn subscriptions(&self) -> &Arc<RwLock<SubscriptionManager>> {
        &self.subscriptions
    }

    pub fn deltas(&self) -> &Arc<RwLock<DeltaCalculator>> {
        &self.deltas
    }

    pub fn update_tracker(&self) -> &Arc<RwLock<StateUpdateTracker>> {
        &self.update_tracker
    }

    /// Look up the registered state manager handle, returning an error if none.
    fn state_handle(&self) -> crate::Result<StateManagerHandle> {
        self.app
            .try_state::<StateManagerHandle>()
            .map(|s| s.inner().clone())
            .ok_or(crate::Error::StateManagerMissing)
    }

    /// Lock the orchestrator, lazily constructing it on first use from the
    /// registered state-manager handle (a clone of the same `Arc<Mutex<dyn
    /// StateManager>>` that `state_handle` reads, so dispatches and reads see
    /// the same canonical state). Errors if no state manager is registered.
    fn locked_manager(
        &self,
    ) -> crate::Result<std::sync::MutexGuard<'_, Option<ActionQueueManager>>> {
        let mut guard = self
            .manager
            .lock()
            .map_err(|e| crate::Error::StateError(e.to_string()))?;
        if guard.is_none() {
            let handle = self.state_handle()?;
            *guard = Some(ActionQueueManager::with_state_handle(handle));
        }
        Ok(guard)
    }

    /// Read the current state from the state manager.
    pub fn get_initial_state(&self) -> crate::Result<JsonValue> {
        Ok(state_manager::read_state(&self.state_handle()?)?)
    }

    /// Read state filtered to the keys subscribed by `source_label`. If the
    /// label has no explicit subscription, the full state is returned.
    pub fn get_state(&self, source_label: Option<&str>) -> crate::Result<JsonValue> {
        let full = state_manager::read_state(&self.state_handle()?)?;
        match source_label {
            Some(label) => {
                let subs = self
                    .subscriptions
                    .read()
                    .map_err(|e| crate::Error::StateError(e.to_string()))?;
                Ok(subs.filter_for(label, &full))
            }
            None => Ok(full),
        }
    }

    /// Dispatch a single action through the scheduler and broadcast the
    /// resulting state.
    ///
    /// The action is routed through [`ActionQueueManager`], which decides
    /// whether it can execute immediately or must be queued behind an active
    /// thunk (priority + concurrency control). On immediate execution the new
    /// state is broadcast here; if the action is queued, `Ok(None)` comes back
    /// and the state update is emitted later when the blocking thunk completes
    /// and the queue drains (see [`complete_thunk`]). The renderer tolerates
    /// this — its dispatch resolves on the `invoke` returning, not on a
    /// state-update arriving.
    ///
    /// `broadcast_lock` is acquired *before* dispatch so the (compute delta →
    /// emit → record baseline) sequence can't interleave across concurrent
    /// dispatches and stale-base a delta. The `manager` lock is acquired after
    /// it (consistent order) and held across the broadcast so no other dispatch
    /// can reorder its broadcast ahead of ours.
    pub fn dispatch_action(&self, action: ZubridgeAction) -> crate::Result<String> {
        let action_id = action
            .id
            .clone()
            .unwrap_or_else(|| Uuid::new_v4().to_string());
        let thunk_id = action.thunk_parent_id.clone();
        let source_label = action.source_label.clone().unwrap_or_default();

        // Stamp the id we'll report so the broadcast source and return value agree.
        let mut action = action;
        if action.id.is_none() {
            action.id = Some(action_id.clone());
        }

        let _broadcast_guard = self
            .broadcast_lock
            .lock()
            .map_err(|e| crate::Error::StateError(e.to_string()))?;
        let mut guard = self.locked_manager()?;
        let dispatched = guard
            .as_mut()
            .expect("locked_manager initialises the manager")
            .dispatch(action, source_label)?;

        if let Some(new_state) = dispatched {
            let source = UpdateSource {
                action_id: Some(action_id.clone()),
                thunk_id,
            };
            self.broadcast_state_locked(new_state, Some(source))?;
        }

        Ok(action_id)
    }

    /// Sequentially apply a batch of actions and emit a single coalesced
    /// state-update event after the last action has been processed. Per-action
    /// broadcasts are skipped — emitting N events for N actions defeats the
    /// purpose of batching.
    ///
    /// On a mid-batch dispatch error the actions that succeeded are NOT rolled
    /// back (the state manager has no transaction model), so the function
    /// still broadcasts the resulting state and returns Ok with `failed` set,
    /// carrying the failing action's id and message. This lets the renderer
    /// resolve the awaiters for actions that did commit (in
    /// `acked_action_ids`) and reject only the failing action plus any that
    /// were aborted because the loop bailed out — without it, the renderer
    /// would have to reject every action in the batch and a caller retrying
    /// on rejection would double-apply already-committed actions.
    ///
    /// The broadcast lock is held across both the per-action dispatch loop and
    /// the coalesced broadcast, so a concurrent dispatch_action can't insert
    /// its broadcast in between and stale-base our delta.
    pub fn batch_dispatch(
        &self,
        batch_id: String,
        actions: Vec<ZubridgeAction>,
    ) -> crate::Result<BatchDispatchResult> {
        if actions.is_empty() {
            return Ok(BatchDispatchResult {
                batch_id,
                acked_action_ids: Vec::new(),
                failed: None,
            });
        }

        let _broadcast_guard = self
            .broadcast_lock
            .lock()
            .map_err(|e| crate::Error::StateError(e.to_string()))?;
        let mut guard = self.locked_manager()?;
        let manager = guard
            .as_mut()
            .expect("locked_manager initialises the manager");

        let mut acked = Vec::with_capacity(actions.len());
        let mut last_state: Option<JsonValue> = None;
        let mut last_source: Option<UpdateSource> = None;
        let mut failed: Option<BatchFailure> = None;

        for action in actions {
            let action_id = action
                .id
                .clone()
                .unwrap_or_else(|| Uuid::new_v4().to_string());
            let thunk_id = action.thunk_parent_id.clone();
            let source_label = action.source_label.clone().unwrap_or_default();
            let mut action = action;
            if action.id.is_none() {
                action.id = Some(action_id.clone());
            }
            match manager.dispatch(action, source_label) {
                Ok(Some(state)) => {
                    last_state = Some(state);
                    last_source = Some(UpdateSource {
                        action_id: Some(action_id.clone()),
                        thunk_id,
                    });
                    acked.push(action_id);
                }
                // Queued behind an active thunk: still acked (it's accepted into
                // the queue); its state update is emitted on queue drain.
                Ok(None) => acked.push(action_id),
                Err(e) => {
                    failed = Some(BatchFailure {
                        action_id,
                        message: e.to_string(),
                    });
                    break;
                }
            }
        }

        // Emit one coalesced broadcast of the last immediately-executed state.
        // (Queued actions broadcast individually when the thunk drains.) Skipped
        // when nothing executed immediately.
        if let Some(new_state) = last_state {
            self.broadcast_state_locked(new_state, last_source)?;
        }

        Ok(BatchDispatchResult {
            batch_id,
            acked_action_ids: acked,
            failed,
        })
    }

    /// Compute and emit a state update for every active webview. Acquires
    /// `broadcast_lock` for the duration, then delegates to
    /// `broadcast_state_locked`. Use `broadcast_state_locked` directly if the
    /// caller already holds the lock (e.g. dispatch_action, batch_dispatch,
    /// subscribe/unsubscribe).
    #[allow(dead_code)]
    fn broadcast_state(
        &self,
        new_state: JsonValue,
        source: Option<UpdateSource>,
    ) -> crate::Result<()> {
        let _broadcast_guard = self
            .broadcast_lock
            .lock()
            .map_err(|e| crate::Error::StateError(e.to_string()))?;
        self.broadcast_state_locked(new_state, source)
    }

    /// Inner broadcast that assumes `broadcast_lock` is already held by the
    /// caller. Two concurrent dispatches must not be able to interleave the
    /// (compute delta → emit → record baseline) sequence — see
    /// `dispatch_action` for the lock-acquisition path.
    fn broadcast_state_locked(
        &self,
        new_state: JsonValue,
        source: Option<UpdateSource>,
    ) -> crate::Result<()> {
        let event_name = self.options.event_name.clone();

        let webviews = self.app.webview_windows();
        for label in webviews.keys() {
            let scoped = {
                let subs = self
                    .subscriptions
                    .read()
                    .map_err(|e| crate::Error::StateError(e.to_string()))?;
                subs.filter_for(label, &new_state)
            };

            // Compute the delta under a read lock. `DeltaResult` distinguishes
            // three cases:
            //   FullState  → no baseline / shape change → emit full state
            //   Unchanged  → state identical to baseline → skip emit
            //   Delta(d)   → emit incremental update
            //
            // The baseline is recorded in a *separate* write-lock acquisition
            // AFTER emit_to succeeds. Recording before the emit would advance
            // the baseline past a state the renderer never received: if emit_to
            // then fails, subsequent deltas would be computed against that
            // phantom state and silently diverge.
            let outcome = {
                let calc = self
                    .deltas
                    .read()
                    .map_err(|e| crate::Error::StateError(e.to_string()))?;
                calc.compute(label, &scoped)
            };

            let (delta, full_state) = match outcome {
                DeltaResult::Unchanged => continue,
                DeltaResult::FullState => (None, Some(scoped.clone())),
                DeltaResult::Delta(d) => (Some(d), None),
            };

            let seq = {
                let mut sequences = self
                    .sequences
                    .write()
                    .map_err(|e| crate::Error::StateError(e.to_string()))?;
                sequences.next(label)
            };
            let update_id = Uuid::new_v4().to_string();

            let payload = StateUpdatePayload {
                seq,
                update_id: update_id.clone(),
                delta,
                full_state,
                source: source.clone(),
            };

            self.app
                .emit_to(label.clone(), &event_name, payload)
                .map_err(|e| crate::Error::EmitError(e.to_string()))?;

            // Record the new delta baseline only after the emit succeeded.
            // If emit_to failed above, we propagate the error without updating
            // the baseline, so the next broadcast recomputes against the last
            // successfully-delivered state.
            {
                let mut calc = self
                    .deltas
                    .write()
                    .map_err(|e| crate::Error::StateError(e.to_string()))?;
                calc.record(label, scoped);
            }

            {
                let mut tracker = self
                    .update_tracker
                    .write()
                    .map_err(|e| crate::Error::StateError(e.to_string()))?;
                tracker.record_pending(label, &update_id);
            }
        }
        Ok(())
    }

    /// Triggered by the renderer to acknowledge it has applied a state update.
    pub fn state_update_ack(&self, source_label: &str, update_id: &str) -> crate::Result<()> {
        let mut tracker = self
            .update_tracker
            .write()
            .map_err(|e| crate::Error::StateError(e.to_string()))?;
        tracker.ack(source_label, update_id);
        Ok(())
    }

    /// Subscribe a webview to a set of top-level state keys.
    pub fn subscribe(&self, source_label: &str, keys: &[String]) -> crate::Result<Vec<String>> {
        // Hold the broadcast lock across the subscription mutation, the
        // delta-baseline reset, and the immediate state push. Without this a
        // concurrent dispatch_action's broadcast could observe an inconsistent
        // (new subscriptions, old baseline) snapshot and emit a delta computed
        // against the wrong base.
        let _broadcast_guard = self
            .broadcast_lock
            .lock()
            .map_err(|e| crate::Error::StateError(e.to_string()))?;

        let resulting = {
            let mut subs = self
                .subscriptions
                .write()
                .map_err(|e| crate::Error::Subscription {
                    source_label: source_label.to_string(),
                    message: e.to_string(),
                })?;
            subs.subscribe(source_label, keys)
        };
        // Force a full-state resync for this label so the renderer's local
        // replica matches the new key set.
        {
            let mut deltas = self
                .deltas
                .write()
                .map_err(|e| crate::Error::StateError(e.to_string()))?;
            deltas.forget(source_label);
        }
        // Push the current state immediately so the subscriber sees its
        // newly-included keys without waiting for the next dispatch. Best
        // effort: if no state manager is registered yet, skip the broadcast
        // (the next dispatch will catch up).
        self.broadcast_current_state_locked();
        Ok(resulting)
    }

    pub fn unsubscribe(&self, source_label: &str, keys: &[String]) -> crate::Result<Vec<String>> {
        let _broadcast_guard = self
            .broadcast_lock
            .lock()
            .map_err(|e| crate::Error::StateError(e.to_string()))?;

        let resulting = {
            let mut subs = self
                .subscriptions
                .write()
                .map_err(|e| crate::Error::Subscription {
                    source_label: source_label.to_string(),
                    message: e.to_string(),
                })?;
            subs.unsubscribe(source_label, keys)
        };
        {
            let mut deltas = self
                .deltas
                .write()
                .map_err(|e| crate::Error::StateError(e.to_string()))?;
            deltas.forget(source_label);
        }
        // Push the current state so the renderer's replica drops the
        // now-unsubscribed keys instead of leaving them stale until the next
        // dispatch.
        self.broadcast_current_state_locked();
        Ok(resulting)
    }

    /// Best-effort current-state broadcast used by subscription mutations.
    /// Errors (no state manager registered, transient lock failure) are
    /// swallowed because the caller's subscription change has already
    /// succeeded — the next real dispatch will reconcile.
    ///
    /// **Caller must hold `broadcast_lock`** (this function calls
    /// `broadcast_state_locked` directly to avoid a drop+reacquire window).
    fn broadcast_current_state_locked(&self) {
        if let Ok(handle) = self.state_handle() {
            if let Ok(state) = state_manager::read_state(&handle) {
                if let Err(err) = self.broadcast_state_locked(state, None) {
                    log::warn!("zubridge: post-subscription broadcast failed: {err}");
                }
            }
        }
    }

    pub fn get_window_subscriptions(&self, source_label: &str) -> crate::Result<Vec<String>> {
        let subs = self
            .subscriptions
            .read()
            .map_err(|e| crate::Error::Subscription {
                source_label: source_label.to_string(),
                message: e.to_string(),
            })?;
        Ok(subs.keys_for(source_label))
    }

    pub fn register_thunk(
        &self,
        thunk_id: String,
        parent_id: Option<String>,
        source_label: String,
        keys: Option<Vec<String>>,
        bypass_access_control: bool,
        immediate: bool,
    ) -> crate::Result<()> {
        let mut guard = self.locked_manager()?;
        let manager = guard
            .as_mut()
            .expect("locked_manager initialises the manager");
        manager.register_thunk(
            thunk_id.clone(),
            parent_id,
            source_label,
            keys,
            bypass_access_control,
            immediate,
        )?;
        // Transition straight to Executing/root, preserving the prior behaviour
        // where registration also activates the thunk (so subsequent non-thunk
        // actions queue behind it until completion).
        let _ = manager.execute_thunk(&thunk_id);
        Ok(())
    }

    pub fn complete_thunk(
        &self,
        thunk_id: &str,
        source_label: &str,
        error: Option<String>,
    ) -> crate::Result<()> {
        // Completing a thunk drains any actions queued behind it; each drained
        // state must be broadcast, so acquire `broadcast_lock` first (consistent
        // order: broadcast_lock → manager).
        let _broadcast_guard = self
            .broadcast_lock
            .lock()
            .map_err(|e| crate::Error::StateError(e.to_string()))?;
        let mut guard = self.locked_manager()?;
        let manager = guard
            .as_mut()
            .expect("locked_manager initialises the manager");

        // Verify the caller owns this thunk. Without this, any webview could
        // complete another window's in-flight thunk by id.
        let owner_label = manager
            .thunk_manager()
            .get(thunk_id)
            .ok_or_else(|| crate::Error::ThunkNotFound {
                thunk_id: thunk_id.to_string(),
            })?
            .source_label
            .clone();
        if owner_label != source_label {
            return Err(crate::Error::ThunkRegistration {
                thunk_id: thunk_id.to_string(),
                message: format!("thunk {thunk_id} is owned by {owner_label}, not {source_label}"),
            });
        }

        // Complete + drain. Without broadcasting the drained states the queued
        // actions mutate canonical state but never reach renderers (desync +
        // renderer thunk safety-timeout).
        let (_events, drained_states) = manager.on_thunk_complete(thunk_id, error)?;
        for state in drained_states {
            self.broadcast_state_locked(state, None)?;
        }
        Ok(())
    }

    /// Register a state manager at runtime (used when the plugin is initialised
    /// without one).
    pub fn register_state_manager<S: StateManager>(&self, state_manager: S) -> crate::Result<()> {
        let handle = state_manager::new_handle(state_manager);
        self.app.manage(handle);
        Ok(())
    }

    /// Drop all per-label state for a webview that's been closed: subscription
    /// keys, delta baseline, sequence counter, pending state-update acks, and
    /// any thunks owned by the webview.
    ///
    /// Wired automatically to `RunEvent::WindowEvent { event: Destroyed, .. }`
    /// in `lib.rs::forget_on_destroy`. Also exposed publicly so hosts that
    /// manage webviews outside the standard close flow (e.g. embedded webview
    /// pools) can release per-label state explicitly.
    pub fn forget_label(&self, label: &str) {
        if let Ok(mut subs) = self.subscriptions.write() {
            subs.drop_label(label);
        }
        if let Ok(mut deltas) = self.deltas.write() {
            deltas.forget(label);
        }
        if let Ok(mut tracker) = self.update_tracker.write() {
            tracker.drop_label(label);
        }
        if let Ok(mut sequences) = self.sequences.write() {
            sequences.forget(label);
        }
        if let Ok(mut guard) = self.manager.lock() {
            if let Some(manager) = guard.as_mut() {
                manager.thunk_manager_mut().drop_label(label);
            }
        }
    }

    /// Used internally by the manual emit path; left as `pub(crate)` so commands
    /// can reach it. Falls back to a JSON object if `payload` cannot be
    /// serialised, matching the previous behaviour.
    #[allow(dead_code)]
    pub(crate) fn emit_raw(&self, label: &str, event: &str, payload: JsonValue) {
        if let Err(err) = self.app.emit_to(label, event, payload) {
            log::warn!("zubridge: failed to emit {event} to {label}: {err}");
        }
    }

    /// Convenience for callers that want to push an arbitrary update event to
    /// every webview without going through the dispatch path.
    #[allow(dead_code)]
    pub fn broadcast_raw(&self, event: &str, payload: JsonValue) {
        if let Err(err) = self.app.emit(event, json!(payload)) {
            log::warn!("zubridge: failed to broadcast {event}: {err}");
        }
    }
}
