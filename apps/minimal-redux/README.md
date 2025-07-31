# Minimal Redux

A minimal Electron app demonstrating Zubridge with Redux.

## Features

- **Redux Integration**: Uses Redux for state management with Zubridge
- **Two Windows**: Side-by-side windows for testing synchronization
- **System Tray**: Shows counter and theme status with actions
- **Theme Toggle**: Switch between light and dark themes
- **Counter**: Increment/decrement with state synchronization

## Architecture

This app demonstrates how to use Zubridge with **Redux**:

- **Redux Store**: Standard Redux store with actions and reducers
- **Redux Bridge**: Uses `createReduxBridge` for Redux integration
- **Actions**: Standard Redux actions dispatched through the bridge
- **Reducers**: Pure functions that handle state updates

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

The app uses Redux with Zubridge's Redux bridge:

- **Actions**: Standard Redux actions like `{ type: 'COUNTER:INCREMENT' }`
- **Reducers**: Pure functions that handle state updates
- **Store**: Redux store with middleware support
- **Bridge**: `createReduxBridge` connects Redux to Electron IPC

This pattern is ideal for teams already using Redux in their applications.

## Redux Slices

### Counter Slice

- `increment`: Increments counter by 1
- `decrement`: Decrements counter by 1

### Theme Slice

- `toggleTheme`: Toggles between dark and light themes

## Action Mapping

Actions are mapped to Redux action creators:

- `COUNTER:INCREMENT` → `counterSlice.actions.increment`
- `COUNTER:DECREMENT` → `counterSlice.actions.decrement`
- `THEME:TOGGLE` → `themeSlice.actions.toggleTheme`

## Redux Integration

The app demonstrates:

- Redux Toolkit configuration for Electron
- Slice-based state organization
- Action creator integration with Zubridge
- Redux store subscription for tray updates
