# Advanced Usage

Once you've got the basics of `@zubridge/electron` set up (as covered in the [Getting Started](./getting-started.md) guide), you might want to explore some of the more advanced features and configurations available.

## Working with Multiple Windows

For applications with multiple windows, you can subscribe and unsubscribe windows as needed:

```ts
// `src/main/index.ts`
import { app, BrowserWindow } from 'electron';
import { createZustandBridge } from '@zubridge/electron/main';
import { store } from './store.js';

// create main window
const mainWindow = new BrowserWindow({
  /* ... */
});

// instantiate bridge
const bridge = createZustandBridge(store);

// subscribe the initial window
const mainSubscription = bridge.subscribe([mainWindow]);

// Later, create a new window
const secondWindow = new BrowserWindow({
  /* ... */
});

// Subscribe the new window
const secondSubscription = bridge.subscribe([secondWindow]);

// Unsubscribe specific window when it's closed
secondWindow.on('closed', () => {
  secondSubscription.unsubscribe();
});

// unsubscribe all windows on quit
app.on('quit', () => {
  bridge.unsubscribe(); // unsubscribes all windows
});
```

## Using Custom Handler Names

You can expose the Zubridge handlers under a different name in your preload script, which is useful for:

- Avoiding name conflicts with other libraries
- Using a naming convention that better fits your application
- Creating multiple bridges with different configurations

First, expose the handlers under a custom name in your preload script:

```ts
// `src/preload/index.ts`
import { contextBridge } from 'electron';
import { preloadBridge } from '@zubridge/electron/preload';

// Create handlers with default configuration
const { handlers } = preloadBridge();

// Expose handlers under a custom name
contextBridge.exposeInMainWorld('myAppBridge', handlers);

// You can also expose multiple bridges with different configurations
const { handlers: debugHandlers } = preloadBridge({ debug: true });
contextBridge.exposeInMainWorld('debugBridge', debugHandlers);
```

Then, pass these custom handlers directly to the hooks in your renderer code:

```ts
// `src/renderer/hooks/useStore.ts`
import { createUseStore, useDispatch } from '@zubridge/electron';
import type { AppState } from '../../types/index.js';

// Access the custom-named handlers
const customHandlers = (window as any).myAppBridge;

// Create hooks that use the custom handlers
export const useAppStore = createUseStore<AppState>(customHandlers);
export const useAppDispatch = () => useDispatch<AppState>(customHandlers);

// You can also create hooks for your debug bridge
const debugHandlers = (window as any).debugBridge;
export const useDebugStore = createUseStore<AppState>(debugHandlers);
export const useDebugDispatch = () => useDispatch<AppState>(debugHandlers);
```

Use these custom hooks in your components:

```tsx
// `src/renderer/App.tsx`
import { useAppStore, useAppDispatch } from './hooks/useStore.js';

export function App() {
  // Use the custom hooks instead of the default ones
  const counter = useAppStore((state) => state.counter);
  const dispatch = useAppDispatch();

  return (
    <div>
      <p>Counter: {counter}</p>
      <button onClick={() => dispatch('INCREMENT')}>Increment</button>
      {/* ... */}
    </div>
  );
}
```

This approach gives you maximum flexibility to integrate Zubridge with your existing architecture and naming conventions.

## Advanced TypeScript Usage

You can leverage TypeScript to create strongly-typed actions:

```ts
// Define your state type
interface AppState {
  counter: number;
  user: {
    name: string;
    loggedIn: boolean;
  };
}

// Define your action types
type CounterActions = {
  'counter/increment': number; // payload is a number
  'counter/decrement': number;
  'counter/reset': void; // no payload
};

type UserActions = {
  'user/login': { username: string; password: string }; // payload is an object
  'user/logout': void;
  'user/updateName': string;
};

// Combine action types
type AppActions = CounterActions & UserActions;

// Use the typed dispatch
const dispatch = useDispatch<AppState, AppActions>();

// Now these are type-checked:
dispatch({ type: 'counter/increment', payload: 5 }); // ✅ Correct
dispatch({ type: 'user/login', payload: { username: 'user', password: 'pass' } }); // ✅ Correct

// These would cause TypeScript errors:
dispatch({ type: 'counter/increment', payload: 'five' }); // ❌ Wrong payload type
dispatch({ type: 'user/login', payload: 'user' }); // ❌ Wrong payload type
dispatch({ type: 'unknown/action' }); // ❌ Unknown action type
```

## Working with Thunks

Zubridge provides comprehensive thunk support for complex asynchronous logic. For detailed information about thunk patterns, see the [Thunks guide](./thunks.md) which covers:

