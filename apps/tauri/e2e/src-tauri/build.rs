const ZUBRIDGE_COMMANDS: &[&str] = &[
    "get_initial_state",
    "get_state",
    "dispatch_action",
    "batch_dispatch",
    "register_thunk",
    "complete_thunk",
    "state_update_ack",
    "subscribe",
    "unsubscribe",
    "get_window_subscriptions",
];

fn main() {
    tauri_build::try_build(tauri_build::Attributes::new().plugin(
        "zubridge",
        tauri_build::InlinedPlugin::new().commands(ZUBRIDGE_COMMANDS),
    ))
    .expect("failed to run tauri-build");
}
