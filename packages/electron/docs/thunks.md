# Thunks in Zubridge

Zubridge provides comprehensive support for thunks, which are functions that can be dispatched like regular actions but allow for complex asynchronous logic and action sequences. This document is your complete guide to using thunks effectively in your Zubridge-powered Electron application.

## What are Thunks?

Thunks are special action creators that return a function instead of a plain action object. The thunk function receives the `getState` and `dispatch` functions as arguments, allowing for:

- Execution of asynchronous logic
- Conditional dispatching of actions
- Access to the current state
- Dispatching multiple actions in sequence
- Cross-process state coordination
- Promise-based action patterns

Zubridge's thunk implementation is similar to Redux Thunk middleware but works in an Electron environment with specialized support for main and renderer processes, action sequencing, and cross-window coordination.

## Using Thunks

### Main Process Thunks

Thunks can be defined and dispatched in the main process using the `dispatch` function returned by `createZustandBridge` or `createReduxBridge`.

```typescript
import { createZustandBridge } from '@zubridge/electron/main';
import { store } from './store';

// Create a bridge
const bridge = createZustandBridge(store);
const { dispatch } = bridge;

// Define a thunk
const fetchDataThunk = async (getState, dispatch) => {
  // Get current state
  const currentState = getState();
  console.log('Current counter:', currentState.counter);

  // Dispatch action to indicate loading
  dispatch('SET_LOADING', true);

  try {
    // Perform async operation
    const response = await fetch('https://api.example.com/data');
    const data = await response.json();

    // Dispatch action with the result
    dispatch('SET_DATA', data);
    return data; // Thunks can return values
  } catch (error) {
    dispatch('SET_ERROR', error.message);
    throw error; // Errors can be propagated
  } finally {
    dispatch('SET_LOADING', false);
  }
};

// Dispatch the thunk
dispatch(fetchDataThunk)
  .then((data) => console.log('Data fetched:', data))
  .catch((error) => console.error('Error in thunk:', error));
```

### Renderer Process Thunks

Thunks can also be dispatched from the renderer process using the `useDispatch` hook:

```typescript
import { useDispatch } from '@zubridge/electron';
import { useState } from 'react';

function DataComponent() {
  const dispatch = useDispatch();
  const [isLoading, setIsLoading] = useState(false);

  const handleFetchData = async () => {
    setIsLoading(true);

    try {
      // Define and dispatch a thunk inline
      const data = await dispatch(async (getState, dispatch) => {
        // Check current state before proceeding
        const state = getState();
        if (state.lastFetchTime && Date.now() - state.lastFetchTime < 60000) {
          console.log('Using cached data');
          return state.data;
        }

        // Fetch new data
        const response = await fetch('/api/data');
        const data = await response.json();

        // Update state
        dispatch('UPDATE_DATA', data);
        dispatch('SET_FETCH_TIME', Date.now());

        return data;
      });

      console.log('Fetched data:', data);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div>
      <button onClick={handleFetchData} disabled={isLoading}>
        {isLoading ? 'Loading...' : 'Fetch Data'}
      </button>
    </div>
  );
}
```

## Advanced Thunk Patterns

### Thunk Composition

Thunks can call other thunks by using the `dispatch` function:

```typescript
// A simple thunk
const incrementCounter = (getState, dispatch) => {
  const currentValue = getState().counter;
  dispatch('SET_COUNTER', currentValue + 1);
  return currentValue + 1;
};

// A complex thunk that uses another thunk
const complexOperation = async (getState, dispatch) => {
  // First perform some action
  dispatch('OPERATION_STARTED');

  // Call another thunk
  const newValue = await dispatch(incrementCounter);

  // Double the value
  dispatch('SET_COUNTER', newValue * 2);

  return newValue * 2;
};

// Dispatch the complex thunk
dispatch(complexOperation);
```

### Conditional Thunks

Thunks can execute logic conditionally based on the current state:

```typescript
const conditionalIncrement = (getState, dispatch) => {
  const state = getState();

  if (state.counter < 10) {
    dispatch('INCREMENT');
    return 'incremented';
  } else {
    dispatch('RESET');
    return 'reset';
  }
};
```

