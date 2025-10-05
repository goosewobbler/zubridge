// Middleware trait and implementations
// This module contains the middleware architecture for extending Zubridge functionality

pub mod logging;

pub trait Middleware: Send + Sync {
    fn on_store_created(&self, store_name: &str);
    fn on_state_update(&self, store_name: &str, action: &str);
}

pub struct MiddlewareChain {
    pub middlewares: Vec<Box<dyn Middleware>>,
}

impl MiddlewareChain {
    pub fn new() -> Self {
        MiddlewareChain {
            middlewares: Vec::new(),
        }
    }

    pub fn add(&mut self, middleware: Box<dyn Middleware>) {
        self.middlewares.push(middleware);
    }

    pub fn trigger_store_created(&self, store_name: &str) {
        for mw in &self.middlewares {
            mw.on_store_created(store_name);
        }
    }

    pub fn trigger_state_update(&self, store_name: &str, action: &str) {
        for mw in &self.middlewares {
            mw.on_state_update(store_name, action);
        }
    }
}

impl Default for MiddlewareChain {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_middleware_chain_new_creates_empty_chain() {
        let chain = MiddlewareChain::new();
        // Chain should be created successfully
        assert_eq!(chain.middlewares.len(), 0);
    }

    #[test]
    fn test_middleware_chain_add_middleware() {
        let mut chain = MiddlewareChain::new();
        let logging_middleware = Box::new(logging::LoggingMiddleware);

        chain.add(logging_middleware);
        assert_eq!(chain.middlewares.len(), 1);
    }

    #[test]
    fn test_middleware_chain_trigger_store_created() {
        let mut chain = MiddlewareChain::new();
        let logging_middleware = Box::new(logging::LoggingMiddleware);

        chain.add(logging_middleware);

        // This should not panic
        chain.trigger_store_created("test-store");
    }

    #[test]
    fn test_middleware_chain_trigger_state_update() {
        let mut chain = MiddlewareChain::new();
        let logging_middleware = Box::new(logging::LoggingMiddleware);

        chain.add(logging_middleware);

        // This should not panic
        chain.trigger_state_update("test-store", "increment");
    }

    #[test]
    fn test_multiple_middlewares_in_chain() {
        let mut chain = MiddlewareChain::new();

        chain.add(Box::new(logging::LoggingMiddleware));
        chain.add(Box::new(logging::LoggingMiddleware));

        assert_eq!(chain.middlewares.len(), 2);

        // Both middlewares should be triggered
        chain.trigger_store_created("multi-test");
    }
}
