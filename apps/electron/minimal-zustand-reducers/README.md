# Minimal Zustand Reducers

A minimal Electron app demonstrating Zubridge with Zustand reducers mode.

## Features

- **Reducers Mode**: Uses Redux-style reducers for state management
- **Two Windows**: Side-by-side windows for testing synchronization
- **System Tray**: Shows counter and theme status with actions
- **Theme Toggle**: Switch between light and dark themes
- **Counter**: Increment/decrement with state synchronization

## Architecture

This app demonstrates the **reducers mode** of Zubridge, which uses Redux-style reducer functions:

- **Root Reducer**: Combines feature-specific reducers
- **Feature Reducers**: Pure functions for counter, theme, and state management
- **Zustand Store**: Simple state container with reducer integration
- **Bridge**: Connects main process and renderer with reducer-based actions

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

The app uses a root reducer that combines individual feature reducers:

- `counterReducer`: Handles counter increment/decrement
- `themeReducer`: Handles theme toggle
- `stateReducer`: Handles state-wide actions like reset

Each reducer is a pure function that receives the current state and an action, returning a new state.
