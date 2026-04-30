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

    // If this is a renderer-driven resync, drop any pending state-update-ack
    // entries for this webview. Entries left over from before the gap would
    // never be acked (the renderer skipped those events) and would otherwise
    // leak in `StateUpdateTracker.pending_by_label` over a long-running
    // session with repeated gaps.
    if matches!(args.as_ref().and_then(|a| a.is_resync), Some(true)) {
        if let Ok(mut tracker) = app.zubridge().update_tracker().write() {
            tracker.drop_label(&source_label);
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
