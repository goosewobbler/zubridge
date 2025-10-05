// Main entry point for zubridge-core
// Conditionally compiles different platform wrappers based on feature flags

pub mod core;
pub mod middleware;

#[cfg(feature = "napi")]
pub mod wrappers;

// Re-export core types for convenience
// These will be uncommented in Task 3 when modules have content
// pub use core::*;
// pub use middleware::*;