### Multi-Step Thunks with Timeouts

Thunks can perform operations with delays and multiple steps:

```typescript
const multiStepOperation = async (getState, dispatch) => {
  // Step 1
  dispatch('SET_STEP', 1);
  dispatch('SET_VALUE', 2);

  // Wait for 1 second
  await new Promise((resolve) => setTimeout(resolve, 1000));

  // Step 2
  dispatch('SET_STEP', 2);
  dispatch('SET_VALUE', 4);

  // Wait for 1 second
  await new Promise((resolve) => setTimeout(resolve, 1000));

  // Step 3
  dispatch('SET_STEP', 3);
  dispatch('SET_VALUE', 8);

  // Cleanup
  await new Promise((resolve) => setTimeout(resolve, 1000));
  dispatch('SET_STEP', 0);
  dispatch('SET_VALUE', 4);

  return 'completed';
};
```

## Cross-Window Thunk Behavior

Zubridge implements a specialized thunk processing mechanism to ensure proper execution order when actions are dispatched from different windows or processes.

### Action and Thunk Queueing

When a thunk is being processed, both regular actions and other thunks dispatched to the same state store are queued until the current thunk completes. This ensures that:

1. Thunks run to completion without interference
2. State remains consistent during complex operations
3. Actions and thunks from different windows are properly sequenced
4. Only one thunk executes at a time per store

This queueing behavior prevents race conditions and ensures that state updates occur in the intended order. Note that while the queueing and management of thunks happens in the main process, the actual processing of thunks occurs in the process where the thunk was dispatched - thunks do not cross the IPC boundary.

### Example of Cross-Window Thunk and Action Processing

Consider a scenario with two windows, where Window A dispatches a thunk and Window B attempts to dispatch a regular action and another thunk:

```typescript
// In Window A:
dispatch(async (getState, dispatch) => {
  console.log('Thunk started');
  dispatch('SET_VALUE', 2); // First change

  // Artificial delay to simulate a long-running operation
  await new Promise((resolve) => setTimeout(resolve, 1000));

  dispatch('SET_VALUE', 4); // Second change

  await new Promise((resolve) => setTimeout(resolve, 1000));

  dispatch('SET_VALUE', 8); // Third change

  await new Promise((resolve) => setTimeout(resolve, 1000));

  dispatch('SET_VALUE', 4); // Final change
  console.log('Thunk completed');
});

// In Window B (during thunk execution):
dispatch('SET_VALUE', 10); // This action will be queued

// Also in Window B (during thunk execution):
dispatch(async (getState, dispatch) => {
  dispatch('SET_VALUE', 20);
}); // This thunk will also be queued
```

In this scenario:

1. Window A's thunk starts executing
2. The state changes to 2, then 4, then 8 as the thunk progresses
3. Window B's action to set the value to 10 is queued
4. Window B's thunk to set the value to 20 is also queued
5. Window A's thunk completes, setting the value to 4
6. Window B's queued action is processed first, setting the value to 10
7. Finally, Window B's queued thunk is processed, setting the value to 20

### Implementation Details

The queueing mechanism works by:

1. Tracking active thunks in the bridge (main process)
2. Queueing both actions and thunks that arrive during thunk execution
3. Processing queued items in order after the current thunk completes
4. Maintaining the correct ordering of actions and thunks across windows
5. Executing each thunk in its originating process (no IPC boundary crossing)

This ensures predictable state updates and prevents race conditions in multi-window applications.

### Bypassing Thunk Queueing

Use the `bypassThunkLock` flag to override the default queueing behavior:

```typescript
// Bypass thunk locking - allows actions to skip the queue
// and be processed immediately, even during thunk execution
bridge.dispatch('URGENT_ACTION', payload, {
  bypassThunkLock: true
});

// This also works for thunks - they will execute immediately
// instead of being queued
bridge.dispatch(async (getState, dispatch) => {
  dispatch('IMMEDIATE_UPDATE', 'urgent');
}, {
  bypassThunkLock: true
});
```

## Error Handling in Thunks

Zubridge's thunk implementation has specific error handling behaviors that are important to understand:

### Error Handling Responsibility

