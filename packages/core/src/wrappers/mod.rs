// Platform-specific wrappers
// This module contains the platform-specific bindings for different targets

#[cfg(feature = "napi")]
pub mod napi;

#[cfg(feature = "tauri")]
pub mod tauri;
