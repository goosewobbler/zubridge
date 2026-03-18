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

Zubridge supports selective subscriptions using keys. The primary benefit is **separation of concerns** — restricting the state access of a given renderer process to only the section of state that it needs to function.

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
dispatch({ type: 'ADMIN_UPDATE', payload }, { keys: ['admin'] });

// Send to multiple key groups
dispatch({ type: 'NOTIFICATION', payload: message }, { keys: ['user', 'admin'] });
```

### Performance Considerations

Selective subscriptions reduce the amount of data processed by `sanitizeState` (the recursive serialization step before IPC), which can be significant for large state trees. However, the end-to-end round-trip is dominated by Electron's structured clone in `webContents.send()`, so the JS-level savings may not be observable for typical application state sizes.

For detailed benchmark results, see the [Performance](./performance.md) documentation.

**Recommendation**: Use selective subscriptions when you need to restrict renderer access to specific state keys (separation of concerns, security). For most applications, full state updates work equally well.


## Delta Updates

Delta updates send only the changed portions of state over IPC instead of the full state tree, reducing payload size and serialization cost.

### How It Works

The delta system operates as a three-stage pipeline:

```
Main Process                         IPC                    Renderer Process
┌──────────────┐                                          ┌──────────────────┐
│ DeltaCalc    │    delta payload    │                    │ DeltaMerger      │
│ prev vs next ├───────────────────► │ webContents.send() ──► merge(state,   │
│ → {changed,  │    (only diffs)     │                    │   delta)         │
│    removed}  │                                          │ → new state      │
└──────────────┘                                          └──────────────────┘
```

1. **DeltaCalculator** (main process) — Compares the previous state with the next state. For selective subscriptions, only the subscribed keys are compared. Produces a delta containing `changed` keys (with new values) and `removed` keys.

2. **IPC transfer** — The delta payload (typically much smaller than full state) is serialized and sent via `webContents.send()`.

3. **DeltaMerger** (renderer process) — Merges the delta into the current local state using structural sharing. Only the changed paths are cloned; unchanged subtrees keep their original references, preserving React memo/selector equality.

### Configuration

Delta updates are enabled by default. Configure via `createZustandBridge`:

```typescript
import { createZustandBridge } from '@zubridge/electron/main';

const bridge = createZustandBridge(store, {
  deltas: {
    enabled: true, // Default: true
  },
});
```

### Delta Types

The system produces two types of delta payloads:

- **`delta`** — The primary format, used for both initial subscription state and subsequent updates. Contains `changed` key-value pairs and/or `removed` key names. Initial state is sent as a delta so that overlapping selective subscriptions merge correctly instead of overwriting each other.
- **`full`** — Used internally during gap resync (sequence number discontinuity). Contains the complete state snapshot.

```typescript
// Initial subscription state (sent as delta for safe merging)
{ type: 'delta', changed: { counter: 42, user: { name: 'Alice' } } }

// Subsequent update
{ type: 'delta', changed: { counter: 43 } }

// Delta with removals
{ type: 'delta', changed: { counter: 43 }, removed: ['tempKey'] }
```

### Structural Sharing

The `DeltaMerger` uses structural sharing when applying deltas, which means:

- **Top-level**: A shallow clone of the state object is created (`{ ...state }`)
- **Changed paths**: Only the objects along the changed path are cloned. For a change to `user.profile.theme`, only `user` and `user.profile` are cloned; all other top-level keys keep their original references.
- **Unchanged subtrees**: References are preserved, so `prevState.items === nextState.items` for unchanged keys. This is important for React's `useMemo`, `React.memo`, and selector equality checks.

### Sequence Detection

Each delta update includes a sequence number. The renderer tracks the expected sequence and detects:

- **Gaps** — A missed update (e.g., seq jumps from 3 to 5). The renderer requests a full state resync.
- **Duplicates** — A repeated sequence number. The update is silently skipped.
- **Backward resets** — A sequence number lower than expected (e.g., after main process restart). Triggers a full resync.

### Interaction with Selective Subscriptions

Delta updates and selective subscriptions work together:

- When a window subscribes to specific keys (e.g., `['counter', 'user']`), the `DeltaCalculator` only compares those keys, skipping the rest of the state tree.
- The initial `full` delta contains only the subscribed keys, not the entire store.
- Subsequent `delta` payloads contain only the changed values among the subscribed keys.

This combination provides both payload size reduction (deltas) and access control (selective subscriptions).

### Disabling Deltas

When deltas are disabled, the full subscribed state is sent on every update. Selective subscription key filtering still applies — only the subscribed keys are included in the payload.

```typescript
const bridge = createZustandBridge(store, {
  deltas: {
    enabled: false,
  },
});
```

### Fallback Behavior

When the renderer detects a sequence gap (a missed or out-of-order delta), it cannot safely apply the delta because the local state may be stale. In this case:

1. The renderer logs a warning (if `debug: true`) indicating the gap
2. The stale delta is discarded
3. The renderer immediately calls `getState()` via IPC to fetch the current full state from the main process

Backward sequence resets (e.g., after a main process restart) are treated the same as gaps — the renderer discards the delta and resyncs via `getState()`.

### Interaction with Batching

Delta updates and action batching operate on different stages of the pipeline and are fully independent:

- **Batching** affects the **dispatch path** (renderer → main): multiple actions are grouped into a single IPC call
- **Deltas** affect the **state sync path** (main → renderer): only changed state is sent back

Both can be enabled simultaneously (the default). Disabling one has no effect on the other.

### Renderer-Side Usage

Delta updates are transparent to renderer code. No API changes are needed — `createUseStore` and `useDispatch` work identically whether deltas are enabled or disabled. The `DeltaMerger` runs internally within the preload bridge handlers, so components receive the merged state as usual:

```typescript
// This works the same with or without deltas
const counter = useStore((state) => state.counter);
```

Structural sharing means that unchanged state references are preserved across delta merges, so React selectors and `React.memo` continue to work correctly without extra configuration.

### Debugging

Enable debug logging in the preload bridge to see delta operations:

```typescript
const { handlers } = preloadBridge({ debug: true });
```

With debug enabled, the console logs:
- Each state update received (update ID, associated thunk ID)
- Delta merges (`Merging delta for update ...`)
- Full state updates (`Received full state update ...`)
- Sequence gap detection (`Sequence gap detected (expected N, got M), resyncing via getState`)
- Duplicate sequence detection (`Duplicate seq N detected, skipping update ...`)
- Fallback to IPC getState when no delta or full state is available

### Benchmarking

Run `pnpm bench` in the electron package to measure delta calculation and merge throughput:

```bash
cd packages/electron
pnpm bench
```

The benchmarks cover `DeltaCalculator` (main process diff computation), `DeltaMerger` (renderer-side merge with structural sharing), and payload size comparisons. For detailed benchmark results, see the [Performance](./performance.md#delta-updates) documentation.

## Action Batching

Zubridge includes built-in action batching that groups multiple renderer actions into single IPC calls to the main process, reducing cross-process overhead for high-frequency updates.

### How It Works

Without batching, each dispatched action results in a separate IPC call. With batching enabled, actions dispatched within a configurable time window are collected and sent as a single `batch-dispatch` IPC call.

```
Without Batching:
Renderer → IPC:dispatch → Main    (one call per action)

