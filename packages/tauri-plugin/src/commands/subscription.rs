use tauri::{command, AppHandle, Runtime, Window};

use crate::models::{
    GetWindowSubscriptionsResult, SubscribeArgs, SubscribeResult, UnsubscribeArgs,
    UnsubscribeResult,
};
use crate::Result;
use crate::ZubridgeExt;

#[command]
pub(crate) async fn subscribe<R: Runtime>(
    app: AppHandle<R>,
    window: Window<R>,
    args: SubscribeArgs,
) -> Result<SubscribeResult> {
    // Webview label is taken from the runtime, never from caller-supplied args,
    // so a renderer cannot subscribe on another window's behalf.
    let source_label = window.label();
    let keys = app.zubridge().subscribe(source_label, &args.keys)?;
    Ok(SubscribeResult { keys })
}

#[command]
pub(crate) async fn unsubscribe<R: Runtime>(
    app: AppHandle<R>,
    window: Window<R>,
    args: UnsubscribeArgs,
) -> Result<UnsubscribeResult> {
    let source_label = window.label();
    let keys = app.zubridge().unsubscribe(source_label, &args.keys)?;
    Ok(UnsubscribeResult { keys })
}

#[command]
pub(crate) async fn get_window_subscriptions<R: Runtime>(
    app: AppHandle<R>,
    window: Window<R>,
) -> Result<GetWindowSubscriptionsResult> {
    let source_label = window.label();
    let keys = app.zubridge().get_window_subscriptions(source_label)?;
    Ok(GetWindowSubscriptionsResult { keys })
}
