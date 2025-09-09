# Zubridge Middleware Examples

This directory contains examples showing how to use the Zubridge middleware with both Electron and Tauri applications.

## Electron Examples

- `electron.ts` - Shows how to use the middleware in Electron main process using TypeScript and ESM
- `electron-client.tsx` - TypeScript/React component example for the frontend of an Electron application

## Tauri Examples

- `tauri.rs` - Shows how to use the middleware in Tauri using the Zubridge Tauri plugin
- `tauri-client.tsx` - TypeScript/React component example for the frontend of a Tauri application

## Basic Example

- `basic.rs` - A standalone Rust example that demonstrates all middleware features, including IPC performance tracking

## Performance Tracking

The middleware now includes full IPC performance tracking capabilities:

1. Tracks each step of the IPC process:

   - Action dispatch from renderer
   - Action receipt in main process
   - Action processing time
   - State update time
   - Action acknowledgment back to renderer

2. Provides detailed metrics:

   - Total round-trip time
   - Deserialization time (IPC message parsing)
   - Action processing time
   - State update time
   - Serialization time (preparing state for IPC)

3. All metrics are:
   - Logged to console (if enabled)
   - Sent over WebSocket for external monitoring
   - Available through the middleware API

## How to Use the Examples

These examples are meant to be used as references when implementing Zubridge in your own applications.

### For Electron Applications

1. Import the necessary packages:

   ```ts
   import { createZustandBridge, type ZubridgeMiddleware } from '@zubridge/electron';
   import { initZubridgeMiddleware } from '@zubridge/middleware';
   ```

2. Initialize the middleware with performance tracking:

   ```ts
   const middleware: ZubridgeMiddleware = initZubridgeMiddleware({
     logging: {
       enabled: true,
       websocket_port: 9000,
       console_output: true,
       measure_performance: true, // Enable performance measurement
       performance: {
         enabled: true,
         detail: 'high', // Collect detailed metrics
         include_in_logs: true,
         record_timings: true,
       },
     },
   });
   ```

3. Create a bridge with middleware and hooks for performance metrics:
   ```ts
   const bridge = createZustandBridge(store, [mainWindow], {
     handlers,
     middleware,
     // Optional hook to capture performance metrics
     afterProcessAction: (action, processingTime, windowId) => {
       console.log(`Action ${action.type} processed in ${processingTime.toFixed(2)}ms`);
     },
   });
   ```

### For Tauri Applications

1. Import the necessary packages:

   ```rust
   use zubridge_middleware::{
       ZubridgeMiddleware, ZubridgeMiddlewareConfig, LoggingConfig, Action,
       init_middleware
   };
   use zubridge_tauri_plugin::{ZubridgePlugin, StateManager};
   ```

2. Create a state manager implementing the `StateManager` trait
3. Initialize middleware with performance tracking:

   ```rust
   let middleware = init_middleware(ZubridgeMiddlewareConfig {
     logging: LoggingConfig {
       enabled: true,
       websocket_port: Some(9000),
       measure_performance: true,
       performance: Some(zubridge_middleware::logging::PerformanceConfig {
         enabled: true,
         detail: zubridge_middleware::logging::PerformanceDetail::High,
         include_in_logs: true,
         record_timings: true,
       }),
       ..Default::default()
     },
   });
   ```

4. Create and configure the Zubridge plugin with middleware:

   ```rust
   let zubridge_plugin = ZubridgePlugin::new(state_manager)
     .with_middleware(middleware.clone());
   ```

5. Register the plugin:
   ```rust
   app.plugin(zubridge_plugin)
   ```

## WebSocket Debugging

Both examples start a WebSocket server on port 9000 that can be used to monitor the state, actions, and performance metrics of your application. You can connect to this server using any WebSocket client.

The WebSocket server sends JSON messages that include:

- Action dispatches
- State updates
- Performance metrics for each action

This makes it easy to monitor the performance of your application in real-time and identify bottlenecks in your IPC communication.
