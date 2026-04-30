<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/goosewobbler/zubridge/main/resources/zubridge-hero.png">
  <source media="(prefers-color-scheme: light)" srcset="https://raw.githubusercontent.com/goosewobbler/zubridge/main/resources/zubridge-hero.png">
  <img alt="zubridge hero image" src="https://raw.githubusercontent.com/goosewobbler/zubridge/main/resources/zubridge-hero.png" style="max-height: 415px;">
</picture>

<h1 align="center">Zubridge Tauri</h1>

_Cross-platform state without boundaries: Zustand-inspired simplicity for Tauri_

<a href="https://www.npmjs.com/package/@zubridge/tauri" alt="NPM Version">
  <img src="https://img.shields.io/npm/v/@zubridge/tauri" /></a>
<a href="https://www.npmjs.com/package/@zubridge/tauri" alt="NPM Downloads">
  <img src="https://img.shields.io/npm/dw/@zubridge/tauri" /></a>

`@zubridge/tauri` is the renderer-side companion to [`tauri-plugin-zubridge`](https://crates.io/crates/tauri-plugin-zubridge). It exposes a small, opinionated API that mirrors `@zubridge/electron`: your Rust backend is the source of truth, and your webviews get a Zustand-shaped local replica that stays in sync via a sequence-numbered delta channel.

## Why Zubridge?

[Zustand](https://github.com/pmndrs/zustand) provides a simple state management pattern, but in Tauri apps the authoritative state typically lives in Rust and is shared across multiple webviews. `@zubridge/tauri` keeps the Zustand-style ergonomics — `useStore(selector)` and a `dispatch(action)` — and handles the Tauri command + event plumbing for you, including delta-based state sync, action batching, per-window subscriptions, and backend-coordinated thunks.

## Features

- **Zustand-style hooks** — `useZubridgeStore(selector)` and `useZubridgeDispatch()` against a local replica of the backend state.
- **Per-webview subscriptions** — `subscribe(keys)`, `unsubscribe(keys)`, `getWindowSubscriptions()`. The Rust runtime authoritatively associates subscriptions with the calling webview's label.
- **Delta-based sync** — only the keys that changed are sent, with a per-webview monotonic sequence number. On a sequence gap the renderer auto-resyncs from `get_initial_state`.
- **Renderer-side thunks** — thunks register with the backend, dispatch actions through the bridge, and notify completion. Nested thunks share a parent id so the backend can lock state by thunk lineage.
- **Action batching** — `dispatch.batch(...)` inside a thunk coalesces calls into a single `batch_dispatch` invoke; the plugin emits one coalesced state-update event for the batch.
- **Validation** — pluggable `setActionValidatorStateProvider` and `setSubscriptionFetcher` let you enforce per-window access control before an action is sent.
- **Typed errors** — `TauriCommandError`, `ThunkExecutionError`, `SubscriptionError`, `ActionProcessingError`, etc. all extend `ZubridgeError` and carry structured context.
- **Tauri v1 + v2** — works against either by passing the host's `invoke` and `listen` into `initializeBridge`.

## Installation

```bash
npm install @zubridge/tauri zustand @tauri-apps/api
```

Add the plugin on the Rust side — see [`tauri-plugin-zubridge`](https://crates.io/crates/tauri-plugin-zubridge) for the full Rust setup.

## Quick Start

```tsx
// main.tsx — initialise once per webview
import { initializeBridge } from '@zubridge/tauri';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

await initializeBridge({ invoke, listen });
```

```tsx
// Counter.tsx
import { useZubridgeStore, useZubridgeDispatch } from '@zubridge/tauri';

interface AppState {
  counter: number;
}

export function Counter() {
  const counter = useZubridgeStore((s: AppState) => s.counter);
  const dispatch = useZubridgeDispatch<AppState>();

  return (
    <div>
      <h1>Counter: {counter}</h1>
      <button onClick={() => dispatch('INCREMENT')}>+</button>
      <button onClick={() => dispatch({ type: 'SET_COUNTER', payload: 0 })}>reset</button>
    </div>
  );
}
```

## API

### `initializeBridge(options): Promise<void>`

Idempotent — concurrent callers in the same tick share the in-flight promise. The bridge transitions through `uninitialized → initializing → ready` (or `error`) and the status is observable via `useZubridgeStore((s) => s.__bridge_status)`.

```ts
await initializeBridge({
  invoke,        // (cmd, args?) => Promise<unknown>
  listen,        // (event, handler) => Promise<UnlistenFn>
  commands?: {   // optional overrides for the wire commands / event name
    getInitialState?: string,
    getState?: string,
    dispatchAction?: string,
    batchDispatch?: string,
    registerThunk?: string,
    completeThunk?: string,
    stateUpdateAck?: string,
    subscribe?: string,
    unsubscribe?: string,
    getWindowSubscriptions?: string,
    stateUpdateEvent?: string,
  },
  batching?: BatchingOptions, // ActionBatcher tuning (window/maxBatchSize/...)
});
```

If the plugin probe fails the client falls back to direct command names (e.g. `dispatch_action` instead of `plugin:zubridge|dispatch_action`).

### `cleanupZubridge(): Promise<void>`

Tears down the bridge — unlistens the state-update event, destroys the thunk processor, and resets `__bridge_status` to `uninitialized`.

> **Breaking in 2.x**: this is now `async` and returns `Promise<void>`. In 1.x it was synchronous (`void`). Always `await` it (or chain `.then(...)`) — un-awaited callers will continue before `bridgeClient.destroy()` finishes, which can leave dangling event listeners and lose any error raised by destruction. See the migration section below.

### `useZubridgeStore<S>(selector, equalityFn?): SliceOfS`

React hook backed by `useSyncExternalStore`. Returns the selected slice of the local replica and re-renders when it changes.

```ts
const counter = useZubridgeStore((s: AppState) => s.counter);
const profile = useZubridgeStore((s: AppState) => s.user.profile);
```

### `useZubridgeDispatch<S>(): DispatchFunc<S>`

Returns a dispatch function that accepts:
- a string action: `dispatch('INCREMENT')`
- an action object: `dispatch({ type: 'SET_COUNTER', payload: 5 })`
- a thunk: `dispatch(async (getState, dispatchInner) => { ... })`

Inside a thunk, the inner dispatch carries `dispatch.batch(...)` and `dispatch.flush()` for explicit batching.

### Subscriptions

```ts
import { subscribe, unsubscribe, getWindowSubscriptions } from '@zubridge/tauri';

// Limit this webview to the given keys (returns the resolved set)
await subscribe(['counter', 'user.profile']);

// Drop keys
await unsubscribe(['counter']);

// Inspect what this webview is currently subscribed to
const keys = await getWindowSubscriptions();
```

The Rust runtime injects the calling webview's label authoritatively, so a webview cannot subscribe / unsubscribe / ack on behalf of another window.

### Direct state read

```ts
import { getState } from '@zubridge/tauri';

const all = await getState();             // full filtered state for this webview
const slice = await getState(['counter']); // narrows the filtered view
```

### Validators

The bridge wires up two pluggable hooks during `initializeBridge`. You can also configure them yourself if you want validation outside the bridge lifecycle:

```ts
import {
  setActionValidatorStateProvider,
  registerActionMappings,
  validateActionDispatch,
} from '@zubridge/tauri';

setActionValidatorStateProvider(async () => myLocalSnapshot);
registerActionMappings({
  INCREMENT: ['counter'],
  SET_PROFILE: ['user.profile'],
});

await validateActionDispatch({ type: 'INCREMENT' }); // throws if not subscribed
```

### Errors

```ts
import { TauriCommandError, isErrorOfType } from '@zubridge/tauri';

try {
  await dispatch('INCREMENT');
} catch (err) {
  if (isErrorOfType(err, TauriCommandError)) {
    console.error(err.command, err.sourceLabel, err.context);
  }
}
```

`TauriCommandError` carries `command` and `sourceLabel` plus a free-form `context` object. Other errors include `ThunkExecutionError` (with `phase: 'registration' | 'execution' | 'completion'`), `SubscriptionError`, `ActionProcessingError`, and `QueueOverflowError`.

## Wire protocol

| Command (plugin)                    | Direct fallback                | Args                                                    | Result                                       |
|-------------------------------------|--------------------------------|---------------------------------------------------------|----------------------------------------------|
| `plugin:zubridge\|get_initial_state`        | `get_initial_state`            | —                                                       | `JsonValue` (full state)                     |
| `plugin:zubridge\|get_state`                | `get_state`                    | `{ args: { keys?: string[] } }`                         | `{ value: JsonValue }`                       |
| `plugin:zubridge\|dispatch_action`          | `dispatch_action`              | `{ args: { action: ZubridgeAction } }`                  | `{ action_id: string }`                      |
| `plugin:zubridge\|batch_dispatch`           | `batch_dispatch`               | `{ args: { batch_id, actions: ZubridgeAction[] } }`     | `{ batch_id, acked_action_ids }`             |
| `plugin:zubridge\|register_thunk`           | `register_thunk`               | `{ args: { thunk_id, parent_id?, immediate?, ... } }`   | `{ thunk_id }`                               |
| `plugin:zubridge\|complete_thunk`           | `complete_thunk`               | `{ args: { thunk_id, error? } }`                        | `{ thunk_id }`                               |
| `plugin:zubridge\|state_update_ack`         | `state_update_ack`             | `{ args: { update_id } }`                               | —                                            |
| `plugin:zubridge\|subscribe`                | `subscribe`                    | `{ args: { keys } }`                                    | `{ keys }`                                   |
| `plugin:zubridge\|unsubscribe`              | `unsubscribe`                  | `{ args: { keys } }`                                    | `{ keys }`                                   |
| `plugin:zubridge\|get_window_subscriptions` | `get_window_subscriptions`     | —                                                       | `{ keys }`                                   |

State updates arrive on the event `zubridge://state-update` with payload:

```ts
{ seq: number, update_id: string, delta?: { changed, removed }, full_state?: AnyState, source?: { action_id?, thunk_id? } }
```

## Migration from `@zubridge/tauri` 1.x

Version 2 is a structural rewrite — the renderer architecture matches `@zubridge/electron` and the plugin gains a richer wire protocol. Most application code remains the same shape, but a few breaking changes need attention:

### Action wire shape

Actions are now serialised in `snake_case` with extra metadata fields. Update any custom Rust dispatcher that consumes the JSON wire form directly:

```diff
- // 1.x — { action_type, payload }
- { action_type: "INCREMENT", payload: null }

+ // 2.x — { id, action_type, payload, source_label, thunk_parent_id?, immediate?,
+ //         keys?, bypass_access_control?, starts_thunk?, ends_thunk? }
+ { id: "...", action_type: "INCREMENT", payload: null, source_label: "main" }
```

Application code that calls `dispatch(...)` does not change. If you implement `StateManager`, the helper `ZubridgeAction::to_legacy_json()` returns the legacy `{ type, payload }` shape used by `dispatch_action`.

### `updateState` is removed

The 1.x `updateState` helper that pushed state from JS into the Rust backend has been removed. State is owned by the Rust `StateManager` — drive it with `dispatch(action)` instead.

### Subscription API replaces broadcast-everything

In 1.x every webview received every update. In 2.x the Rust runtime tracks per-webview subscriptions and only sends the relevant keys.

```ts
import { subscribe, unsubscribe, getWindowSubscriptions } from '@zubridge/tauri';

await subscribe(['counter', 'user.profile']);
await unsubscribe(['user.profile']);
const keys = await getWindowSubscriptions();
```

If you do not call `subscribe`, the webview receives the full filtered state (the Rust default-all behaviour). The TS-side validators also default to permissive when no fetcher is configured.

### `cleanupZubridge` replaces `cleanup` — and is now async

Two breaking changes here:

1. The function is renamed from `cleanup()` to `cleanupZubridge()`.
2. The return type changes from `void` to `Promise<void>`. The 1.x function ran synchronously; the 2.x function awaits `bridgeClient.destroy()` (which unlistens the state-update event, destroys the renderer thunk processor, and resets the local store).

You **must** `await` (or `.then(...)`) the returned promise. Fire-and-forget callers — common in React effect destructors and `beforeunload` handlers — will:

- continue before destruction finishes, leaving the state-update listener attached and the thunk processor live for the duration of the in-flight teardown;
- silently swallow any error raised during destruction (no rejection handler).

```diff
- // 1.x — synchronous
- useEffect(() => {
-   initializeBridge({ invoke, listen });
-   return () => cleanup();
- }, []);

+ // 2.x — async; await it
+ useEffect(() => {
+   initializeBridge({ invoke, listen });
+   return () => {
+     cleanupZubridge().catch((err) => console.error('cleanup failed', err));
+   };
+ }, []);
```

If you cannot easily await it from your call site (e.g. a synchronous `beforeunload` handler), wrap it: `void cleanupZubridge().catch(...)`. Do not rely on the call resolving before the surrounding scope returns.

### Errors

Errors raised from the bridge transport are now `TauriCommandError` (extends `ZubridgeError`) with `command` and `sourceLabel` instead of generic `Error`. The `IpcCommunicationError` type from `@zubridge/electron` does not exist here — use `TauriCommandError`.

### Plugin version

The matching `tauri-plugin-zubridge` version is `0.2.x`. Older `0.1.x` plugins do not understand the new commands (`batch_dispatch`, `register_thunk`, `subscribe`, etc.) and will fail the plugin probe — the client falls back to the direct command names, but you still need a backend that registers them.

## Architecture diagrams

<img alt="zubridge tauri direct architecture" src="https://raw.githubusercontent.com/goosewobbler/zubridge/main/resources/zubridge-tauri-direct-architecture.png"/>

<img alt="zubridge tauri plugin architecture" src="https://raw.githubusercontent.com/goosewobbler/zubridge/main/resources/zubridge-tauri-plugin-architecture.png"/>

## Development

For information about contributing to this project, see the [Developer Guide](https://github.com/goosewobbler/zubridge/blob/main/docs/developer.md).

## License

MIT
