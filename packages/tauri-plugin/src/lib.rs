use tauri::{
    plugin::{Builder, TauriPlugin},
    Manager, Runtime,
};

pub use models::*;

#[cfg(desktop)]
mod desktop;
#[cfg(mobile)]
mod mobile;

pub mod commands;
pub mod core;
mod error;
mod models;

pub use error::{Error, Result};

#[cfg(desktop)]
pub use desktop::Zubridge;
#[cfg(mobile)]
pub use mobile::Zubridge;

/// Extension trait giving `tauri::App`, `AppHandle`, and `Window` access to the
/// Zubridge plugin.
pub trait ZubridgeExt<R: Runtime> {
    fn zubridge(&self) -> &Zubridge<R>;
}

impl<R: Runtime, T: Manager<R>> crate::ZubridgeExt<R> for T {
    fn zubridge(&self) -> &Zubridge<R> {
        self.state::<Zubridge<R>>().inner()
    }
}

/// Default Tauri event name for state-update payloads.
pub const STATE_UPDATE_EVENT: &str = "zubridge://state-update";

/// Build the plugin with the given state manager and options.
pub fn plugin<R: Runtime, S: StateManager>(
    state_manager: S,
    options: ZubridgeOptions,
) -> TauriPlugin<R> {
    let handle = crate::core::state_manager::new_handle(state_manager);

    Builder::new("zubridge")
        .invoke_handler(tauri::generate_handler![
            commands::state::get_initial_state,
            commands::state::get_state,
            commands::dispatch::dispatch_action,
            commands::dispatch::batch_dispatch,
            commands::thunk::register_thunk,
            commands::thunk::complete_thunk,
            commands::thunk::state_update_ack,
            commands::subscription::subscribe,
            commands::subscription::unsubscribe,
            commands::subscription::get_window_subscriptions,
        ])
        .setup(move |app, api| {
            #[cfg(mobile)]
            let mut zubridge = mobile::init(app, api)?;
            #[cfg(desktop)]
            let mut zubridge = desktop::init(app, api)?;
            zubridge.set_options(options.clone());

            app.manage(handle.clone());
            app.manage(zubridge);
            Ok(())
        })
        .build()
}

/// Build the plugin with the given state manager and default options.
pub fn plugin_default<R: Runtime, S: StateManager>(state_manager: S) -> TauriPlugin<R> {
    plugin::<R, S>(state_manager, ZubridgeOptions::default())
}

/// Build the plugin without a state manager. The host must register one later
/// via [`Zubridge::register_state_manager`].
pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("zubridge")
        .invoke_handler(tauri::generate_handler![
            commands::state::get_initial_state,
            commands::state::get_state,
            commands::dispatch::dispatch_action,
            commands::dispatch::batch_dispatch,
            commands::thunk::register_thunk,
            commands::thunk::complete_thunk,
            commands::thunk::state_update_ack,
            commands::subscription::subscribe,
            commands::subscription::unsubscribe,
            commands::subscription::get_window_subscriptions,
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
