use crate::AppState; // Import AppState from lib.rs

use tauri::{
    AppHandle,
    Manager,
    Runtime,
    menu::{Menu, MenuBuilder, MenuItemBuilder, PredefinedMenuItem},
    tray::{TrayIconBuilder, TrayIconEvent, TrayIcon},
};
use tauri_plugin_zubridge::{JsonValue, ZubridgeExt};
use serde_json::json;

// Make create_menu public so it can be called from main app lib.rs
// Updated to use Tauri v2 menu APIs
pub fn create_menu<R: Runtime>(
    app_handle: &AppHandle<R>,
    state: &AppState,
) -> Result<Menu<R>, Box<dyn std::error::Error>> {
    let counter_text = format!("Counter: {}", state.counter);
    let theme_text = format!("Theme: {}", if state.theme.is_dark { "Dark" } else { "Light" });

    // Use enabled(false) instead of disabled(true)
    let counter_display = MenuItemBuilder::new(counter_text)
        .id("counter_display")
        .enabled(false)
        .build(app_handle)?;
    let theme_display = MenuItemBuilder::new(theme_text)
        .id("theme_display")
        .enabled(false)
        .build(app_handle)?;

    let increment = MenuItemBuilder::new("Increment").id("increment").build(app_handle)?;
    let decrement = MenuItemBuilder::new("Decrement").id("decrement").build(app_handle)?;
    let reset = MenuItemBuilder::new("Reset Counter").id("reset_counter").build(app_handle)?;
    let toggle_theme = MenuItemBuilder::new("Toggle Theme").id("toggle_theme").build(app_handle)?;
    let show_window = MenuItemBuilder::new("Show Window").id("show_window").build(app_handle)?;
    let quit = MenuItemBuilder::new("Quit").id("quit").build(app_handle)?;

    let menu = MenuBuilder::new(app_handle)
        .items(&[
            &counter_display,
            &theme_display,
            &PredefinedMenuItem::separator(app_handle)?,
            &increment,
            &decrement,
            &reset,
            &toggle_theme,
            &PredefinedMenuItem::separator(app_handle)?,
            &show_window,
            &quit,
        ])
        .build()?;

    Ok(menu)
}

// Handles system tray events - Updated for v2 event structure
pub fn handle_tray_item_click<R: Runtime>(app_handle: &AppHandle<R>, id: &str) {
    match id {
        "increment" => {
            let _ = dispatch_bridge_action(
                app_handle,
                "COUNTER:INCREMENT",
                Some(json!(1)), // Wrap payload in Some()
            );
        }
        "decrement" => {
            let _ = dispatch_bridge_action(
                app_handle,
                "COUNTER:DECREMENT",
                Some(json!(1)), // Wrap payload in Some()
            );
        }
        "reset_counter" => {
            let _ = dispatch_bridge_action(
                app_handle,
                "COUNTER:RESET",
                None, // Wrap payload in None
            );
        }
        "toggle_theme" => {
            let _ = dispatch_bridge_action(
                app_handle,
                "THEME:TOGGLE",
                None, // Wrap payload in None
            );
        }
        "show_window" => {
            // Use get_webview_window in v2
            if let Some(window) = app_handle.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }
        "quit" => {
            app_handle.exit(0);
        }
        _ => {}
    }
}

// Dispatch action using the Zubridge plugin
fn dispatch_bridge_action<R: Runtime>(
    app_handle: &AppHandle<R>,
    action_type: &str,
    payload: Option<JsonValue>,
) -> Result<(), String> {
    println!("Tray dispatch_bridge_action called with type: {}", action_type);

    // Create the action object
    let action = tauri_plugin_zubridge::ZubridgeAction {
        action_type: action_type.to_string(),
        payload,
    };

    // Print the action for debugging
    println!("Tray creating action: {{ action_type: \"{}\", payload: {:?} }}",
             action.action_type, action.payload);

    // Use the plugin extension trait to dispatch the action
    match app_handle.zubridge().dispatch_action(action) {
        Ok(result) => {
            println!("Tray action dispatched successfully, result: {:?}", result);
            Ok(())
        },
        Err(e) => {
            eprintln!("Tray failed to dispatch action: {}", e);
            Err(format!("Failed to dispatch action: {}", e))
        }
    }
}

// Sets up the system tray - Updated for v2
pub fn setup_tray<R: Runtime>(app_handle: AppHandle<R>) -> Result<TrayIcon<R>, Box<dyn std::error::Error>> {
    // Need initial state to build the first menu
    // Clone state if it's managed, otherwise use default
    let initial_state = match app_handle.try_state::<AppState>() {
        Some(managed_state) => managed_state.inner().clone(),
        None => {
            // If state isn't managed yet, use a default. This might happen if setup_tray is called before state is managed.
            // Consider managing state earlier or ensuring setup order.
            eprintln!("Warning: AppState not managed when creating initial tray. Using default.");
            AppState {
                counter: 0,
                theme: crate::ThemeState { is_dark: false }
            } // Provide a sensible default
        }
    };

    let initial_menu = create_menu(&app_handle, &initial_state)?;

    // Create the tray icon using Tauri v2 APIs
    let tray = TrayIconBuilder::with_id("main-tray")
        .tooltip("Zubridge Tauri Example")
        // Use the default window icon from the app
        .icon(app_handle.default_window_icon().unwrap().clone())
        .menu(&initial_menu)
        .on_menu_event(move |app, event| {
            handle_tray_item_click(app, event.id().as_ref());
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: tauri::tray::MouseButton::Left,
                button_state: tauri::tray::MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
        })
        .build(&app_handle)?;

    Ok(tray)
}
