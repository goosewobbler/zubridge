# Zubridge Action Queue Architecture Refactoring

## Current Implementation

The current implementation mixes concerns between:

- `ActionQueueManager` - Handles action queueing and processing
- `ThunkTracker` - Tracks thunk state and relationships
- `bridge.ts` - Coordinates everything together

This has led to complex, intertwined logic that's difficult to maintain, particularly around concurrent thunk execution.

## Proposed New Architecture

We are refactoring the action queue and thunk handling system to have clearer separation of concerns:

### Components

1. **Thunk Class** (`Thunk.ts`)
   - Encapsulates individual thunk state and behavior
   - Handles its own lifecycle (activate, complete, fail)
   - Manages parent-child relationships

2. **ThunkManager** (`ThunkManager.ts`)
   - Manages collection of thunks and their relationships
   - Uses EventEmitter pattern for state changes
   - Controls thunk locking and processing sequencing
   - Provides clear API for action processing decisions

3. **ActionQueueManager** (`actionQueue.ts`)
   - Focuses on action queueing and sequencing
   - Delegates thunk-related decisions to ThunkManager
   - Maintains simpler, more focused logic

### Key Interactions

1. When an action arrives:
   - `ActionQueueManager.enqueueAction` adds it to the queue
   - If it's a thunk action, it ensures the thunk is registered with ThunkManager

2. When processing the queue:
   - `ActionQueueManager.findProcessableActionIndex` asks ThunkManager if action can be processed
   - ThunkManager determines if it belongs to the active thunk or if a new thunk can start

3. During action processing:
   - ThunkManager updates thunk state based on action type
   - When a thunk completes, ThunkManager releases lock if entire tree is done

## Transition Plan

This is a significant architectural change that would require:

1. **Implementing the core components** (done):
   - Create `Thunk.ts` class
   - Create `ThunkManager.ts` class
   - Modify `actionQueue.ts` to use ThunkManager

2. **Updating bridge.ts** (pending):
   - Replace ThunkTracker usage with ThunkManager
   - Update thunk state retrieval and management

3. **Updating mainThunkProcessor.ts** (pending):
   - Refactor to work with ThunkManager instead of ThunkTracker

4. **Tests updates** (pending):
   - Update mocks and tests to reflect new architecture

5. **ThunkTracker deprecation** (pending):
   - After a transition period, fully replace ThunkTracker with ThunkManager

## Long-term Vision

In the future, this architecture could be:

1. **Implemented as a Rust middleware**:
   - Single middleware handling both action queue and thunk management
   - Better performance and cross-platform compatibility

2. **Enhanced with additional features**:
   - Window synchronization with explicit acknowledgments
   - More robust error handling and recovery
   - Performance metrics and observability

## Benefits

This refactoring provides:

- **Clearer separation of concerns**
- **Better code organization**
- **More explicit state transitions**
- **Easier testing and debugging**
- **Enhanced maintainability**
