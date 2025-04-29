# Zubridge API Reference

This document provides a comprehensive reference of both the Tauri plugin API and the frontend JavaScript API.

## Tauri Plugin API (`tauri-plugin-zubridge`)

### Core Types

#### `StateManager` Trait

```rust
pub trait StateManager: Send + Sync + 'static {
    fn get_state(&self) -> serde_json::Value;
    fn process_action(&self, action: &ZubridgeAction) -> Result<(), String>;
}
```

The central trait that your state manager must implement:

- `get_state()`: Returns the current state as a JSON value that will be sent to the frontend
- `process_action()`: Processes an action from the frontend and updates the state accordingly

#### `ZubridgeAction` Struct

```rust
#[derive(Debug, serde::Deserialize, Clone)]
pub struct ZubridgeAction {
    #[serde(rename = "type")]
    pub action_type: String,
    pub payload: Option<serde_json::Value>,
}
```

Represents an action dispatched from the frontend:

- `action_type`: String identifying the action (e.g., "INCREMENT")
- `payload`: Optional JSON data associated with the action

#### `ZubridgePlugin` Struct

```rust
pub struct ZubridgePlugin<M: StateManager> {
    state_manager: M,
}
```

The main plugin struct that wraps your state manager.

### Functions

#### `ZubridgePlugin::new()`

```rust
pub fn new<M: StateManager>(state_manager: M) -> TauriPlugin<R>
```

Creates a new Zubridge plugin instance:

- **Parameters**:
  - `state_manager`: An instance implementing the `StateManager` trait
- **Returns**: A Tauri plugin that can be registered with your application

### Usage Example

```rust
use tauri_plugin_zubridge::{StateManager, ZubridgePlugin, ZubridgeAction};
use std::sync::Mutex;
use serde::{Serialize, Deserialize};

// Define your state
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct AppState {
    counter: i32,
}

impl Default for AppState {
    fn default() -> Self {
        Self { counter: 0 }
    }
}

// Implement the StateManager trait
struct AppStateManager {
    state: Mutex<AppState>,
}

impl StateManager for AppStateManager {
    fn get_state(&self) -> serde_json::Value {
        let state = self.state.lock().unwrap();
        serde_json::to_value(&*state).unwrap()
    }

    fn process_action(&self, action: &ZubridgeAction) -> Result<(), String> {
        let mut state = self.state.lock().unwrap();

        match action.action_type.as_str() {
            "INCREMENT" => {
                state.counter += 1;
                Ok(())
            },
            "DECREMENT" => {
                state.counter -= 1;
                Ok(())
            },
            _ => Err(format!("Unknown action: {}", action.action_type)),
        }
    }
}

// Create and register the plugin
pub fn zubridge<R: Runtime>() -> TauriPlugin<R> {
    let state_manager = AppStateManager {
        state: Mutex::new(AppState::default()),
    };

    ZubridgePlugin::new(state_manager)
}
```

## Frontend API (`@zubridge/tauri`)

### Core Functions

#### `initializeBridge()`

```typescript
function initializeBridge(options: {
  invoke: (cmd: string, args?: any) => Promise<any>;
  listen: (event: string, callback: (event: any) => void) => Promise<() => void>;
}): void;
```

Initializes the Zubridge bridge with the necessary Tauri functions:

- **Parameters**:
  - `options.invoke`: Function to invoke Tauri commands
  - `options.listen`: Function to listen for Tauri events
- **Returns**: void

**Example**:

```typescript
import { initializeBridge } from '@zubridge/tauri';
import { invoke } from '@tauri-apps/api/core'; // For Tauri v2
import { listen } from '@tauri-apps/api/event';

initializeBridge({ invoke, listen });
```

### Hooks

#### `useZubridgeStore()`

```typescript
function useZubridgeStore<T = any>(selector?: (state: any) => T): T;
```

A hook to access the synchronized state:

- **Parameters**:
  - `selector`: Optional function to select a slice of the state
- **Returns**: The selected state or the entire state if no selector is provided

**Example**:

