# Zubridge Middleware Examples

This directory contains examples showing how to use the Zubridge middleware with both Electron and Tauri applications.

## Electron Examples

- `electron.ts` - Shows how to use the middleware in Electron main process using TypeScript and ESM
- `electron-client.tsx` - TypeScript/React component example for the frontend of an Electron application

## Tauri Examples

- `tauri.rs` - Shows how to use the middleware in Tauri using the Zubridge Tauri plugin
- `tauri-client.tsx` - TypeScript/React component example for the frontend of a Tauri application

## How to Use the Examples

These examples are meant to be used as references when implementing Zubridge in your own applications.

### For Electron Applications

1. Import the necessary packages:

   ```ts
   import { createZustandBridge, type ZubridgeMiddleware } from '@zubridge/electron';
   import { initZubridgeMiddleware } from '@zubridge/middleware';
   ```

2. Initialize the middleware:

   ```ts
   const middleware: ZubridgeMiddleware = initZubridgeMiddleware({
     logging: {
       enabled: true,
       websocket_port: 9000,
       console_output: true,
     },
   });
   ```

3. Create a bridge with middleware:
   ```ts
   const bridge = createZustandBridge(store, [mainWindow], {
     handlers,
     // Just pass the middleware instance directly
     middleware,
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
3. Initialize middleware:

   ```rust
   let middleware = init_middleware(ZubridgeMiddlewareConfig {...});
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

Both examples start a WebSocket server on port 9000 that can be used to monitor the state and actions of your application. You can connect to this server using any WebSocket client.
