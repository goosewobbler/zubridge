# ZuBridge Examples

This directory contains examples demonstrating different state management patterns with ZuBridge.

## Available Examples

### [electron-minimal-zustand-basic](./electron/zustand-basic)

The simplest Zustand implementation with basic store setup and state synchronization.

### [electron-minimal-zustand-handlers](./electron/zustand-handlers)

Zustand pattern using handlers detached from the store definition for improved separation of concerns.

### [electron-minimal-zustand-reducers](./electron/zustand-reducers)

Zustand implementation with Redux-style reducers for predictable state updates.

### [electron-minimal-redux](./electron/redux)

Redux integration showing how to use ZuBridge with Redux state management.

### [electron-minimal-custom](./electron/custom)

Custom state management implementation demonstrating ZuBridge's flexibility.

## Getting Started

Each example is a complete Electron application that you can run independently:

```bash
# Navigate to any example
cd examples/electron-zustand-basic

# Install dependencies
pnpm install

# Start development server
pnpm dev

# Build for production
pnpm build

# Run tests
pnpm test
```

## Architecture

All examples follow the same basic structure:

- `src/main/` - Main process code with ZuBridge integration
- `src/renderer/` - Renderer process React components
- `src/preload/` - Preload script for secure IPC
- `src/features/` - State management and business logic
- `test/` - E2E tests using WebDriverIO

## Key Concepts

- **Bridge Pattern**: Each example shows how to set up bidirectional communication between main and renderer processes
- **State Synchronization**: Demonstrates real-time state sync across processes
- **Type Safety**: Full TypeScript support with shared type definitions
- **Testing**: Complete E2E test coverage for all state operations
