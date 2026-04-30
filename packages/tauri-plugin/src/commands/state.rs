use tauri::{command, AppHandle, Runtime, Window};

use crate::models::{GetStateArgs, GetStateResult, JsonValue};
use crate::Result;
use crate::ZubridgeExt;

#[command]
pub(crate) async fn get_initial_state<R: Runtime>(app: AppHandle<R>) -> Result<JsonValue> {
    app.zubridge().get_initial_state()
}

#[command]
pub(crate) async fn get_state<R: Runtime>(
    app: AppHandle<R>,
    window: Window<R>,
    args: Option<GetStateArgs>,
) -> Result<GetStateResult> {
    // Filter via the SubscriptionManager using the runtime-supplied webview label,
    // so a webview cannot read keys it isn't subscribed to.
    let source_label = window.label().to_string();

    // If this is a renderer-driven resync, reset per-label tracking so the
    // state we're about to return becomes the new ground truth:
    //
    //   1. Drop pending state-update-ack entries — events from before the gap
    //      will never be acked and would otherwise leak in
    //      `StateUpdateTracker.pending_by_label`.
    //
    //   2. Clear the delta baseline for this webview — without this the Rust
    //      baseline B remains at whatever was last emitted before the gap.
    //      After the resync the renderer holds fresh state R (from this call),
    //      but the next broadcast would compute D = B → N rather than R → N.
    //      If gap events added a key that is later removed, B won't contain
    //      that key, so the "remove" entry is absent from D and the renderer
    //      keeps the key indefinitely. Clearing the baseline forces the next
    //      broadcast to emit a full-state payload, realigning both sides.
    if matches!(args.as_ref().and_then(|a| a.is_resync), Some(true)) {
        if let Ok(mut tracker) = app.zubridge().update_tracker().write() {
            tracker.drop_label(&source_label);
        }
        if let Ok(mut deltas) = app.zubridge().deltas().write() {
            deltas.forget(&source_label);
        }
    }

    let mut value = app.zubridge().get_state(Some(&source_label))?;

    // The optional client-side key list narrows further but cannot widen.
    if let Some(args) = args {
        if let Some(keys) = args.keys {
            if let JsonValue::Object(map) = &value {
                let mut filtered = serde_json::Map::with_capacity(keys.len());
                for key in keys {
                    if let Some(v) = map.get(&key) {
                        filtered.insert(key, v.clone());
                    }
                }
                value = JsonValue::Object(filtered);
            }
        }
    }
    Ok(GetStateResult { value })
}
