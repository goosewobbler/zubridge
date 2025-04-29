# `@zubridge/tauri` Example App

A Tauri v1 application demonstrating the use of Zubridge for state management between frontend and Rust backend. This example showcases:

- Shared state between frontend and backend
- Counter management
- Theme toggling
- System tray integration
- Multiple window synchronization

## Features

- **State Management**: Full state synchronization between Rust backend and JavaScript frontend
- **Multi-Window Support**: All windows share the same state through the Zubridge bridge
- **System Tray**: Tray menu reflects application state and allows interaction with the app
- **Responsive UI**: Demonstrates both light and dark theme modes
- **Robust Communication**: Uses Tauri's IPC system with the Zubridge abstraction layer

## Running the example

```bash
# Run the app in development mode
pnpm dev

# Clean and rebuild dependencies
pnpm clean
pnpm build

# Run with hot reload for the frontend only
pnpm dev:vite
```

## Building for production

```bash
# Build for production
pnpm build

# Build and create platform-specific installers
pnpm build:all
```

## Project Structure

- `src/` - Frontend TypeScript code
  - `renderer/` - UI components and hooks
  - `styles/` - CSS stylesheets
- `src-tauri/` - Rust backend code
  - `src/` - Application logic, including state management
  - `Cargo.toml` - Rust dependencies

## Implementation Notes

This example demonstrates best practices for Tauri applications using Zubridge:

1. Backend maintains authoritative state
2. Frontend uses `useZubridgeStore` and `useZubridgeDispatch` hooks
3. State changes are propagated via events
4. All windows stay in sync automatically

For more details on Tauri integration, see the [Zubridge Tauri documentation](/packages/tauri/README.md).
