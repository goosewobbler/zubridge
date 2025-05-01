# AppBase Component

The AppBase component provides a way to build cross-platform Zubridge applications with a unified codebase. It eliminates duplication between Electron and Tauri implementations by extracting the common functionality into reusable components.

## Components

- **ZubridgeApp**: The base component that handles the common functionality
- **ElectronApp**: A higher-order component for Electron apps
- **TauriApp**: A higher-order component for Tauri apps (both v1 and v2+)

## Usage

### In an Electron app

```tsx
import { useDispatch, useStore } from '@zubridge/electron';
import { ElectronApp } from '@zubridge/ui';

function App() {
  const dispatch = useDispatch();
  const store = useStore();

  return (
    <ElectronApp
      windowId={windowId}
      windowType="main"
      modeName="basic"
      dispatch={dispatch}
      store={store}
      showLogger={true}
    />
  );
}
```

### In a Tauri app

```tsx
import { useZubridgeDispatch, useZubridgeStore } from '@zubridge/tauri';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { invoke } from '@tauri-apps/api/core';
import { TauriApp } from '@zubridge/ui';

function App() {
  const dispatch = useZubridgeDispatch();
  const store = useZubridgeStore();

  return (
    <TauriApp
      windowLabel="main"
      dispatch={dispatch}
      store={store}
      WebviewWindow={WebviewWindow}
      invoke={invoke}
      showLogger={true}
    />
  );
}
```

## Features

1. **Unified State Management**: The same component is used for both Electron and Tauri, with platform-specific adapters
2. **Consistent UI**: The same UI components are used across platforms
3. **Built-in Logging**: Includes a logger component to track actions and state changes
4. **Theme Support**: Automatically manages light/dark theme

## Implementation

The AppBase component is organized as follows:

- **ZubridgeApp.tsx**: The core component that renders the UI and handles common logic
- **WindowInfo.ts**: Types and utilities for window information
- **selectors.ts**: Selector functions for extracting data from state
- **adapters/**: Platform-specific adapters for window management
  - **electron.ts**: Adapter for Electron
  - **tauri.ts**: Adapter for Tauri
- **hoc/**: Higher-order components for each platform
  - **withElectron.tsx**: HOC for Electron
  - **withTauri.tsx**: HOC for Tauri

## Migration

To migrate existing applications to use this component:

1. Remove `App.main.tsx` and `App.runtime.tsx` files
2. Update `main.tsx` to use the appropriate platform-specific component
3. Pass the required platform-specific APIs to the component

## Future Improvements

- Add more platform-specific adapters (e.g., for web)
- Implement more features in the logger component
- Add more examples of integration with different state management solutions
