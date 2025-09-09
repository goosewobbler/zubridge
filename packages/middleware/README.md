<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/goosewobbler/zubridge/main/resources/zubridge-hero.png">
  <source media="(prefers-color-scheme: light)" srcset="https://raw.githubusercontent.com/goosewobbler/zubridge/main/resources/zubridge-hero.png">
  <img alt="zubridge hero image" src="https://raw.githubusercontent.com/goosewobbler/zubridge/main/resources/zubridge-hero.png" style="max-height: 415px;">
</picture>

<h1 align="center" style="display:none;" id="middleware-fallback-title">Zubridge Middleware</h1>
<script>
  document.addEventListener('DOMContentLoaded', function() {
    var img = document.querySelector('picture img');
    img.onerror = function() {
      this.style.display = 'none';
      document.getElementById('middleware-fallback-title').style.display = 'block';
    };
  });
</script>

_Advanced debugging, logging and state management tools for Zubridge applications_

The Zubridge Middleware package provides powerful debugging, logging, and state management tools for Zubridge-enabled applications. Implemented in Rust with NAPI-rs bindings for JavaScript, this middleware works seamlessly with both Electron and Tauri applications.

## Features

- 🔍 **State Inspection**: Observe your application state in real-time
- 📝 **Action Logging**: Track all actions dispatched in your application
- 🕸️ **WebSocket Server**: Connect to your application remotely for debugging
- 🔄 **State Replay**: Save and replay application states
- 🔌 **Extensible**: Create custom middleware for your specific needs
- ⚡ **Native Performance**: Rust-based implementation with JavaScript bindings

## Installation

### For Tauri Applications

Add to your Cargo.toml:

```toml
[dependencies]
zubridge-middleware = { version = "0.1.0", features = ["tauri"] }
```

### For Electron Applications

```bash
# Using npm
npm install @zubridge/middleware

# Using yarn
yarn add @zubridge/middleware

# Using pnpm
pnpm add @zubridge/middleware
```

## Quick Start

### With Electron

```typescript
import { createZustandBridge } from '@zubridge/electron';
import { initZubridgeMiddleware } from '@zubridge/middleware';
import { createStore } from 'zustand/vanilla';

// Create your store
const store = createStore((set) => ({
  counter: 0,
  increment: () => set((state) => ({ counter: state.counter + 1 })),
}));

// Initialize middleware
const middleware = initZubridgeMiddleware({
  logging: {
    enabled: true,
    websocket_port: 9000, // WebSocket server will listen on this port
  },
});

// Pass middleware directly to the bridge
const bridge = createZustandBridge(store, [], {
  handlers: {
    // Your handlers here
  },
  middleware, // Add middleware to the bridge
});
```

### With Tauri

```rust
use zubridge_middleware::{init_middleware, ZubridgeMiddlewareConfig, LoggingConfig};
use zubridge_tauri::{ZubridgePlugin, StateManager};
use serde::{Deserialize, Serialize};
use tauri::App;

// Define your state
#[derive(Serialize, Deserialize, Clone, Debug)]
struct AppState {
    counter: i32,
    theme: ThemeState,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
struct ThemeState {
    is_dark: bool,
}

// Implement a state manager
struct MyStateManager {
    // Your state storage implementation
}

impl StateManager for MyStateManager {
    // Implement required methods
    fn get_state(&self) -> serde_json::Value {
        // Return your state as JSON
        serde_json::to_value(AppState {
            counter: 0,
            theme: ThemeState { is_dark: false },
        }).unwrap()
    }

    fn process_action(&self, action: &zubridge_tauri::Action) -> Result<(), String> {
        // Process the action
        Ok(())
    }
}

fn main() {
    // Create your state manager
    let state_manager = MyStateManager::new();

    // Initialize middleware
    let middleware_config = ZubridgeMiddlewareConfig {
        logging: LoggingConfig {
            enabled: true,
            websocket_port: Some(9000),
            console_output: true,
            ..Default::default()
        },
        ..Default::default()
    };

    let middleware = init_middleware(middleware_config);

    // Create and configure the plugin
    let zubridge_plugin = ZubridgePlugin::new(state_manager)
        .with_middleware(middleware);

    // Use with Tauri builder
    tauri::Builder::default()
        .plugin(zubridge_plugin)
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

## Using Multiple Middleware

The Zubridge middleware system supports composition of multiple middleware instances:

```typescript
import { createZustandBridge, createMiddleware } from '@zubridge/electron';
import { initZubridgeMiddleware } from '@zubridge/middleware';

