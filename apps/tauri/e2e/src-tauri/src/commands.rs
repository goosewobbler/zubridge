//! Tauri commands paralleling the IPC handlers registered in
//! `apps/electron/e2e/src/main/index.ts`.

use serde::Serialize;
use tauri::{AppHandle, Manager, Runtime, WebviewWindow};

use crate::modes::{resolve_mode, ZubridgeMode};
use crate::window;

#[derive(Debug, Serialize)]
pub struct ModeInfo {
    pub mode: String,
    pub mode_name: String,
}

#[derive(Debug, Serialize)]
pub struct CreateRuntimeWindowResult {
    pub success: bool,
    pub window_id: String,
}

#[tauri::command]
pub fn quit_app<R: Runtime>(app: AppHandle<R>) {
    println!("[Commands] quit_app invoked");
    app.exit(0);
}

#[tauri::command]
pub fn get_mode() -> ModeInfo {
    let mode = resolve_mode();
    ModeInfo {
        mode: mode.label().to_string(),
        mode_name: mode.label().to_string(),
    }
}

#[tauri::command]
pub fn get_window_info<R: Runtime>(window: WebviewWindow<R>) -> window::WindowInfo {
    let label = window.label().to_string();
    window::window_info_for(&window.app_handle().clone(), &label)
}

#[tauri::command]
pub fn create_runtime_window<R: Runtime>(
    app: AppHandle<R>,
) -> Result<CreateRuntimeWindowResult, String> {
    let win = window::create_runtime_window(&app)?;
    Ok(CreateRuntimeWindowResult {
        success: true,
        window_id: win.label().to_string(),
    })
}

#[tauri::command]
pub fn close_current_window<R: Runtime>(window: WebviewWindow<R>) -> Result<(), String> {
    println!("[Commands] close_current_window {}", window.label());
    window.close().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn is_main_window<R: Runtime>(window: WebviewWindow<R>) -> bool {
    matches!(
        window::WindowType::from_label(window.label()),
        window::WindowType::Main
    )
}

#[allow(dead_code)]
pub const ALL_MODES: &[ZubridgeMode] = &[
    ZubridgeMode::ZustandBasic,
    ZubridgeMode::ZustandHandlers,
    ZubridgeMode::ZustandReducers,
    ZubridgeMode::Redux,
    ZubridgeMode::Custom,
];