1. **Actions**: Errors that occur during bridge communication (when actions cross process boundaries) are caught by the bridge infrastructure, logged, and propagated back to the renderer process. This means that errors thrown in the main process as a result of an action dispatched from the renderer will be captured and sent back to the renderer, allowing them to be caught with try/catch blocks.

2. **Thunks**: Thunks are executed entirely within the process where they were dispatched (no IPC communication), the responsibility for catching and handling errors inside thunks falls to the application code that dispatched the thunk.

```typescript
// Example of handling errors in cross-process actions
try {
  // This action will be processed in the main process
  await dispatch('SOME_ACTION_THAT_MIGHT_ERROR');
} catch (error) {
  // Error from main process will be caught here
  console.error('Main process error:', error);
}

// Example of handling errors in local thunks
try {
  await dispatch(async () => {
    // This thunk runs locally in the renderer
    throw new Error('Local thunk error');
  });
} catch (error) {
  // Local thunk errors must be caught by the application
  console.error('Thunk error:', error);
}
```

## Best Practices for Thunks

1. **Keep thunks focused**: Each thunk should perform a specific, well-defined task.

2. **Handle errors**: Always include error handling in thunks, especially for asynchronous operations.

3. **Consider return values**: Thunks can return values, which can be useful for chainable operations.

4. **Be mindful of thunk duration**: Very long-running thunks will delay other actions. Break complex operations into manageable pieces.

5. **Use composition**: Break complex logic into smaller thunks that can be composed together.

## Example: Complete Thunk Pattern for Data Fetching

Here's a complete example showing a recommended pattern for data fetching with loading states, error handling, and caching:

```typescript
// Define action types for better type safety
const ActionTypes = {
  FETCH_STARTED: 'FETCH_STARTED',
  FETCH_SUCCESS: 'FETCH_SUCCESS',
  FETCH_ERROR: 'FETCH_ERROR',
  UPDATE_CACHE_TIME: 'UPDATE_CACHE_TIME',
};

// Thunk for fetching data with caching
const fetchData =
  (forceRefresh = false) =>
  async (getState, dispatch) => {
    const state = getState();
    const cacheTime = state.lastFetchTime || 0;
    const cacheExpired = Date.now() - cacheTime > 5 * 60 * 1000; // 5 minutes

    // Check if we can use cached data
    if (!forceRefresh && !cacheExpired && state.data) {
      console.log('Using cached data');
      return state.data;
    }

    // Start fetching
    dispatch({ type: ActionTypes.FETCH_STARTED });

    try {
      const response = await fetch('https://api.example.com/data');

      // Check if response is ok
      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }

      const data = await response.json();

      // Update the state with the fetched data
      dispatch({ type: ActionTypes.FETCH_SUCCESS, payload: data });
      dispatch({ type: ActionTypes.UPDATE_CACHE_TIME, payload: Date.now() });

      return data;
    } catch (error) {
      // Handle and log the error
      console.error('Error fetching data:', error);
      dispatch({ type: ActionTypes.FETCH_ERROR, payload: error.message });

      // Re-throw the error for the caller to handle
      throw error;
    }
  };
```


## Thunk Completion Acknowledgement

Thunks are marked as complete only after all renderer processes have acknowledged the final state update. This ensures complete state synchronization before the thunk is considered finished:

```typescript
const myThunk = async (getState, dispatch) => {
  dispatch('FIRST_UPDATE', 1);
  dispatch('SECOND_UPDATE', 2);
  dispatch('FINAL_UPDATE', 3);
  // Thunk is marked complete only after all renderers acknowledge FINAL_UPDATE
};

const result = await bridge.dispatch(myThunk);
console.log('All windows have received the final state update');
```

## Related Documentation

For more information on integrating thunks with your application:

- [Advanced Usage](./advanced-usage.md) - Application architecture, middleware, testing, and TypeScript patterns
- [Getting Started](./getting-started.md) - Basic setup and usage patterns
- [API Reference](./api-reference.md) - Complete reference including DispatchOptions for bypass flags
- [Main Process](./main-process.md) - Detailed guide for using Zubridge in the main process
- [Renderer Process](./renderer-process.md) - Detailed guide for using Zubridge in the renderer process
