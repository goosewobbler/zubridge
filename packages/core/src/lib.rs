// Main entry point for zubridge-core
// Conditionally compiles different platform wrappers based on feature flags

pub mod core;
pub mod middleware;

#[cfg(any(feature = "napi", feature = "tauri"))]
pub mod wrappers;

// Re-export core types for convenience
pub use core::store::Store;

#[cfg(feature = "uniffi")]
pub use core::store::create_store;

// UniFFI scaffolding
#[cfg(feature = "uniffi")]
uniffi::setup_scaffolding!();
