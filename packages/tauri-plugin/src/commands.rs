use tauri::{AppHandle, command, Runtime};

use crate::models::*;
use crate::Result;
use crate::ZubridgeExt;

#[command(rename = "zubridge.get-initial-state")]
pub(crate) async fn get_initial_state<R: Runtime>(
    app: AppHandle<R>,
) -> Result<JsonValue> {
    app.zubridge().get_initial_state()
}

#[command(rename = "zubridge.dispatch-action")]
pub(crate) async fn dispatch_action<R: Runtime>(
    app: AppHandle<R>,
    action: ZubridgeAction,
) -> Result<JsonValue> {
    app.zubridge().dispatch_action(action)
}
