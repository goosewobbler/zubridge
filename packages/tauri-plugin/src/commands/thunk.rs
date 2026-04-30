use tauri::{command, AppHandle, Runtime, Window};

use crate::models::{
    CompleteThunkArgs, CompleteThunkResult, RegisterThunkArgs, RegisterThunkResult,
    StateUpdateAckArgs,
};
use crate::Result;
use crate::ZubridgeExt;

#[command]
pub(crate) async fn register_thunk<R: Runtime>(
    app: AppHandle<R>,
    window: Window<R>,
    args: RegisterThunkArgs,
) -> Result<RegisterThunkResult> {
    // Webview label is taken from the runtime, never from caller-supplied args.
    let source_label = window.label().to_string();
    let RegisterThunkArgs {
        thunk_id,
        parent_id,
        keys,
        bypass_access_control,
        immediate,
    } = args;
    app.zubridge().register_thunk(
        thunk_id.clone(),
        parent_id,
        source_label,
        keys,
        bypass_access_control.unwrap_or(false),
        immediate.unwrap_or(false),
    )?;
    Ok(RegisterThunkResult { thunk_id })
}

#[command]
pub(crate) async fn complete_thunk<R: Runtime>(
    app: AppHandle<R>,
    window: Window<R>,
    args: CompleteThunkArgs,
) -> Result<CompleteThunkResult> {
    let source_label = window.label();
    let CompleteThunkArgs { thunk_id, error } = args;
    app.zubridge()
        .complete_thunk(&thunk_id, source_label, error)?;
    Ok(CompleteThunkResult { thunk_id })
}

#[command]
pub(crate) async fn state_update_ack<R: Runtime>(
    app: AppHandle<R>,
    window: Window<R>,
    args: StateUpdateAckArgs,
) -> Result<()> {
    let source_label = window.label();
    app.zubridge().state_update_ack(source_label, &args.update_id)
}