```tsx
import { useZubridgeStore } from '@zubridge/tauri';

function Counter() {
  const counter = useZubridgeStore((state) => state.counter);
  // Access internal bridge status
  const status = useZubridgeStore((state) => state.__bridge_status);

  return <div>Counter: {counter}</div>;
}
```

#### `useZubridgeDispatch()`

```typescript
function useZubridgeDispatch(): (action: { type: string; payload?: any }) => Promise<void>;
```

A hook to get the dispatch function for sending actions to the backend:

- **Returns**: A function that dispatches actions to the backend

**Example**:

```tsx
import { useZubridgeDispatch } from '@zubridge/tauri';

function Counter() {
  const dispatch = useZubridgeDispatch();

  return <button onClick={() => dispatch({ type: 'INCREMENT' })}>Increment</button>;
}
```

### Store Methods

The Zubridge store also exposes these methods for non-hook usage:

#### `getState()`

```typescript
function getState(): any;
```

Returns the current state:

- **Returns**: The entire current state object

**Example**:

```typescript
import { useZubridgeStore } from '@zubridge/tauri';

const currentState = useZubridgeStore.getState();
console.log(currentState.counter);
```

#### `subscribe()`

```typescript
function subscribe(listener: (state: any, prevState: any) => void): () => void;
```

Subscribes to state changes:

- **Parameters**:
  - `listener`: Function called whenever the state changes
- **Returns**: Unsubscribe function

**Example**:

```typescript
import { useZubridgeStore } from '@zubridge/tauri';

const unsubscribe = useZubridgeStore.subscribe((state, prevState) => console.log('State changed:', state, prevState));

// Later, to unsubscribe:
unsubscribe();
```

### Internal State Properties

The store contains special internal properties prefixed with `__bridge_`:

- `__bridge_status`: String indicating the bridge status ('initializing', 'ready', or 'error')
- `__bridge_error`: Any error that occurred during bridge operations

**Example**:

```typescript
import { useZubridgeStore } from '@zubridge/tauri';

function App() {
  const status = useZubridgeStore(state => state.__bridge_status);
  const error = useZubridgeStore(state => state.__bridge_error);

  if (status === 'initializing') {
    return <div>Loading...</div>;
  }

  if (status === 'error') {
    return <div>Error: {String(error)}</div>;
  }

  return <div>App loaded!</div>;
}
```

## Action Pattern

Actions follow a standard pattern inspired by Redux:

```typescript
interface ZubridgeAction {
  type: string;
  payload?: any;
}
```

- `type`: String identifier for the action (e.g., 'INCREMENT', 'ADD_TODO')
- `payload`: Optional data associated with the action

**Examples**:

```typescript
// Simple action without payload
dispatch({ type: 'INCREMENT' });

// Action with payload
dispatch({
  type: 'ADD_TODO',
  payload: { text: 'Buy milk', completed: false },
});

// Action with primitive payload
dispatch({
  type: 'SET_COUNTER',
  payload: 5,
});
```

## Error Handling

Errors from the backend are captured and stored in the `__bridge_error` property:

```typescript
function ErrorBoundary() {
  const error = useZubridgeStore(state => state.__bridge_error);

  if (error) {
    return <div className="error">Error: {String(error)}</div>;
  }

  return null;
}
```

## Vanilla JavaScript Usage

While the library uses hook naming conventions, it can be used with any JavaScript framework or vanilla JS:

```javascript
import { useZubridgeStore, useZubridgeDispatch } from '@zubridge/tauri';

// Access state directly
const counter = useZubridgeStore.getState().counter;

// Subscribe to changes
const unsubscribe = useZubridgeStore.subscribe((state) => {
  console.log('Counter:', state.counter);
  document.getElementById('counter').textContent = state.counter;
});

// Dispatch actions
const dispatch = useZubridgeDispatch();
document.getElementById('increment').addEventListener('click', () => {
  dispatch({ type: 'INCREMENT' });
});

// Clean up
window.addEventListener('beforeunload', () => {
  unsubscribe();
});
```
