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
use tauri_plugin_zubridge::{ZubridgeExt, STATE_UPDATE_EVENT};

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

            // Refresh the tray on every state-update event. We read the full
            // state straight from the plugin's StateManager rather than trying
            // to reconstruct it from the event payload - delta payloads only
            // carry the keys that changed, so deserialising one as a complete
            // TrayState would default the unchanged keys (e.g. theme would
            // silently revert to "dark" on a counter-only change).
            let tray_handle = app_handle.clone();
            app_handle.listen(STATE_UPDATE_EVENT, move |_event| {
                let state = match tray_handle.zubridge().get_initial_state() {
                    Ok(value) => value,
                    Err(e) => {
                        eprintln!("[App] Failed to read state for tray refresh: {}", e);
                        return;
                    }
                };
                let tray_state = tray::TrayState::from_json(&state);
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
