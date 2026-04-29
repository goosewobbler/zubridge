#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

pub mod bridge;
pub mod commands;
pub mod features;
pub mod modes;
pub mod store;
pub mod tray;
pub mod window;

use tauri::{Listener, Manager};
use tauri_plugin_zubridge::STATE_UPDATE_EVENT;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mode = modes::resolve_mode();
    println!("[App] Starting Zubridge Tauri E2E with mode={}", mode.label());

    let zubridge_plugin = bridge::build_plugin(mode);

    tauri::Builder::default()
        .plugin(zubridge_plugin)
        .setup(move |app| {
            let app_handle = app.app_handle().clone();

            match tray::setup_tray(app_handle.clone()) {
                Ok(_tray) => println!("[App] Tray installed"),
                Err(e) => eprintln!("[App] Tray setup failed: {}", e),
            }

            // Listen for state-update events emitted by the plugin so the tray
            // menu always reflects the latest counter / theme values.
            let tray_handle = app_handle.clone();
            app_handle.listen(STATE_UPDATE_EVENT, move |event| {
                let payload_str = event.payload();
                let parsed: serde_json::Value = match serde_json::from_str(payload_str) {
                    Ok(v) => v,
                    Err(e) => {
                        eprintln!("[App] Could not parse state-update payload: {}", e);
                        return;
                    }
                };
                let state_value = parsed
                    .get("full_state")
                    .cloned()
                    .or_else(|| {
                        parsed
                            .get("delta")
                            .and_then(|delta| delta.get("changed"))
                            .cloned()
                    })
                    .unwrap_or(parsed);
                let tray_state = tray::TrayState::from_json(&state_value);
                tray::refresh_menu(&tray_handle, &tray_state);
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::quit_app,
            commands::get_mode,
            commands::get_window_info,
            commands::create_runtime_window,
            commands::close_current_window,
            commands::is_main_window,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
