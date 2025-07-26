# E2E Electron

End-to-end testing app for Zubridge Electron with all Zustand modes.

## Overview

This app demonstrates all approaches of using Zubridge with Electron, serving as a comprehensive testing environment for the different state management patterns supported by Zubridge.

## Features

- **Multiple Modes**: Demonstrates all Zustand patterns (basic, handlers, reducers)
- **Redux Integration**: Shows Redux integration with Zubridge
- **Custom State Manager**: Example of custom state management implementation
- **Comprehensive Testing**: Full E2E testing capabilities for all modes
- **System Tray**: Advanced tray functionality for all modes
- **Theme Management**: Dark/light theme switching across all modes
- **Counter Operations**: Various counter operations (increment, decrement, double, halve)
- **Error Handling**: Intentional error testing for error handling scenarios
- **State Generation**: Large state generation for performance testing

## Modes

### Basic Mode

- Action handlers attached directly to store state
- Simplest Zustand pattern
- Direct function calls through bridge

### Handlers Mode

- Separate action handler functions
- Organized by feature (counter, theme, state, error)
- Clean separation of concerns

### Reducers Mode

- Redux-style reducer functions
- Pure functions for state updates
- Familiar pattern for Redux developers

### Redux Mode

- Full Redux integration
- Redux Toolkit with slices
- Standard Redux patterns

### Custom Mode

- Custom EventEmitter-based state manager
- Implements StateManager interface
- Example of custom state management

## Development

```bash
# Install dependencies
pnpm install

# Start development (defaults to basic mode)
pnpm dev

# Start specific mode
pnpm dev:basic
pnpm dev:handlers
pnpm dev:reducers
pnpm dev:redux
pnpm dev:custom

# Build all modes
pnpm build

# Build specific mode
pnpm build:zustand-basic
pnpm build:zustand-handlers
pnpm build:zustand-reducers
pnpm build:redux
pnpm build:custom
```

## Architecture

This app serves as a comprehensive testing environment for Zubridge's Electron integration:

- **Multi-Mode Support**: Single app demonstrating all patterns
- **E2E Testing**: Full end-to-end testing capabilities
- **Performance Testing**: Large state generation and stress testing
- **Error Testing**: Intentional error scenarios for testing error handling
- **Cross-Mode Comparison**: Easy comparison between different patterns

## Testing

The app is designed for comprehensive E2E testing of Zubridge functionality:

- **State Synchronization**: Testing state sync across multiple windows
- **Action Dispatching**: Testing all action types across all modes
- **Error Handling**: Testing error scenarios and recovery
- **Performance**: Testing with large state objects
- **Cross-Process Communication**: Testing IPC and bridge functionality
