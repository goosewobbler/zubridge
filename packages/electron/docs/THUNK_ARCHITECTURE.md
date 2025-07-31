# Thunk Manager Architecture

## Overview

The Thunk Manager system is responsible for coordinating the execution of thunks across multiple renderer processes in Electron. It provides a robust way to handle concurrent thunk execution, maintain thunk hierarchy, and ensure proper sequencing of actions in the action queue.

## Key Components

### ThunkManager

The core class that manages all thunks in the system. It provides:

- Thunk registration and lifecycle management
- Thunk state transitions (pending → executing → completed/failed)
- Thunk hierarchy tracking (parent-child relationships)
- Locking mechanism to ensure only one root thunk executes at a time
- Event emission for thunk state changes

### Thunk

Represents a single thunk in the system. It stores:

- Unique ID and optional parent ID
- Current state (pending, executing, completed, failed)
- Source window ID
- Child thunk IDs
- Timestamps for performance tracking

### ActionQueueManager

Coordinates with ThunkManager to determine which actions can be processed:

- Manages a queue of actions from all renderer processes
- Consults ThunkManager to determine if an action can be processed
- Ensures actions from the same thunk tree are processed sequentially
- Prevents actions from different thunk trees from executing concurrently

### MainThunkProcessor

Handles thunk execution in the main process:

- Executes thunks that are dispatched from the main process
- Manages thunk execution state
- Coordinates with ThunkManager for registration and state updates

## Lifecycle of a Thunk

1. **Registration**: A thunk is registered in the system, either with an auto-generated ID or a specific ID.
2. **Activation**: The thunk is marked as executing when it starts to run.
3. **Execution**: During execution, a thunk may spawn child thunks or dispatch actions.
4. **Completion**: The thunk is marked as completed or failed when it finishes execution.
5. **Cleanup**: When a root thunk and all its descendants complete, the lock is released to allow other thunks to execute.

## Concurrency Control

The ThunkManager implements a locking mechanism to prevent concurrent thunk execution:

- Only one root thunk can execute at a time
- A root thunk acquires a lock when it starts executing
- The lock is released when the root thunk and all its descendants complete
- This ensures that all actions from a thunk tree are processed sequentially and atomically

## Event System

ThunkManager extends EventEmitter to provide notifications about thunk state changes:

- `THUNK_REGISTERED`: Emitted when a new thunk is registered
- `THUNK_STARTED`: Emitted when a thunk starts executing
- `THUNK_COMPLETED`: Emitted when a thunk completes successfully
- `THUNK_FAILED`: Emitted when a thunk fails with an error
- `ROOT_THUNK_CHANGED`: Emitted when a new root thunk acquires the lock
- `ROOT_THUNK_COMPLETED`: Emitted when a root thunk and all its descendants complete

## State Versioning

ThunkManager maintains a state version counter that increments on every state change. This version is included in state summaries sent to renderers, allowing them to determine if their view of the thunk state is current.

## Integration with Action Queue

The ActionQueueManager consults ThunkManager to determine if an action can be processed:

- If no thunk is active, any action can proceed
- If a thunk is active, only actions from that thunk tree can proceed
- When a thunk completes, the action queue is processed to find the next processable action

## Future Enhancements

- **Rust Implementation**: The ThunkManager architecture is designed to be implemented in Rust as part of a Rust-based middleware.
- **Priority Queues**: Add support for prioritizing actions from different thunk trees.
- **Timeout Handling**: Implement more robust timeout handling for long-running thunks.
- **Advanced Metrics**: Add more detailed metrics for thunk execution performance.
