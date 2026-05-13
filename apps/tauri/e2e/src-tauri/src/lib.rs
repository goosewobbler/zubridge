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

    let use_embedded_server = std::env::var("WDIO_EMBEDDED_SERVER")
        .map(|v| !matches!(v.to_lowercase().as_str(), "" | "0" | "false"))
        .unwrap_or(false);

    // This is a dedicated E2E-only binary; tauri_plugin_wdio is always loaded so that
    // browser.tauri.execute/mock/etc are available in every test session regardless of
    // which WebDriver provider is used. tauri_plugin_wdio_webdriver (the HTTP server) is
    // only needed for the embedded provider and is gated behind WDIO_EMBEDDED_SERVER.
    let mut builder = tauri::Builder::default()
        .plugin(
            tauri_plugin_log::Builder::new()
                .targets([
                    tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Stdout),
                    tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Webview),
                ])
                .level(log::LevelFilter::Debug)
                .build(),
        )
        .plugin(zubridge_plugin)
        .plugin(tauri_plugin_wdio::init());

    if use_embedded_server {
        builder = builder.plugin(tauri_plugin_wdio_webdriver::init());
    }

    builder
        .setup(move |app| {
            let app_handle = app.app_handle().clone();

            // Create windows AFTER plugins (especially tauri-plugin-wdio) have
            // initialised so the frontend plugin can intercept invoke before
            // any test runs. Mirrors the wdio-desktop-mobile-example app.
            if let Err(e) = window::create_initial_windows(&app_handle) {
                eprintln!("[App] Failed to create initial windows: {}", e);
            }

            // Auto-open DevTools when explicitly requested (e.g. ZUBRIDGE_DEVTOOLS=1).
            // Off by default so it doesn't interfere with WDIO test runs.
            if std::env::var("ZUBRIDGE_DEVTOOLS")
                .map(|v| !matches!(v.to_lowercase().as_str(), "" | "0" | "false"))
                .unwrap_or(false)
            {
                for window in app_handle.webview_windows().values() {
                    window.open_devtools();
                }
            }

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
