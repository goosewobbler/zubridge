use crate::AppState; // Import AppState from lib.rs
use tauri::{
    Emitter,
    menu::{Menu, MenuItem, PredefinedMenuItem}, // Use PredefinedMenuItem for separator
    tray::{TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, Runtime,
};

// Make create_menu public so it can be called from lib.rs
pub fn create_menu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    let current_count = app.state::<AppState>().get_count();

    // Display current count (disabled item)
    let counter_display = MenuItem::with_id(app, "counter_display", format!("Counter: {}", current_count), false, None::<&str>)?;
    // Use shorter names like reference
    let increment = MenuItem::with_id(app, "increment", "Increment", true, None::<&str>)?;
    let decrement = MenuItem::with_id(app, "decrement", "Decrement", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;

    let menu = Menu::with_items(app, &[
        &counter_display, // Add the display item
        &PredefinedMenuItem::separator(app)?,
        &increment,
        &decrement,
        &PredefinedMenuItem::separator(app)?,
        &quit,
    ])?;
    Ok(menu)
}

// Handles menu item clicks - Modify state directly and emit event
pub fn handle_menu_event<R: Runtime>(app: &AppHandle<R>, id: &str) {
    let state = app.state::<AppState>();
    // Flag to check if state changed and menu needs update
    let mut count_changed = false;

    match id {
        "increment" => {
            println!("Tray: Increment clicked");
            state.increment();
            count_changed = true;
        }
        "decrement" => {
            println!("Tray: Decrement clicked");
            state.decrement();
            count_changed = true;
        }
        "quit" => {
            println!("Tray: Quit clicked");
            std::process::exit(0); // Exit directly
        }
        // Ignore clicks on display item or unknown ids
        _ => {},
    };

    // If count changed, update menu and emit event
    if count_changed {
        let new_count = state.get_count();
        println!("Tray: Emitting state-update event with count: {}", new_count);
        // Use reference event name
        let _ = app.emit("zubridge-tauri:state-update", new_count);

        // Update the tray menu to reflect the new count
        if let Some(tray) = app.tray_by_id("main-tray") {
            // Regenerate the menu with the new state
            if let Ok(menu) = create_menu(app) {
                let _ = tray.set_menu(Some(menu));
            }
        }
    }
}

// Sets up the system tray
pub fn setup_tray<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let menu = create_menu(app)?;
    let _tray = TrayIconBuilder::with_id("main-tray")
        .tooltip("Zubridge Tauri Example")
        .icon(app.default_window_icon().unwrap().clone())
        .menu(&menu)
        .on_menu_event(|app, event| {
            // Ensure conversion from MenuId -> &str using as_ref()
            handle_menu_event(app, event.id.as_ref());
        })
        .on_tray_icon_event(|_tray, event| {
            if let TrayIconEvent::Click {
                id, rect, position, ..
            } = event
            {
                println!("Tray Icon Clicked: id={:?}, rect={:?}, position={:?}", id, rect, position);
                // If you want left-click to show window, you need the app handle
                // Maybe pass app handle to this closure if needed, or handle differently
            }
        })
        .build(app)?;

    Ok(())
}
