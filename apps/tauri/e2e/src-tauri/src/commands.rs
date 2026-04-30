//! Tauri commands paralleling the IPC handlers registered in
//! `apps/electron/e2e/src/main/index.ts`.

use serde::Serialize;
use tauri::{AppHandle, Manager, Runtime, WebviewWindow};

use crate::modes::{resolve_mode, ZubridgeMode};
use crate::window;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModeInfo {
    pub mode: String,
    pub mode_name: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
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
        mode_name: mode.display_name().to_string(),
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

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn mode_info_serializes_with_camel_case_keys() {
        let info = ModeInfo {
            mode: "redux".into(),
            mode_name: "Redux".into(),
        };
        let value = serde_json::to_value(&info).unwrap();
        assert_eq!(
            value,
            json!({ "mode": "redux", "modeName": "Redux" }),
            "renderer reads `modeName` (camelCase) from this payload",
        );
    }

    #[test]
    fn get_mode_returns_distinct_label_and_display_name() {
        let info = get_mode();
        assert!(!info.mode.is_empty());
        assert!(!info.mode_name.is_empty());
        // mode is the kebab-case identifier; mode_name is the human-readable
        // display name. They should never be the same string.
        assert_ne!(info.mode, info.mode_name);
    }

    #[test]
    fn create_runtime_window_result_serializes_with_camel_case_keys() {
        let result = CreateRuntimeWindowResult {
            success: true,
            window_id: "runtime_42".into(),
        };
        let value = serde_json::to_value(&result).unwrap();
        assert_eq!(
            value,
            json!({ "success": true, "windowId": "runtime_42" }),
            "renderer reads `windowId` (camelCase) from this payload",
        );
    }
}
