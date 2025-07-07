# Minimal Zustand Basic

A minimal Electron app demonstrating Zubridge with Zustand basic mode.

## Features

- **Basic Mode**: Uses Zustand with action handlers attached to store state
- **Two Windows**: Side-by-side windows for testing synchronization
- **System Tray**: Shows counter and theme status with actions
- **Theme Toggle**: Switch between light and dark themes
- **Counter**: Increment/decrement with state synchronization

## Architecture

This app demonstrates the **basic mode** of Zubridge, which is the simplest Zustand pattern:

- **Action Handlers**: Functions attached directly to the store state
- **Zustand Store**: Simple state container with integrated handlers
- **Bridge**: Connects main process and renderer with direct handler calls

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

The app uses Zustand's basic pattern where action handlers are attached to the store state:

- `COUNTER:INCREMENT`: Increments the counter
- `COUNTER:DECREMENT`: Decrements the counter
- `THEME:TOGGLE`: Toggles between light and dark themes

This is the most straightforward approach for simple applications.

## Mode Details

In the **Basic** mode:

- Action handlers are attached as properties on the store state object
- Handlers are called directly through the bridge
- This is the simplest Zustand pattern supported by Zubridge

## State Structure

```typescript
interface State {
  'counter': number;
  'theme': 'light' | 'dark';

  // Action handlers (Basic mode specific)
  'COUNTER:INCREMENT': () => void;
  'COUNTER:DECREMENT': () => void;
  'COUNTER:DOUBLE': () => void;
  'THEME:TOGGLE': () => void;
}
```