- Basic and advanced thunk usage
- Action sequencing and deferred actions
- Promise-based patterns and error handling
- Cross-window coordination
- Bypass flags and completion acknowledgement

## Middleware Integration

> **⚠️ Coming Soon**: The `@zubridge/middleware` package is not yet released. This section documents the planned middleware integration for future reference.

Zubridge will support integration with external middleware systems through the upcoming `@zubridge/middleware` package. The middleware will provide logging, performance tracking, and action monitoring capabilities:

```ts
// in main process
import { createZustandBridge } from '@zubridge/electron/main';
import { initZubridgeMiddleware } from '@zubridge/middleware'; // Not yet available
import { store } from './store.js';

// Initialize middleware with configuration
const middleware = initZubridgeMiddleware({
  logging: { 
    enabled: true,
    console: true,
    pretty_print: true
  },
  performance: {
    measure_performance: true
  }
});

// Create bridge with middleware
const bridge = createZustandBridge(store, [mainWindow], {
  middleware: middleware,
  
  // Bridge lifecycle hook (currently available)
  onBridgeDestroy: () => {
    console.log('Bridge is being destroyed');
    // Clean up any resources
  },
});
```

The planned middleware will automatically handle:
- **Action processing** - Logs actions before they're sent to the store
- **State updates** - Tracks state changes and updates
- **Performance monitoring** - Measures action processing times  
- **Resource cleanup** - Automatically destroys middleware when bridge is destroyed

**Currently Available**: The `onBridgeDestroy` hook is available now and can be used for custom cleanup logic when the bridge is destroyed.

## Testing with Zubridge

You can easily test components that use Zubridge hooks by providing mock handlers:

```tsx
// Create mock handlers for testing
const mockState = { counter: 10 };
const mockDispatch = jest.fn();

const mockHandlers = {
  getState: jest.fn().mockResolvedValue(mockState),
  dispatch: mockDispatch,
  subscribe: jest.fn().mockImplementation((callback) => {
    callback(mockState);
    return () => {};
  }),
};

// Test component
import { render, screen, fireEvent } from '@testing-library/react';
import { createUseStore, useDispatch } from '@zubridge/electron';

// Override the default hooks with mocked versions
jest.mock('@zubridge/electron', () => ({
  createUseStore: () => (selector) => selector(mockState),
  useDispatch: () => mockDispatch,
}));

test('Counter component increments when button is clicked', () => {
  render(<Counter />);

  expect(screen.getByText('Counter: 10')).toBeInTheDocument();

  fireEvent.click(screen.getByText('Increment'));

  expect(mockDispatch).toHaveBeenCalledWith({ type: 'INCREMENT' });
});
```



## Selective Subscriptions

Zubridge supports selective subscriptions using keys, this is useful for separation of concerns - restricting the state access of a given renderer process to just the section of state that it needs to function.  Note that performance testing shows no significant improvement over full state updates.

### Key-Based Subscriptions

Subscribe windows to specific state keys:

```typescript
// Subscribe with specific keys
const subscription = bridge.subscribe([mainWindow], ['user', 'settings']);

// Only state changes to 'user' or 'settings' will be sent to this window
dispatch('UPDATE_USER', newUser);        // ✅ Sent to window
dispatch('UPDATE_THEME', newTheme);      // ❌ Not sent (theme not in keys)
dispatch('UPDATE_SETTINGS', settings);  // ✅ Sent to window
```

### Dispatch with Key Targeting

Target specific subscribers when dispatching actions:

```typescript
// Only send to subscribers with 'admin' key
dispatch('ADMIN_UPDATE', payload, { keys: ['admin'] });

// Send to multiple key groups
dispatch('NOTIFICATION', message, { keys: ['user', 'admin'] });
```

### Performance Considerations

While selective subscriptions work correctly, performance testing reveals:

- **Full state transmission** performs equally well due to efficient serialization
- **Network overhead** is minimal for typical application state sizes
- **Complexity** of key management may not justify the implementation cost

**Recommendation**: Use full state updates unless you have specific separation of concerns / security or bandwidth requirements.


## Next Steps

For more detailed information:

- [Getting Started](./getting-started.md) - Basic setup and usage patterns
- [Thunks](./thunks.md) - Complete thunk guide including advanced patterns, error handling, and async actions
- [How It Works](./how-it-works.md) - Detailed explanation of how Zubridge manages state synchronization
- [API Reference](./api-reference.md) - Complete reference for all API functions and types
- [Main Process](./main-process.md) - Detailed guide for using Zubridge in the main process
- [Renderer Process](./renderer-process.md) - Detailed guide for using Zubridge in the renderer process
