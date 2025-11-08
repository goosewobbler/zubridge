# Minimal Sandbox True

A minimal Electron app demonstrating Zubridge with sandbox enabled.

## Features

- **Sandbox Mode**: Runs with `sandbox: true` in webPreferences for enhanced security
- **Two Windows**: Side-by-side windows for testing synchronization
- **System Tray**: Shows counter and theme status with actions
- **Theme Toggle**: Switch between light and dark themes
- **Counter**: Increment/decrement with state synchronization

## Architecture

This app demonstrates Zubridge with Electron sandbox mode enabled:

- **Sandbox Enabled**: Windows run with `sandbox: true` for enhanced security
- **Zustand Store**: Simple state container with integrated handlers
- **Bridge**: Connects main process and renderer securely through IPC

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

The app uses Zustand with action handlers for state management:

- `COUNTER:INCREMENT`: Increments the counter
- `COUNTER:DECREMENT`: Decrements the counter
- `THEME:TOGGLE`: Toggles between light and dark themes

## Sandbox Mode

With `sandbox: true` enabled:

- Renderer processes run in a sandboxed environment for enhanced security
- Node.js APIs are not directly accessible in the renderer
- Communication happens securely through the preload script and IPC

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
