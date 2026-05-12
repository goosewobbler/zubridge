use crate::models::JsonValue;

/// Platform-agnostic event emission trait.
///
/// Implementations deliver Zubridge state-update and lifecycle events to the
/// renderer layer. Tauri, NAPI, and future targets each provide their own impl.
///
/// The trait is sync so core has no async-runtime dependency. Async dispatch
/// happens inside implementations (e.g. NAPI's ThreadsafeFunction.call).
pub trait EventEmitter: Send + Sync {
    /// Emit `event` with `payload` to a runtime-defined `target` string.
    ///
    /// Target semantics per runtime:
    /// - Tauri: webview label
    /// - NAPI: subscriber ID
    /// - Direct Rust: channel name
    fn emit(&self, target: &str, event: &str, payload: &JsonValue);
}
