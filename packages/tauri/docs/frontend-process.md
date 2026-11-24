# Frontend Process Guide

This guide explains how to use the `@zubridge/tauri` library in your frontend application to interact with your Tauri Rust backend state.

## Initialization (Required)

Before using any Zubridge hooks, you **must** initialize the bridge once at the root of your application. This involves providing the `invoke` and `listen` functions from your chosen Tauri API version.

```typescript
// Example: src/main.tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { initializeBridge } from '@zubridge/tauri';

// --- Choose your Tauri API version ---
// For v2:
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
// For v1:
// import { invoke } from '@tauri-apps/api/tauri';
// import { listen } from '@tauri-apps/api/event';

// Initialize Zubridge *once* before rendering
initializeBridge({
  invoke,
  listen,
  // Optional: Customize command/event names if needed
  // getInitialStateCommand: 'custom_get_state',
  // dispatchActionCommand: 'custom_dispatch',
  // stateUpdateEvent: 'custom_state_event'
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

This setup allows Zubridge to communicate with your backend regardless of the Tauri API version you use.

## Framework Compatibility

Although the hooks (`useZubridgeStore` and `useZubridgeDispatch`) follow React naming conventions, they are built on a framework-agnostic core. This means they can be used in:

- React applications (as shown in most examples)
- Vue.js, Svelte, Angular, or other frontend frameworks
- Vanilla JavaScript applications

The hooks are essentially wrappers around a Zustand store, which itself supports non-React usage patterns. As long as you properly initialize the bridge, you can use these hooks in any JavaScript environment.

## Accessing State with `useZubridgeStore`

Once initialized, the primary way to access the synchronized state is the `useZubridgeStore` hook. It connects to an internal Zustand store that is kept up-to-date using the provided `listen` function to handle `__zubridge_state_update` events (or your custom event name) emitted by your Rust backend.

```typescript
import React from 'react';
import { useZubridgeStore } from '@zubridge/tauri';

// Assuming CounterState is your Rust state structure type
// defined in a shared types file or similar.
import type { CounterState } from '../types';

function CounterDisplay() {
  // Use a selector to get specific parts of the state.
  // Provide the expected type for the state slice.
  const counter = useZubridgeStore((state) => (state as CounterState).counter);

  // You can also get the bridge status (initializing, ready, error)
  const status = useZubridgeStore((state) => state.__zubridge_status);

  if (status !== 'ready') {
    return <div>Loading state ({status})...</div>;
  }

  // Handle cases where state might not be fully loaded yet
  return <div>Counter Value: {counter ?? 'N/A'}</div>;
}
```

**Key Points:**

- The hook automatically handles initialization (using the provided `invoke` function to call `__zubridge_get_initial_state` on first use) and listens for backend events via the provided `listen` function.
- **Use Selectors:** For performance, always use selector functions (`state => state.someValue`) to extract only the parts of the state your component needs. This prevents unnecessary re-renders.
- **Type Safety:** Provide the expected type of your application's state when using selectors (e.g., `(state as CounterState).counter`) to get type checking and autocompletion, as the hook itself works with a generic `AnyState` internally.

## Dispatching Actions with `useZubridgeDispatch`

To trigger state changes in the Rust backend, use the `useZubridgeDispatch` hook to get a dispatch function. This function uses the provided `invoke` function internally.

```typescript
import React from 'react';
import { useZubridgeStore, useZubridgeDispatch } from '@zubridge/tauri';
import type { CounterState } from '../types';

function CounterControls() {
  // Get the dispatch function
  const dispatch = useZubridgeDispatch();
  const counter = useZubridgeStore((state) => (state as CounterState).counter);
  const status = useZubridgeStore((state) => state.__zubridge_status);

  if (status !== 'ready') {
      return <p>Initializing controls...</p>;
  }

  const handleIncrement = () => {
    // Dispatch an action object
    dispatch({ type: 'INCREMENT' });
  };

  const handleDecrement = () => {
    dispatch({ type: 'DECREMENT' });
  };

  const handleSet = (value: number) => {
    // Include payload when necessary
    dispatch({ type: 'SET_COUNTER', payload: value });
  };

  return (
    <div>
      <p>Current Count: {counter ?? 'N/A'}</p>
      <button onClick={handleDecrement}>Decrement (-)</button>
      <button onClick={handleIncrement}>Increment (+)</button>
      <button onClick={() => handleSet(0)}>Reset to 0</button>
    </div>
  );
}
```

**Key Points:**

- `useZubridgeDispatch` returns a single `dispatch` function.
- You **must** pass an action object with at least a `type` property:

  ```typescript
  type ZubridgeAction = {
    type: string;
    payload?: any; // Optional payload
  };
  ```
- The `dispatch` function sends this action object to your Rust backend by using the provided `invoke` function to call the `__zubridge_dispatch_action` command (or your custom command name).
- Your Rust command handler is responsible for interpreting the `type` and `payload` to update the state.

## State Synchronization

State synchronization is driven by the Rust backend and managed via the functions provided during initialization:

1.  **Initial Load:** `useZubridgeStore` uses the provided `invoke` function to call `__zubridge_get_initial_state` once.
2.  **Updates:** The library uses the provided `listen` function to subscribe to `__zubridge_state_update` events.
3.  **Backend Responsibility:** Your Rust code **must** emit the `__zubridge_state_update` event with the full, updated state payload **every time** the state changes.

This ensures all connected frontends receive the latest state consistently.

## Performance Considerations

- **Selectors are Key:** As mentioned, using specific selectors with `useZubridgeStore` is the most crucial performance optimization.
- **Backend Event Emission:** Ensure your Rust backend doesn't emit state updates excessively. Only emit when the state has actually changed.

## Multi-Window Interaction

State synchronization across multiple windows works automatically as long as:

1.  `initializeBridge` is called in each window's context.
2.  Your Rust backend emits `__zubridge_state_update` events using `app_handle.emit(...)` (which broadcasts to all windows).
3.  Components in each window use the `useZubridgeStore` hook.

Each window's initialized Zubridge instance will independently listen for the broadcasted events using the provided `listen` function and update its local state replica.

## Debugging

The library includes console logs (`Zubridge Tauri: ...`) for key events like initialization, state fetching, event listening, and action dispatching. Check your browser's developer console.

For component-level debugging, use `useEffect`:

```typescript
import React, { useEffect } from 'react';
import { useZubridgeStore } from '@zubridge/tauri';
import type { CounterState } from '../types';

function DebugCounter() {
  const counter = useZubridgeStore((state) => (state as CounterState).counter);
  const fullState = useZubridgeStore((state) => state);

  useEffect(() => {
    console.log('Counter changed:', counter);
    // Inspect the full synchronized state (includes internal status)
    console.log('Full Zubridge state:', fullState);
  }, [counter, fullState]); // Depend on the specific slice and/or full state

  return <div>Debug Counter: {counter ?? 'N/A'}</div>;
}
```
