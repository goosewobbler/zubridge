//! Mirrors `apps/electron/e2e/src/main/bridge.ts` - picks a `StateManager`
//! implementation based on the active mode and wires it into the Zubridge
//! Tauri plugin.

use tauri::plugin::TauriPlugin;
use tauri::Wry;
use tauri_plugin_zubridge::{plugin, ZubridgeOptions, STATE_UPDATE_EVENT};

use crate::modes::{
    custom::CustomStore, redux::ReduxStore, zustand_basic::BasicStore,
    zustand_handlers::HandlersStore, zustand_reducers::ReducersStore, ZubridgeMode,
};

/// Build the Zubridge plugin for the given mode.
pub fn build_plugin(mode: ZubridgeMode) -> TauriPlugin<Wry> {
    let options = ZubridgeOptions {
        event_name: STATE_UPDATE_EVENT.to_string(),
    };
    println!(
        "[Bridge] Building Zubridge plugin for mode={} event_name={}",
        mode.label(),
        options.event_name
    );
    match mode {
        ZubridgeMode::ZustandBasic => plugin(BasicStore::new(), options),
        ZubridgeMode::ZustandHandlers => plugin(HandlersStore::new(), options),
        ZubridgeMode::ZustandReducers => plugin(ReducersStore::new(), options),
        ZubridgeMode::Redux => plugin(ReduxStore::new(), options),
        ZubridgeMode::Custom => plugin(CustomStore::new(), options),
    }
}