// Initialize Zubridge middleware from the @zubridge/middleware package
const zubridgeMiddleware = initZubridgeMiddleware({
  logging: { enabled: true, websocket_port: 9000 },
});

// Initialize middleware
const middleware = initZubridgeMiddleware({
  logging: {
    enabled: true,
    websocketPort: 9000,
    consoleOutput: true,
  },
  // Add more middleware config as needed
});

// Create a middleware chain
const middlewareChain = createMiddleware().use({
  name: 'custom-logger',
  beforeAction: (action) => {
    console.log(`Custom logger: Action dispatched: ${action.type}`);
  },
});

// Pass an array of middleware to the bridge
const bridge = createZustandBridge(store, [], {
  // Your options here
  middleware: [zubridgeMiddleware, middlewareChain],
});
```

## Middleware Chain Creation

You can also create middleware chains using the provided API:

```typescript
import { createZustandBridge, createMiddleware } from '@zubridge/electron';

// Create a middleware chain
const middleware = createMiddleware()
  .use({
    name: 'logger',
    beforeAction: (action) => {
      console.log(`Dispatching action: ${action.type}`);
    },
    afterAction: (action, processingTime) => {
      console.log(`Action processed in ${processingTime}ms`);
    },
  })
  .use({
    name: 'state-logger',
    afterStateUpdate: (state) => {
      console.log('New state:', state);
    },
  });

// Pass the middleware chain to the bridge
const bridge = createZustandBridge(store, [], {
  // Your options here
  middleware,
});
```

## Configuration Options

The middleware can be configured with the following options:

### JavaScript

```typescript
const middleware = initZubridgeMiddleware({
  logging: {
    enabled: true, // Enable/disable logging
    websocket_port: 9000, // WebSocket server port (undefined to disable)
    console_output: true, // Whether to log to console
    log_limit: 100, // Maximum number of log entries to keep in memory
    measure_performance: true, // Whether to measure and log action processing time
    pretty_print: true, // Whether to pretty-print JSON in console logs
    verbose: false, // Whether to enable verbose debug logging
  },
  // Future: Add more middleware options here
});
```

### Rust

```rust
let middleware_config = ZubridgeMiddlewareConfig {
    logging: LoggingConfig {
        enabled: true,
        websocket_port: Some(9000),
        console_output: true,
        log_limit: Some(100),
        measure_performance: true,
        pretty_print: true,
        verbose: false,
    },
    // Future: Add more middleware options here
    ..Default::default()
};
```

## WebSocket Server

When the WebSocket server is enabled, it provides a real-time view of your application state and actions. The server is implemented in Rust for high performance and is available in both Electron and Tauri environments.

### Connecting to the WebSocket Server

```javascript
// In browser or Node.js
const socket = new WebSocket('ws://localhost:9000');

socket.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('Received update:', data);
};
```

## Advanced Rust Integration

For more advanced use cases in Tauri, you can create custom middleware by implementing the Middleware trait:

```rust
use zubridge_middleware::{Middleware, Action, Error};
use async_trait::async_trait;
use serde_json::Value as JsonValue;

pub struct MyCustomMiddleware;

#[async_trait]
impl Middleware for MyCustomMiddleware {
    async fn process_action(&self, action: Action) -> Result<(), Error> {
        println!("Processing action: {}", action.action_type);
        Ok(())
    }

    async fn set_state(&self, state: JsonValue) -> Result<(), Error> {
        println!("New state: {}", state);
        Ok(())
    }
}
```

## API Reference

### JavaScript

```typescript
import { initZubridgeMiddleware } from '@zubridge/middleware';

const middleware = initZubridgeMiddleware({
  logging: {
    enabled: true,
    websocket_port: 9000,
    console_output: true,
    log_limit: 100,
  },
});

// Core middleware methods
await middleware.processAction({ type: 'counter.increment', payload: 1 });
await middleware.setState(currentState);
const state = await middleware.getState();
```

### Rust

```rust
use zubridge_middleware::{init_middleware, ZubridgeMiddlewareConfig, LoggingConfig, Action};

// Initialize middleware
let middleware = init_middleware(ZubridgeMiddlewareConfig::default());

// Core middleware methods
middleware.process_action(Action {
    action_type: "counter.increment".to_string(),
    payload: Some(serde_json::json!(1)),
}).await?;

middleware.set_state(current_state).await?;
let state = middleware.get_state().await;
```

## License

MIT