With Batching:
Renderer → [queue actions for windowMs] → IPC:batch-dispatch → Main    (one call per window)
```

All actions dispatched within the batch window (default: 16ms) are grouped into one IPC call. For example, 10 actions dispatched in rapid succession become 1 IPC call instead of 10. The batch is also flushed early when it reaches `maxBatchSize` or when a high-priority action is enqueued.

### Configuration

Action batching is enabled by default. You can configure it in your preload script:

```typescript
import { preloadBridge } from '@zubridge/electron/preload';

const bridge = preloadBridge({
  enableBatching: true, // Default: true
  batching: {
    windowMs: 16,               // Batch window in ms (default: 16ms)
    maxBatchSize: 50,            // Max actions per batch (default: 50)
    priorityFlushThreshold: 80,  // Priority threshold for immediate flush (default: 80)
    ackTimeoutMs: 30000,         // Batch ack timeout in ms (default: 30000, Linux: 60000)
  },
});
```

### Disabling Batching

To disable batching and use direct dispatch for all actions:

```typescript
const bridge = preloadBridge({
  enableBatching: false,
});
```

### Priority-Based Flushing

Actions with a priority at or above `priorityFlushThreshold` (default: 80) trigger an immediate flush of the current batch. This ensures time-sensitive actions with `immediate: true` (priority 100) are not delayed by the batch window:

```typescript
dispatch({ type: 'URGENT_ACTION', payload }, { immediate: true });
```

The priority levels are:
- **100** — `immediate` actions (immediate flush)
- **70** — thunk child actions (`__thunkParentId` set)
- **50** — normal actions (batched within the window)

### Benchmarking

Run `pnpm bench` in the electron package to measure batching throughput on your system:

```bash
cd packages/electron
pnpm bench
```

### Batching Thunk Actions

By default, thunk actions bypass batching to avoid potential deadlocks. However, you can opt into batching for thunk actions when needed. This is useful for thunks that dispatch many actions in quick succession.

```typescript
const bulkUpdateThunk = async (getState, dispatch) => {
  // Opt into batching for thunk actions
  void dispatch.batch({ type: 'UPDATE', payload: { id: 1 } });
  void dispatch.batch({ type: 'UPDATE', payload: { id: 2 } });
  void dispatch.batch({ type: 'UPDATE', payload: { id: 3 } });

  // Flush immediately or let the batch window handle it
  const result = await dispatch.flush();
  console.log(`Sent ${result.actionsSent} actions in one batch`);
};
```

For detailed documentation on batched dispatch for thunks, including await semantics and error handling, see the [Thunks guide](./thunks.md#batched-dispatch-for-thunks).

## Next Steps

For more detailed information:

- [Thunks](./thunks.md) - Complete thunk guide including advanced patterns, error handling, and async actions
- [Performance](./performance.md) - Action batching, selective subscriptions, and priority system
- [Validation](./validation.md) - Action validation rules, limits, and security
- [How It Works](./how-it-works.md) - Detailed explanation of how Zubridge manages state synchronization
- [API Reference](./api-reference.md) - Complete reference for all API functions and types
- [Main Process](./main-process.md) - Detailed guide for using Zubridge in the main process
- [Renderer Process](./renderer-process.md) - Detailed guide for using Zubridge in the renderer process
