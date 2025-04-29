use std::sync::{Arc, Mutex};
use tauri::{
  plugin::{Builder, TauriPlugin},
  Manager, Runtime,
};

pub use models::*;

#[cfg(desktop)]
mod desktop;
#[cfg(mobile)]
mod mobile;

mod commands;
mod error;
mod models;

pub use error::{Error, Result};

#[cfg(desktop)]
use desktop::Zubridge;
#[cfg(mobile)]
use mobile::Zubridge;

/// Extensions to [`tauri::App`], [`tauri::AppHandle`] and [`tauri::Window`] to access the zubridge APIs.
pub trait ZubridgeExt<R: Runtime> {
  fn zubridge(&self) -> &Zubridge<R>;
}

impl<R: Runtime, T: Manager<R>> crate::ZubridgeExt<R> for T {
  fn zubridge(&self) -> &Zubridge<R> {
    self.state::<Zubridge<R>>().inner()
  }
}

// Constants for commands and events
pub const GET_INITIAL_STATE_COMMAND: &str = "zubridge.get-initial-state";
pub const DISPATCH_ACTION_COMMAND: &str = "zubridge.dispatch-action";
pub const STATE_UPDATE_EVENT: &str = "zubridge://state-update";

/// Creates the Zubridge plugin with the provided state manager and options.
/// The plugin manages the state and emits events on updates.
pub fn plugin<R: Runtime, S: StateManager>(
    state_manager: S,
    options: ZubridgeOptions,
) -> TauriPlugin<R> {
    let state_arc: Arc<Mutex<dyn StateManager>> = Arc::new(Mutex::new(state_manager));

    Builder::new("zubridge")
        .invoke_handler(tauri::generate_handler![
            commands::get_initial_state,
            commands::dispatch_action
        ])
        .setup(move |app, api| {
            #[cfg(mobile)]
            let zubridge = mobile::init(app, api)?;
            #[cfg(desktop)]
            let zubridge = desktop::init(app, api)?;

            // Register the state manager and options
            app.manage(state_arc);
            app.manage(options);
            app.manage(zubridge);
            Ok(())
        })
        .build()
}

/// Creates the Zubridge plugin with the provided state manager and default options.
pub fn plugin_default<R: Runtime, S: StateManager>(
    state_manager: S
) -> TauriPlugin<R> {
    plugin::<R, S>(state_manager, ZubridgeOptions::default())
}

/// Initializes the plugin without a state manager.
/// You'll need to register a state manager manually using the ZubridgeExt API.
pub fn init<R: Runtime>() -> TauriPlugin<R> {
  Builder::new("zubridge")
    .invoke_handler(tauri::generate_handler![
        commands::get_initial_state,
        commands::dispatch_action
    ])
    .setup(|app, api| {
      #[cfg(mobile)]
      let zubridge = mobile::init(app, api)?;
      #[cfg(desktop)]
      let zubridge = desktop::init(app, api)?;
      app.manage(zubridge);
      Ok(())
    })
    .build()
}
