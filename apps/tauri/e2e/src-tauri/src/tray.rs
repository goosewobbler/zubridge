//! System-tray menu reflecting the current Zubridge state. Mirrors
//! `apps/electron/e2e/src/main/tray/` - it just reads counter and theme out
//! of whatever the active mode happens to expose.

use serde_json::Value;
use tauri::{
    menu::{Menu, MenuBuilder, MenuItemBuilder, PredefinedMenuItem},
    tray::{TrayIcon, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, Runtime,
};
use tauri_plugin_zubridge::{ZubridgeAction, ZubridgeExt};

const TRAY_ID: &str = "main-tray";

#[derive(Debug, Clone)]
pub struct TrayState {
    pub counter: i32,
    pub theme: String,
}

impl TrayState {
    pub fn from_json(value: &Value) -> Self {
        let counter = value
            .get("counter")
            .and_then(Value::as_i64)
            .unwrap_or(0) as i32;
        let theme = value
            .get("theme")
            .and_then(Value::as_str)
            .unwrap_or("dark")
            .to_string();
        Self { counter, theme }
    }
}

pub fn create_menu<R: Runtime>(
    app_handle: &AppHandle<R>,
    state: &TrayState,
) -> Result<Menu<R>, Box<dyn std::error::Error>> {
    let counter_text = format!("Counter: {}", state.counter);
    let theme_text = format!("Theme: {}", state.theme);

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

pub fn handle_tray_item_click<R: Runtime>(app_handle: &AppHandle<R>, id: &str) {
    match id {
        "increment" => dispatch(app_handle, "COUNTER:INCREMENT", None),
        "decrement" => dispatch(app_handle, "COUNTER:DECREMENT", None),
        "reset_counter" => dispatch(app_handle, "COUNTER:RESET", None),
        "toggle_theme" => dispatch(app_handle, "THEME:TOGGLE", None),
        "show_window" => {
            if let Some(window) = app_handle.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }
        "quit" => app_handle.exit(0),
        _ => {}
    }
}

fn dispatch<R: Runtime>(app_handle: &AppHandle<R>, action_type: &str, payload: Option<Value>) {
    let action = ZubridgeAction {
        id: None,
        action_type: action_type.to_string(),
        payload,
        source_label: Some("__tray".to_string()),
        thunk_parent_id: None,
        immediate: None,
        keys: None,
        bypass_access_control: None,
        starts_thunk: None,
        ends_thunk: None,
    };
    if let Err(e) = app_handle.zubridge().dispatch_action(action) {
        eprintln!("[Tray] Failed to dispatch {}: {}", action_type, e);
    }
}

pub fn refresh_menu<R: Runtime>(app_handle: &AppHandle<R>, state: &TrayState) {
    if let Some(tray) = app_handle.tray_by_id(TRAY_ID) {
        match create_menu(app_handle, state) {
            Ok(menu) => {
                if let Err(e) = tray.set_menu(Some(menu)) {
                    eprintln!("[Tray] Failed to set new menu: {}", e);
                }
            }
            Err(e) => eprintln!("[Tray] Failed to build new menu: {}", e),
        }
    }
}

pub fn setup_tray<R: Runtime>(
    app_handle: AppHandle<R>,
) -> Result<TrayIcon<R>, Box<dyn std::error::Error>> {
    let initial_state = TrayState {
        counter: 0,
        theme: "dark".to_string(),
    };
    let initial_menu = create_menu(&app_handle, &initial_state)?;
    let tray = TrayIconBuilder::with_id(TRAY_ID)
        .tooltip("Zubridge Tauri Example")
        .icon(app_handle.default_window_icon().unwrap().clone())
        .menu(&initial_menu)
        .on_menu_event(move |app, event| handle_tray_item_click(app, event.id().as_ref()))
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
