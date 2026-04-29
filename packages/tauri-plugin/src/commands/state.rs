use tauri::{command, AppHandle, Runtime};

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
    args: Option<GetStateArgs>,
) -> Result<GetStateResult> {
    // Selective state queries are scoped per webview, but for now the renderer
    // does not yet pass a source label here. When it does, the plugin will use
    // `get_state` (with `source_label`) to filter; today this command returns
    // the unfiltered state, plus optional client-side key filter.
    let mut value = app.zubridge().get_initial_state()?;
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
