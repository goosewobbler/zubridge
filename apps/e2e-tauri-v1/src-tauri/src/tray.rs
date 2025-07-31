use tauri::{
    AppHandle, CustomMenuItem, Manager, SystemTray, SystemTrayEvent, SystemTrayMenu, SystemTrayMenuItem,
};

use crate::AppState;
// Import the action struct from lib.rs
// use crate::ZubridgeAction;

// Create the initial system tray definition
pub fn create_tray() -> SystemTray {
    let tray_menu = SystemTrayMenu::new()
        .add_item(CustomMenuItem::new("increment", "Increment"))
        .add_item(CustomMenuItem::new("decrement", "Decrement"))
        .add_item(CustomMenuItem::new("reset_counter", "Reset Counter"))
        .add_native_item(SystemTrayMenuItem::Separator)
        .add_item(CustomMenuItem::new("toggle_theme", "Toggle Theme"))
        .add_native_item(SystemTrayMenuItem::Separator)
        .add_item(CustomMenuItem::new("show_window", "Show Window"))
        .add_item(CustomMenuItem::new("quit", "Quit"));

    SystemTray::new().with_menu(tray_menu)
}

// Function to create an updated menu based on state (used for updates)
pub fn create_menu(state: &AppState) -> SystemTrayMenu {
    let counter_text = format!("Counter: {}", state.counter);
    let theme_text = format!("Theme: {}", if state.theme.is_dark { "Dark" } else { "Light" });

    SystemTrayMenu::new()
        .add_item(CustomMenuItem::new("counter_display", counter_text).disabled())
        .add_item(CustomMenuItem::new("theme_display", theme_text).disabled())
        .add_native_item(SystemTrayMenuItem::Separator)
        .add_item(CustomMenuItem::new("increment", "Increment"))
        .add_item(CustomMenuItem::new("decrement", "Decrement"))
        .add_item(CustomMenuItem::new("reset_counter", "Reset Counter"))
        .add_native_item(SystemTrayMenuItem::Separator)
        .add_item(CustomMenuItem::new("toggle_theme", "Toggle Theme"))
        .add_native_item(SystemTrayMenuItem::Separator)
        .add_item(CustomMenuItem::new("show_window", "Show Window"))
        .add_item(CustomMenuItem::new("quit", "Quit"))
}

// Handles tray events (menu clicks, icon clicks)
pub fn handle_tray_event(app: &AppHandle, event: SystemTrayEvent) {
    if let SystemTrayEvent::MenuItemClick { id, .. } = event {
        // Get state manager reference
        let state_manager = app.state::<crate::AppStateManager>();

        match id.as_str() {
            "increment" => {
                state_manager.increment();
                let current_state = state_manager.get_state();
                let _ = app.tray_handle().set_menu(create_menu(&current_state));
                let _ = app.emit_all("zubridge://state-update", &current_state);
            }
            "decrement" => {
                state_manager.decrement();
                let current_state = state_manager.get_state();
                let _ = app.tray_handle().set_menu(create_menu(&current_state));
                let _ = app.emit_all("zubridge://state-update", &current_state);
            }
            "reset_counter" => {
                state_manager.reset();
                let current_state = state_manager.get_state();
                let _ = app.tray_handle().set_menu(create_menu(&current_state));
                let _ = app.emit_all("zubridge://state-update", &current_state);
            }
            "toggle_theme" => {
                state_manager.toggle_theme();
                let current_state = state_manager.get_state();
                let _ = app.tray_handle().set_menu(create_menu(&current_state));
                let _ = app.emit_all("zubridge://state-update", &current_state);
            }
            "show_window" => {
                if let Some(window) = app.get_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
            "quit" => {
                app.exit(0);
            }
            _ => {}
        }
    }
}

// REMOVED: setup_tray function (integrated into lib.rs Builder setup)
