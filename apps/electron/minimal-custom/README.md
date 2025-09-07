# Minimal Custom

A minimal Electron app demonstrating Zubridge with a custom state manager.

## Features

- **Custom State Manager**: Uses a custom EventEmitter-based state manager
- **Two Windows**: Side-by-side windows for testing synchronization
- **System Tray**: Shows counter and theme status with actions
- **Theme Toggle**: Switch between light and dark themes
- **Counter**: Increment/decrement with state synchronization

## Architecture

This app demonstrates how to use Zubridge with a **custom state manager**:

- **Custom Store**: EventEmitter-based state manager implementation
- **Action Handlers**: Functions that work with the custom store
- **Bridge**: Connects main process and renderer with custom state management

## Development

```bash
# Install dependencies
pnpm install

# Start development server
pnpm dev

# Build for production
pnpm build

# Create distributable
pnpm dist
```

## State Management

The app uses a custom state manager that implements the Zubridge StateManager interface:

- `getState()`: Returns current state
- `setState()`: Updates state and emits change events
- `subscribe()`: Listens for state changes
- `dispatch()`: Handles actions and updates state

This pattern is useful when you want to use a custom state management solution instead of Zustand or Redux.
