use tauri::{command, AppHandle, Runtime};

use crate::models::{
    GetWindowSubscriptionsArgs, GetWindowSubscriptionsResult, SubscribeArgs, SubscribeResult,
    UnsubscribeArgs, UnsubscribeResult,
};
use crate::Result;
use crate::ZubridgeExt;

#[command]
pub(crate) async fn subscribe<R: Runtime>(
    app: AppHandle<R>,
    args: SubscribeArgs,
) -> Result<SubscribeResult> {
    let keys = app.zubridge().subscribe(&args.source_label, &args.keys)?;
    Ok(SubscribeResult { keys })
}

#[command]
pub(crate) async fn unsubscribe<R: Runtime>(
    app: AppHandle<R>,
    args: UnsubscribeArgs,
) -> Result<UnsubscribeResult> {
    let keys = app.zubridge().unsubscribe(&args.source_label, &args.keys)?;
    Ok(UnsubscribeResult { keys })
}

#[command]
pub(crate) async fn get_window_subscriptions<R: Runtime>(
    app: AppHandle<R>,
    args: GetWindowSubscriptionsArgs,
) -> Result<GetWindowSubscriptionsResult> {
    let keys = app.zubridge().get_window_subscriptions(&args.source_label)?;
    Ok(GetWindowSubscriptionsResult { keys })
}
