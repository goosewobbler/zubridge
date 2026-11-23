# How Zubridge Works

This document explains the technical details of how Zubridge manages state synchronization between Electron's main and renderer processes.

## Core Architecture

Zubridge creates a bridge between Electron's main and renderer processes using IPC (Inter-Process Communication). The bridge automatically synchronizes state changes between the main process and all renderer processes, ensuring that all windows stay in sync with the authoritative state.

The main process serves as the central authority for state management, while each renderer process maintains a synchronized replica of this state. This architecture ensures data consistency across windows and provides a clear separation of concerns in your application.

## Action Dispatch Lifecycle

When you dispatch an action from the renderer process, Zubridge handles the communication with the main process and updates the store. Here's what happens behind the scenes:

1. **Action Dispatch**: The renderer process dispatches an action using the `dispatch` function from `useDispatch()`.

2. **IPC Communication**: Zubridge sends the action to the main process via Electron's IPC channel.

3. **Action Processing**: In the main process, Zubridge processes the action based on the state management approach:
   - **Zustand Store**: If using a Zustand store with handlers, Zubridge checks if the action type matches a handler function in your store. If found, it calls that handler with the payload.
   - **Redux Store**: For Redux, the action is dispatched to the Redux store's reducer, which processes it according to your reducer logic.
   - **Custom State Manager**: With a custom implementation, the action is passed to your `processAction` method, where you define how each action type is handled.

4. **State Update**: After processing the action, the store's state is updated.

5. **Synchronization**: Zubridge detects the state change and broadcasts the updated state to all connected renderer processes.

6. **UI Update**: The renderer processes receive the updated state, and components subscribed to the store are re-rendered with the new data.

This flow ensures that all state changes go through the main process, maintaining a single source of truth while keeping all windows synchronized.

## Action Type Resolution

Zubridge is flexible in how it resolves action handlers:

```ts
// String action type (matches handler function name)
dispatch('SET_COUNTER', 10); // Looks for a SET_COUNTER (or set_counter) function in your store/handlers / root reducer

// Object action with type and payload
dispatch({ type: 'SET_COUNTER', payload: 10 }); // Looks for a SET_COUNTER (or set_counter) handler

// Nested path resolution (for stores with nested structure)
dispatch('ui.counter.increment'); // Can resolve nested handler functions
```

For Zustand stores, the action type is matched to a function name in your store (or external handlers or root reducer, depending on how you instantiated the bridge). For example, the action type `'INCREMENT'` will call a method named `INCREMENT` in your store if it exists. The payload (if any) is passed as an argument to the handler function.

## Window Management

Zubridge automatically handles window lifecycle events like creation and destruction. When you create a new window, you can subscribe it to the store, and when the window is closed, it's automatically unsubscribed.

This makes it easy to manage multiple windows in your application without worrying about memory leaks or stale references.

## Serialization

State and actions are automatically serialized when passing between processes. This means that only JSON-serializable data can be included in your state and action payloads. Complex objects like functions, class instances, or circular references are not supported.
