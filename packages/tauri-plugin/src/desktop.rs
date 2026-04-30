use serde::de::DeserializeOwned;
use std::sync::{Arc, Mutex, RwLock};

use serde_json::json;
use tauri::{plugin::PluginApi, AppHandle, Emitter, Manager, Runtime};
use uuid::Uuid;

use crate::core::{DeltaCalculator, StateUpdateTracker, SubscriptionManager, ThunkRegistry};
use crate::core::state_manager::{self, StateManagerHandle};
use crate::models::{
    BatchDispatchResult, JsonValue, StateManager, StateUpdatePayload, UpdateSource,
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
        thunks: Arc::new(RwLock::new(ThunkRegistry::new())),
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
    thunks: Arc<RwLock<ThunkRegistry>>,
    update_tracker: Arc<RwLock<StateUpdateTracker>>,
    sequences: Arc<RwLock<SequenceTracker>>,
    /// Serialises broadcast_state calls so concurrent dispatches can't interleave
    /// the (read prev → compute delta → emit → record new prev) sequence and
    /// produce stale deltas computed against an outdated baseline.
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

    pub fn thunks(&self) -> &Arc<RwLock<ThunkRegistry>> {
        &self.thunks
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

    /// Read the current state from the state manager.
    pub fn get_initial_state(&self) -> crate::Result<JsonValue> {
        state_manager::read_state(&self.state_handle()?)
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

    /// Dispatch a single action and broadcast the resulting state.
    pub fn dispatch_action(&self, action: ZubridgeAction) -> crate::Result<String> {
        let action_id = action
            .id
            .clone()
            .unwrap_or_else(|| Uuid::new_v4().to_string());
        let new_state = state_manager::dispatch(&self.state_handle()?, action.to_legacy_json())
            .map_err(|e| crate::Error::ActionProcessing {
                action_id: Some(action_id.clone()),
                message: e.to_string(),
            })?;

        let source = UpdateSource {
            action_id: Some(action_id.clone()),
            thunk_id: action.thunk_parent_id.clone(),
        };

        self.broadcast_state(new_state, Some(source))?;
        Ok(action_id)
    }

    /// Sequentially apply a batch of actions and emit a single coalesced
    /// state-update event after the last action has been processed. Per-action
    /// broadcasts are skipped — emitting N events for N actions defeats the
    /// purpose of batching.
    pub fn batch_dispatch(
        &self,
        batch_id: String,
        actions: Vec<ZubridgeAction>,
    ) -> crate::Result<BatchDispatchResult> {
        if actions.is_empty() {
            return Ok(BatchDispatchResult {
                batch_id,
                acked_action_ids: Vec::new(),
            });
        }

        let mut acked = Vec::with_capacity(actions.len());
        let handle = self.state_handle()?;
        // Apply each action against the state manager; do NOT broadcast per action.
        let mut last_action_id: Option<String> = None;
        let mut last_thunk_id: Option<String> = None;
        for action in actions {
            let action_id = action
                .id
                .clone()
                .unwrap_or_else(|| Uuid::new_v4().to_string());
            state_manager::dispatch(&handle, action.to_legacy_json()).map_err(|e| {
                crate::Error::ActionProcessing {
                    action_id: Some(action_id.clone()),
                    message: e.to_string(),
                }
            })?;
            last_action_id = Some(action_id.clone());
            last_thunk_id = action.thunk_parent_id.clone();
            acked.push(action_id);
        }

        // Single coalesced broadcast attributed to the last action in the batch.
        let new_state = state_manager::read_state(&handle)?;
        let source = UpdateSource {
            action_id: last_action_id,
            thunk_id: last_thunk_id,
        };
        self.broadcast_state(new_state, Some(source))?;

        Ok(BatchDispatchResult {
            batch_id,
            acked_action_ids: acked,
        })
    }

    /// Compute and emit a state update for every active webview.
    fn broadcast_state(
        &self,
        new_state: JsonValue,
        source: Option<UpdateSource>,
    ) -> crate::Result<()> {
        // Serialise the entire compute → emit → record sequence so two concurrent
        // dispatches can't both compute deltas against the same prev baseline,
        // emit them with adjacent sequence numbers, and leave the renderer with
        // a state that's been merged from two parallel diff bases.
        let _broadcast_guard = self
            .broadcast_lock
            .lock()
            .map_err(|e| crate::Error::StateError(e.to_string()))?;

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

            // Compute delta and record the new baseline atomically under the
            // deltas write lock. Holding this across emit_to is safe because
            // emit_to does not touch the deltas store.
            let (delta, full_state) = {
                let mut calc = self
                    .deltas
                    .write()
                    .map_err(|e| crate::Error::StateError(e.to_string()))?;
                let result = match calc.compute(label, &scoped) {
                    Some(delta) => (Some(delta), None),
                    None => (None, Some(scoped.clone())),
                };
                calc.record(label, scoped);
                result
            };

            // No-op delta: the action produced an identical state for this
            // webview's scoped view. Skip the event entirely — emitting an
            // empty delta would still trigger a Zustand state replacement and
            // re-render on the renderer.
            if let Some(d) = &delta {
                if d.is_no_op() {
                    continue;
                }
            }

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
        let mut subs = self
            .subscriptions
            .write()
            .map_err(|e| crate::Error::Subscription {
                source_label: source_label.to_string(),
                message: e.to_string(),
            })?;
        let resulting = subs.subscribe(source_label, keys);
        // Force a full-state resync for this label so the renderer's local
        // replica matches the new key set.
        let mut deltas = self
            .deltas
            .write()
            .map_err(|e| crate::Error::StateError(e.to_string()))?;
        deltas.forget(source_label);
        Ok(resulting)
    }

    pub fn unsubscribe(&self, source_label: &str, keys: &[String]) -> crate::Result<Vec<String>> {
        let mut subs = self
            .subscriptions
            .write()
            .map_err(|e| crate::Error::Subscription {
                source_label: source_label.to_string(),
                message: e.to_string(),
            })?;
        let resulting = subs.unsubscribe(source_label, keys);
        let mut deltas = self
            .deltas
            .write()
            .map_err(|e| crate::Error::StateError(e.to_string()))?;
        deltas.forget(source_label);
        Ok(resulting)
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
        let mut registry = self
            .thunks
            .write()
            .map_err(|e| crate::Error::ThunkRegistration {
                thunk_id: thunk_id.clone(),
                message: e.to_string(),
            })?;
        registry
            .register(
                thunk_id.clone(),
                parent_id,
                source_label,
                keys,
                bypass_access_control,
                immediate,
            )
            .map_err(|message| crate::Error::ThunkRegistration {
                thunk_id: thunk_id.clone(),
                message,
            })?;
        registry.mark_executing(&thunk_id);
        Ok(())
    }

    pub fn complete_thunk(
        &self,
        thunk_id: &str,
        source_label: &str,
        error: Option<String>,
    ) -> crate::Result<()> {
        let mut registry = self.thunks.write().map_err(|e| crate::Error::ThunkRegistration {
            thunk_id: thunk_id.to_string(),
            message: e.to_string(),
        })?;

        // Verify the caller owns this thunk. Without this, any webview could
        // complete another window's in-flight thunk by id.
        let owner_label = registry
            .get(thunk_id)
            .ok_or_else(|| crate::Error::ThunkNotFound {
                thunk_id: thunk_id.to_string(),
            })?
            .source_label
            .clone();
        if owner_label != source_label {
            return Err(crate::Error::ThunkRegistration {
                thunk_id: thunk_id.to_string(),
                message: format!(
                    "thunk {thunk_id} is owned by {owner_label}, not {source_label}"
                ),
            });
        }

        registry
            .complete(thunk_id, error)
            .map_err(|_| crate::Error::ThunkNotFound {
                thunk_id: thunk_id.to_string(),
            })?;
        Ok(())
    }

    /// Register a state manager at runtime (used when the plugin is initialised
    /// without one).
    pub fn register_state_manager<S: StateManager>(
        &self,
        state_manager: S,
    ) -> crate::Result<()> {
        let handle = state_manager::new_handle(state_manager);
        self.app.manage(handle);
        Ok(())
    }

    /// Drop all per-label state for a webview that's been closed. Currently not
    /// wired to a Tauri lifecycle event but exposed for hosts to call.
    /// Pending or executing thunks owned by the webview are also discarded so
    /// their entries don't leak in the registry.
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
        if let Ok(mut thunks) = self.thunks.write() {
            thunks.drop_label(label);
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
