use tauri::{AppHandle, Emitter, Runtime};

use crate::emit::EventEmitter;
use crate::models::JsonValue;

pub struct TauriEmitter<R: Runtime> {
    app: AppHandle<R>,
}

impl<R: Runtime> TauriEmitter<R> {
    pub fn new(app: AppHandle<R>) -> Self {
        Self { app }
    }
}

impl<R: Runtime> EventEmitter for TauriEmitter<R> {
    fn emit(&self, target: &str, event: &str, payload: &JsonValue) {
        if let Err(err) = self.app.emit_to(target.to_string(), event, payload) {
            log::warn!("zubridge: failed to emit {event} to {target}: {err}");
        }
    }
}
