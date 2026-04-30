use serde::{Deserialize, Serialize};
use std::fmt::Debug;

pub use serde_json::Value as JsonValue;

/// An action dispatched to the state manager. Mirrors the TS `Action` shape, with
/// internal flags exposed as snake_case fields on the wire.
#[derive(Deserialize, Serialize, Debug, Clone)]
pub struct ZubridgeAction {
    /// Unique identifier for tracking action acknowledgements
    #[serde(default)]
    pub id: Option<String>,
    /// The action type label
    pub action_type: String,
    /// Optional payload for the action
    #[serde(default)]
    pub payload: Option<JsonValue>,
    /// Webview label that originated this action (Tauri analogue of WebContents id)
    #[serde(default)]
    pub source_label: Option<String>,
    /// Parent thunk id if this action is dispatched from within a thunk
    #[serde(default)]
    pub thunk_parent_id: Option<String>,
    /// Bypass action queue and execute immediately
    #[serde(default)]
    pub immediate: Option<bool>,
    /// State keys this action affects (for access control)
    #[serde(default)]
    pub keys: Option<Vec<String>>,
    /// Bypass subscription/access-control checks
    #[serde(default)]
    pub bypass_access_control: Option<bool>,
    /// Whether this action initiates a thunk
    #[serde(default)]
    pub starts_thunk: Option<bool>,
    /// Whether this action terminates a thunk
    #[serde(default)]
    pub ends_thunk: Option<bool>,
}

impl ZubridgeAction {
    /// Returns the action JSON in the legacy `{ type, payload }` shape that
    /// `StateManager::dispatch_action` expects.
    pub fn to_legacy_json(&self) -> JsonValue {
        serde_json::json!({
            "type": self.action_type,
            "payload": self.payload,
        })
    }
}

/// Options for the Zubridge plugin.
#[derive(Clone, Debug)]
pub struct ZubridgeOptions {
    /// The event name used for state updates. Defaults to `zubridge://state-update`.
    pub event_name: String,
}

impl Default for ZubridgeOptions {
    fn default() -> Self {
        Self {
            event_name: "zubridge://state-update".to_string(),
        }
    }
}

/// Result of processing an action — mirrors the TS `ProcessResult` shape.
#[derive(Debug, Clone, Serialize)]
pub struct ProcessResult {
    pub action_id: Option<String>,
    pub is_sync: bool,
    pub error: Option<String>,
}

/// A trait that manages state for the app.
///
/// Implementors hold the application's state (typically wrapping a Rust struct,
/// a Redux-style reducer, or similar) and respond to dispatched actions.
pub trait StateManager: Send + Sync + 'static {
    /// Get the initial / current state of the app.
    fn get_initial_state(&self) -> JsonValue;

    /// Apply an action to the state and return the new state.
    fn dispatch_action(&mut self, action: JsonValue) -> JsonValue;
}

/// Payload sent to the renderer over the state-update event.
#[derive(Debug, Clone, Serialize)]
pub struct StateUpdatePayload {
    /// Monotonic per-webview sequence number
    pub seq: u64,
    /// Identifier used by the renderer to acknowledge receipt
    pub update_id: String,
    /// Delta against the previous state — present when delta encoding is in use
    #[serde(skip_serializing_if = "Option::is_none")]
    pub delta: Option<StateDelta>,
    /// Full state — present on initial sync, after a sequence gap, or when delta is unavailable
    #[serde(skip_serializing_if = "Option::is_none")]
    pub full_state: Option<JsonValue>,
    /// Provenance of the change that triggered this update
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source: Option<UpdateSource>,
}

/// Delta describing what changed in the state since the previous update.
#[derive(Debug, Clone, Serialize, Default)]
pub struct StateDelta {
    /// Top-level keys whose values changed (full new value attached)
    pub changed: serde_json::Map<String, JsonValue>,
    /// Top-level keys that were removed
    pub removed: Vec<String>,
}

/// Source attribution for a state update.
#[derive(Debug, Clone, Serialize, Default)]
pub struct UpdateSource {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub action_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub thunk_id: Option<String>,
}

// ---------- Command payloads / responses ----------

#[derive(Deserialize, Debug)]
pub struct DispatchActionArgs {
    pub action: ZubridgeAction,
}

#[derive(Serialize, Debug)]
pub struct DispatchActionResult {
    pub action_id: String,
}

#[derive(Deserialize, Debug)]
pub struct BatchDispatchArgs {
    pub batch_id: String,
    pub actions: Vec<ZubridgeAction>,
}

#[derive(Serialize, Debug)]
pub struct BatchDispatchResult {
    pub batch_id: String,
    pub acked_action_ids: Vec<String>,
    /// Present when at least one action in the batch was applied successfully
    /// before the batch encountered a per-action failure. The renderer reads
    /// this to selectively resolve actions that did commit (their ids are in
    /// `acked_action_ids`) while rejecting the failing action and any actions
    /// that were aborted because the loop bailed out. A fully successful
    /// batch leaves this `None`.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub failed: Option<BatchFailure>,
}

/// Per-action failure descriptor for `BatchDispatchResult.failed`.
#[derive(Serialize, Debug, Clone)]
pub struct BatchFailure {
    pub action_id: String,
    pub message: String,
}

#[derive(Deserialize, Debug)]
pub struct GetStateArgs {
    #[serde(default)]
    pub keys: Option<Vec<String>>,
}

#[derive(Serialize, Debug)]
pub struct GetStateResult {
    pub value: JsonValue,
}

#[derive(Deserialize, Debug)]
pub struct RegisterThunkArgs {
    pub thunk_id: String,
    #[serde(default)]
    pub parent_id: Option<String>,
    #[serde(default)]
    pub keys: Option<Vec<String>>,
    #[serde(default)]
    pub bypass_access_control: Option<bool>,
    #[serde(default)]
    pub immediate: Option<bool>,
}

#[derive(Serialize, Debug)]
pub struct RegisterThunkResult {
    pub thunk_id: String,
}

#[derive(Deserialize, Debug)]
pub struct CompleteThunkArgs {
    pub thunk_id: String,
    #[serde(default)]
    pub error: Option<String>,
}

#[derive(Serialize, Debug)]
pub struct CompleteThunkResult {
    pub thunk_id: String,
}

#[derive(Deserialize, Debug)]
pub struct StateUpdateAckArgs {
    pub update_id: String,
}

#[derive(Deserialize, Debug)]
pub struct SubscribeArgs {
    pub keys: Vec<String>,
}

#[derive(Serialize, Debug)]
pub struct SubscribeResult {
    pub keys: Vec<String>,
}

#[derive(Deserialize, Debug)]
pub struct UnsubscribeArgs {
    pub keys: Vec<String>,
}

#[derive(Serialize, Debug)]
pub struct UnsubscribeResult {
    pub keys: Vec<String>,
}

#[derive(Serialize, Debug)]
pub struct GetWindowSubscriptionsResult {
    pub keys: Vec<String>,
}
