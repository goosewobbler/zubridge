# Renderer Process

This document describes how to set up and use the `@zubridge/electron` package in the renderer process of your Electron application.

## Framework Compatibility

Although the hooks in `@zubridge/electron` follow React naming conventions (with `use` prefix), they are built on a framework-agnostic foundation. The core functionality can be used with:

- **React**: The primary use case with examples shown in this guide
- **Vue.js, Svelte, Angular**: Can integrate with other frontend frameworks
- **Vanilla JavaScript**: Can be used without any framework

The hooks are essentially wrappers around Zustand stores, which support non-React usage patterns. As long as you properly set up the preload script and expose the handlers to the renderer process, you can use these hooks in any JavaScript environment.

## Creating the Store Hook

First, create a reusable hook to access the store in your renderer process:

```ts
// `src/renderer/hooks/useStore.ts`
import { createUseStore } from '@zubridge/electron';
import type { State } from '../../features/index.js';

// Create a hook to access the store
export const useStore = createUseStore<State>();
```

## Accessing Store State

Once you have created your store hook, you can use it to access the state in your components:

```tsx
// `src/renderer/components/Counter.tsx`
import { useStore } from '../hooks/useStore.js';

export const Counter = () => {
  // Select specific state values with selectors
  const counter = useStore((state) => state.counter);

  // You can also select multiple values in one selector
  const { counter, isLoading } = useStore((state) => ({
    counter: state.counter,
    isLoading: state.ui.isLoading,
  }));

  // If you need to access the entire state (not recommended for performance)
  const state = useStore();

  return (
    <div>
      <p>Counter: {counter}</p>
    </div>
  );
};
```

## Dispatching Actions

Use the `useDispatch` hook to dispatch actions to the store:

```tsx
// `src/renderer/components/Counter.tsx`
import { useDispatch } from '@zubridge/electron';
import { useStore } from '../hooks/useStore.js';
import type { State } from '../../features/index.js';

export const Counter = () => {
  const counter = useStore((state) => state.counter);
  const dispatch = useDispatch<State>();

  return (
    <div>
      <button onClick={() => dispatch('COUNTER:DECREMENT')}>-</button>
      <span>{counter}</span>
      <button onClick={() => dispatch('COUNTER:INCREMENT')}>+</button>
    </div>
  );
};
```

### Dispatch Patterns

The `useDispatch` hook supports multiple dispatch patterns:

```tsx
import { useDispatch } from '@zubridge/electron';
import type { State } from '../../features/index.js';

export const ActionButtons = () => {
  const dispatch = useDispatch<State>();

  // String action type
  const handleIncrement = () => dispatch('COUNTER:INCREMENT');

  // String action type with payload
  const handleSetValue = () => dispatch('COUNTER:SET', 42);

  // Action object
  const handleResetCounter = () =>
    dispatch({
      type: 'COUNTER:RESET',
      payload: 0,
    });

  // Typed action object
  const typedDispatch = useDispatch<State, { 'COUNTER:SET': number }>();
  const handleTypedSetValue = () =>
    typedDispatch({
      type: 'COUNTER:SET',
      payload: 42,
    });

  // Thunk function for complex async logic
  const handleFetchAndUpdateCounter = () =>
    dispatch(async (getState, dispatch) => {
      // Access current state
      const state = getState();

      // Perform async operations
      const response = await fetch('/api/counter');
      const data = await response.json();

      // Dispatch another action with the result
      dispatch('COUNTER:SET', data.value);
    });

  return (
    <div>
      <button onClick={handleIncrement}>Increment</button>
      <button onClick={handleSetValue}>Set to 42</button>
      <button onClick={handleTypedSetValue}>Set to 42 (Typed)</button>
      <button onClick={handleResetCounter}>Reset</button>
      <button onClick={handleFetchAndUpdateCounter}>Fetch & Update</button>
    </div>
  );
};
```

> **Note on Thunks:** Thunk functions are executed locally in the renderer process. They receive a `getState` function to access the current state and a `dispatch` function to dispatch further actions. This allows for complex asynchronous workflows while maintaining the security boundary between processes. Only serializable actions are sent across the IPC channel.

### Creating a Standalone Dispatch Function

You can also create a standalone dispatch function for use outside of React components:

```ts
// `src/renderer/dispatch.ts`
import { useDispatch } from '@zubridge/electron';
import type { State } from '../features/index.js';

// Uses window.zubridge by default
export const dispatch = useDispatch<State>();

// Or explicitly provide handlers
export const customDispatch = useDispatch<State>(window.customHandlers);
```

Then use it anywhere in your application:

```ts
// `src/renderer/services/counter.ts`
import { dispatch } from '../dispatch.js';

export const incrementCounter = () => {
  dispatch('COUNTER:INCREMENT');
};

export const setCounter = (value: number) => {
  dispatch('COUNTER:SET', value);
};
```

## Non-React Usage

For non-React applications, you can still use the core functionality:

```js
// Vanilla JavaScript example
const { createUseStore, useDispatch } = window.zubridge;

// Create store hook
const useStore = createUseStore();

// Create dispatch function
const dispatch = useDispatch();

// Get the entire state
const getState = () => useStore.getState();

// Subscribe to state changes
const unsubscribe = useStore.subscribe((state) => {
  // Update UI with new state
  document.getElementById('counter').textContent = state.counter;
});

// Setup UI event handlers
document.getElementById('increment-btn').addEventListener('click', () => {
  dispatch('COUNTER:INCREMENT');
});

document.getElementById('decrement-btn').addEventListener('click', () => {
  dispatch('COUNTER:DECREMENT');
});

// Clean up when done
function cleanup() {
  unsubscribe();
}
```

## Performance Considerations

### Optimizing Selectors

For better performance, use selectors that return only the specific state values you need:

```tsx
// ❌ Not optimal - will re-render on any state change
const state = useStore();
const counter = state.counter;

// ✅ Better - only re-renders when counter changes
const counter = useStore((state) => state.counter);
```

### Memoizing Complex Selectors

For complex selectors, consider using memoization:

```tsx
import { useMemo } from 'react';

// Component will only re-render when filtered items change
const FilteredList = () => {
  const items = useStore((state) => state.items);
  const filter = useStore((state) => state.filter);

  const filteredItems = useMemo(() => {
    return items.filter((item) => item.includes(filter));
  }, [items, filter]);

  return (
    <ul>
      {filteredItems.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
};
```
