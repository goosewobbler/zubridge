// Tauri plugin wrapper
// This module provides Tauri plugin structure for Tauri applications

use tauri::{command, Runtime};

#[command]
pub fn create_store(name: String) -> crate::core::store::Store {
    crate::core::store::Store::new(name)
}

pub fn init<R: Runtime>() -> tauri::plugin::TauriPlugin<R> {
    tauri::plugin::Builder::new("zubridge")
        .invoke_handler(tauri::generate_handler![create_store])
        .build()
}
