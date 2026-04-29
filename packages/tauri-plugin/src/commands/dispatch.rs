use tauri::{command, AppHandle, Runtime};
use uuid::Uuid;

use crate::models::{
    BatchDispatchArgs, BatchDispatchResult, DispatchActionArgs, DispatchActionResult,
};
use crate::Result;
use crate::ZubridgeExt;

#[command]
pub(crate) async fn dispatch_action<R: Runtime>(
    app: AppHandle<R>,
    args: DispatchActionArgs,
) -> Result<DispatchActionResult> {
    let mut action = args.action;
    if action.id.is_none() {
        action.id = Some(Uuid::new_v4().to_string());
    }
    let action_id = app.zubridge().dispatch_action(action)?;
    Ok(DispatchActionResult { action_id })
}

#[command]
pub(crate) async fn batch_dispatch<R: Runtime>(
    app: AppHandle<R>,
    args: BatchDispatchArgs,
) -> Result<BatchDispatchResult> {
    let BatchDispatchArgs { batch_id, actions } = args;
    let actions: Vec<_> = actions
        .into_iter()
        .map(|mut action| {
            if action.id.is_none() {
                action.id = Some(Uuid::new_v4().to_string());
            }
            action
        })
        .collect();
    app.zubridge().batch_dispatch(batch_id, actions)
}
