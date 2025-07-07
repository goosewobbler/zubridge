# Minimal Zustand Handlers

A minimal Electron app demonstrating Zubridge with Zustand handlers mode.

## Features

- **Handlers Mode**: Uses separate action handlers for state management
- **Two Windows**: Side-by-side windows for testing synchronization
- **System Tray**: Shows counter and theme status with actions
- **Theme Toggle**: Switch between light and dark themes
- **Counter**: Increment/decrement with state synchronization

## Architecture

This app demonstrates the **handlers mode** of Zubridge, which uses separate action handler functions:

- **Action Handlers**: Dedicated functions for each action type
- **Feature Handlers**: Organized by feature (counter, theme, state, error)
- **Zustand Store**: Simple state container with handler integration
- **Bridge**: Connects main process and renderer with handler-based actions

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

The app uses separate action handlers for each operation:

- `incrementCounter`: Handles counter increment
- `decrementCounter`: Handles counter decrement
- `setCounter`: Handles setting counter value
- `toggleTheme`: Handles theme toggle
- `setTheme`: Handles setting specific theme
- `resetState`: Handles state reset

Each handler is a function that receives the store and returns an action function.
