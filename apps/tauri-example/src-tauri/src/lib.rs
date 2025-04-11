// Declare the tray module
mod tray;

use std::sync::Mutex;
// Need Manager trait for app.tray_by_id
// Need Listener trait for app.listen
use tauri::{Emitter, Listener, Manager, State};

// --- State Management ---
// Use a Mutex to safely manage shared state across threads
#[derive(Default)]
pub struct CounterState {
    counter: i32,
}

pub struct AppState(pub Mutex<CounterState>);

impl AppState {
    // Helper to get the current counter value
    fn get_count(&self) -> i32 {
        self.0.lock().unwrap().counter
    }

    // Helper to increment the counter
    fn increment(&self) {
        let mut state = self.0.lock().unwrap();
        state.counter += 1;
    }

    // Helper to decrement the counter
    fn decrement(&self) {
        let mut state = self.0.lock().unwrap();
        state.counter -= 1;
    }

    // Helper to add a specific value
    fn add(&self, value: i32) {
        let mut state = self.0.lock().unwrap();
        state.counter += value;
    }
}

// --- Tauri Commands ---
// These functions will be callable from the frontend

#[tauri::command]
fn get_counter(state: State<'_, AppState>) -> i32 {
    state.get_count()
}

#[tauri::command]
fn increment_counter(state: State<'_, AppState>, app_handle: tauri::AppHandle) -> i32 {
    state.increment();
    let new_count = state.get_count();
    // Emit state update event
    let _ = app_handle.emit("zubridge-tauri:state-update", new_count);
    println!("Command: Emitting state-update event from increment with count: {}", new_count);
    new_count // Return the new count
}

#[tauri::command]
fn decrement_counter(state: State<'_, AppState>, app_handle: tauri::AppHandle) -> i32 {
    state.decrement();
    let new_count = state.get_count();
    // Emit state update event
    let _ = app_handle.emit("zubridge-tauri:state-update", new_count);
    println!("Command: Emitting state-update event from decrement with count: {}", new_count);
    new_count // Return the new count
}

#[tauri::command]
fn add_to_counter(value: i32, state: State<'_, AppState>, app_handle: tauri::AppHandle) -> i32 {
    state.add(value);
    let new_count = state.get_count();
    // Emit state update event
    let _ = app_handle.emit("zubridge-tauri:state-update", new_count);
    println!("Command: Emitting state-update event from add with count: {}", new_count);
    new_count
}

#[tauri::command]
fn reset_counter(state: State<'_, AppState>, app_handle: tauri::AppHandle) -> Result<i32, String> {
    let new_count = {
        let mut counter_state = state.0.lock().unwrap();
        counter_state.counter = 0;
        println!("Counter reset to 0 via Command");
        counter_state.counter
    };
     // Emit state update event
    let _ = app_handle.emit("zubridge-tauri:state-update", new_count);
    println!("Command: Emitting state-update event from reset with count: {}", new_count);
    Ok(new_count)
}

// New command to exit the application
#[tauri::command]
fn quit_app() {
    println!("Received quit_app command. Exiting application...");
    std::process::exit(0);
}

// --- Application Setup ---
pub fn run() {
    let initial_state = AppState(Mutex::new(CounterState::default()));

    tauri::Builder::default()
        .setup(|app| {
            // Setup initial tray
            tray::setup_tray(app.handle())?;

            // --- Add Backend Listener for Tray Updates ---
            let app_handle = app.handle().clone();
            app.listen("zubridge-tauri:state-update", move |_event| {
                println!("Backend listener received state-update event.");
                // Get the tray handle by ID
                if let Some(tray) = app_handle.tray_by_id("main-tray") {
                    println!("Found tray, attempting to update menu...");
                    // Regenerate the menu with the current state
                    if let Ok(new_menu) = tray::create_menu(&app_handle) {
                        // Set the new menu for the tray
                        match tray.set_menu(Some(new_menu)) {
                            Ok(_) => println!("Tray menu updated successfully."),
                            Err(e) => println!("Error setting tray menu: {:?}", e),
                        }
                    } else {
                        println!("Error creating new tray menu.");
                    }
                } else {
                    println!("Could not find tray with ID 'main-tray' to update.");
                }
            });
            // --- End Backend Listener ---

            Ok(())
        })
        .manage(initial_state)
        .invoke_handler(tauri::generate_handler![
            get_counter,
            increment_counter,
            decrement_counter,
            add_to_counter,
            reset_counter,
            quit_app
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
