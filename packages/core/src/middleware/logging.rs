// Logging middleware implementation
// This is an example middleware that logs store events

use super::Middleware;

pub struct LoggingMiddleware;

impl Middleware for LoggingMiddleware {
    fn on_store_created(&self, store_name: &str) {
        println!("[Zubridge] Store created: {}", store_name);
    }

    fn on_state_update(&self, store_name: &str, action: &str) {
        println!("[Zubridge] State update in {}: {}", store_name, action);
    }
}
