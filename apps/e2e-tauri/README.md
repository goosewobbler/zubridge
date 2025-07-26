# E2E Tauri

End-to-end testing app for Zubridge Tauri.

## Overview

This app demonstrates how to use Zubridge with Tauri, providing a comprehensive testing environment for Tauri integration with Zubridge's state management capabilities.

## Features

- **Tauri Integration**: Full Tauri v2 integration with Zubridge
- **State Management**: Zustand-based state management
- **Cross-Platform**: Works on Windows, macOS, and Linux
- **System Tray**: Native system tray integration
- **Theme Management**: Dark/light theme switching
- **Counter Operations**: Increment/decrement with state synchronization
- **Error Handling**: Error testing scenarios
- **Performance Testing**: Large state generation capabilities

## Architecture

This app demonstrates Zubridge's Tauri integration:

- **Frontend**: React with Zustand for state management
- **Backend**: Rust with Tauri commands
- **Bridge**: Zubridge Tauri bridge for state synchronization
- **IPC**: Tauri's IPC system for communication

## Development

```bash
# Install dependencies
pnpm install

# Start development
pnpm dev

# Build for production
pnpm build

# Preview build
pnpm preview
```

## Tauri Integration

The app uses Zubridge's Tauri package for seamless integration:

- **Frontend Bridge**: `@zubridge/tauri` for React integration
- **Backend Commands**: Rust commands for state management
- **State Synchronization**: Automatic state sync between frontend and backend
- **Type Safety**: Full TypeScript support across the stack

## Testing

This app serves as a comprehensive testing environment for Zubridge's Tauri functionality:

- **State Synchronization**: Testing state sync between frontend and backend
- **Action Dispatching**: Testing all action types
- **Error Handling**: Testing error scenarios and recovery
- **Performance**: Testing with large state objects
- **Cross-Platform**: Testing on different operating systems
