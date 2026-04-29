use tauri::{command, AppHandle, Runtime};

use crate::models::{
    CompleteThunkArgs, CompleteThunkResult, RegisterThunkArgs, RegisterThunkResult,
    StateUpdateAckArgs,
};
use crate::Result;
use crate::ZubridgeExt;

#[command]
pub(crate) async fn register_thunk<R: Runtime>(
    app: AppHandle<R>,
    args: RegisterThunkArgs,
) -> Result<RegisterThunkResult> {
    let RegisterThunkArgs {
        thunk_id,
        parent_id,
        source_label,
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
    args: CompleteThunkArgs,
) -> Result<CompleteThunkResult> {
    let CompleteThunkArgs {
        thunk_id,
        source_label,
        error,
    } = args;
    app.zubridge()
        .complete_thunk(&thunk_id, &source_label, error)?;
    Ok(CompleteThunkResult { thunk_id })
}

#[command]
pub(crate) async fn state_update_ack<R: Runtime>(
    app: AppHandle<R>,
    args: StateUpdateAckArgs,
) -> Result<()> {
    app.zubridge()
        .state_update_ack(&args.source_label, &args.update_id)
}
