<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/goosewobbler/zubridge/main/resources/zubridge-hero.png">
  <source media="(prefers-color-scheme: light)" srcset="https://raw.githubusercontent.com/goosewobbler/zubridge/main/resources/zubridge-hero.png">
  <img alt="zubridge hero image" src="https://raw.githubusercontent.com/goosewobbler/zubridge/main/resources/zubridge-hero.png" style="max-height: 415px;">
</picture>

<h1 align="center">Zubridge Tauri Plugin</h1>

_Cross-platform state without boundaries: the official Tauri plugin for Zubridge_

<a href="https://crates.io/crates/tauri-plugin-zubridge" alt="Crates.io Version">
  <img src="https://img.shields.io/crates/v/tauri-plugin-zubridge" /></a>
<a href="https://crates.io/crates/tauri-plugin-zubridge" alt="Crates.io Downloads">
  <img src="https://img.shields.io/crates/dr/tauri-plugin-zubridge" /></a>

`tauri-plugin-zubridge` is the Rust side of the Zubridge Tauri integration. It owns the authoritative application state, exposes a fixed set of Tauri commands consumed by [`@zubridge/tauri`](https://www.npmjs.com/package/@zubridge/tauri), and emits sequence-numbered state-update events to keep every webview's local replica in sync.

## What's in the plugin

- **State manager registration** — the host implements the `StateManager` trait; the plugin invokes it for `get_state` / `dispatch_action`.
- **Per-webview subscriptions** — `SubscriptionManager` tracks which keys each webview cares about and filters outbound updates accordingly.
- **Delta-encoded state updates** — `DeltaCalculator` keeps a per-webview last-state cache and emits a `{ changed, removed }` delta when possible, otherwise a full-state snapshot.
- **Sequence numbering + ack tracking** — every state-update event carries a per-webview monotonically-increasing `seq` plus a unique `update_id`. The renderer acks each update; on a sequence gap the renderer auto-resyncs via `get_initial_state`.
- **Thunk registry** — `ThunkRegistry` correlates renderer-side thunks with the actions they emit so the host can apply key-based locking by thunk lineage.
- **Authoritative webview labels** — every command pulls the source label from `tauri::Window<R>` rather than trusting client-supplied values, so a webview cannot subscribe / ack / dispatch on behalf of another window.

## Installation

```toml
# Cargo.toml
[dependencies]
tauri-plugin-zubridge = "0.2"
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
```

The matching frontend dependency is `@zubridge/tauri` `^2.0`.

## Quick start

```rust
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{plugin::TauriPlugin, Runtime};
use tauri_plugin_zubridge::{plugin_default, JsonValue, StateManager};

#[derive(Default, Serialize, Deserialize, Clone, Debug)]
struct AppState {
    counter: i32,
}

struct AppStateManager(Mutex<AppState>);

impl StateManager for AppStateManager {
    fn get_initial_state(&self) -> JsonValue {
        let s = self.0.lock().unwrap();
        serde_json::to_value(&*s).unwrap()
    }

    fn dispatch_action(&mut self, action: JsonValue) -> JsonValue {
        let mut s = self.0.lock().unwrap();
        if let Some(t) = action.get("type").and_then(|v| v.as_str()) {
            match t {
                "INCREMENT" => s.counter += 1,
                "DECREMENT" => s.counter -= 1,
                "SET_COUNTER" => {
                    if let Some(v) = action.get("payload").and_then(|v| v.as_i64()) {
                        s.counter = v as i32;
                    }
                }
                _ => {}
            }
        }
        serde_json::to_value(&*s).unwrap()
    }
}

fn zubridge<R: Runtime>() -> TauriPlugin<R> {
    plugin_default(AppStateManager(Mutex::new(AppState::default())))
}

fn main() {
    tauri::Builder::default()
        .plugin(zubridge())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

The frontend then initialises the bridge — see [`@zubridge/tauri`](https://www.npmjs.com/package/@zubridge/tauri) for the renderer-side API.

## The `StateManager` trait

```rust
pub trait StateManager: Send + Sync + 'static {
    /// Return the current state of the app.
    fn get_initial_state(&self) -> JsonValue;

    /// Apply an action and return the new state. The plugin computes a delta
    /// against the previous snapshot and broadcasts the result to subscribed
    /// webviews.
    fn dispatch_action(&mut self, action: JsonValue) -> JsonValue;
}
```

The plugin calls `dispatch_action` with the legacy `{ type, payload }` shape (the wire protocol's `ZubridgeAction` is converted internally via `ZubridgeAction::to_legacy_json()`), so existing reducer-style code keeps working.

`Send + Sync + 'static` is required because the handle is shared across Tauri's command pool. Wrap mutable state in a `Mutex` / `RwLock` / channel as appropriate.

## Plugin entry points

| Function | When to use |
| --- | --- |
| `plugin_default(state_manager)` | One-shot setup with a state manager and the default `ZubridgeOptions`. |
| `plugin(state_manager, options)` | Same as above, but with custom `ZubridgeOptions` (e.g. a different state-update event name). |
| `init()` | Builds the plugin without a state manager — register one later with `app.zubridge().register_state_manager(...)`. |

All variants register the same set of commands. The extension trait `ZubridgeExt<R>` gives `App`, `AppHandle`, and `Window` access to the live `Zubridge<R>` instance.

## Commands

All commands are registered both at the plugin path (`plugin:zubridge|<command>`) and via `tauri::generate_handler!`, so direct invocation by short name also works for hosts that prefer to wire commands manually.

| Command | Args | Result |
| --- | --- | --- |
| `get_initial_state` | — | `JsonValue` |
| `get_state` | `{ keys?: Vec<String> }` | `{ value: JsonValue }` (filtered by subscription, then narrowed by `keys`) |
| `dispatch_action` | `{ action: ZubridgeAction }` | `{ action_id: String }` |
| `batch_dispatch` | `{ batch_id: String, actions: Vec<ZubridgeAction> }` | `{ batch_id: String, acked_action_ids: Vec<String> }` |
| `register_thunk` | `{ thunk_id, parent_id?, keys?, bypass_access_control?, immediate? }` | `{ thunk_id: String }` |
| `complete_thunk` | `{ thunk_id, error? }` | `{ thunk_id: String }` |
| `state_update_ack` | `{ update_id: String }` | — |
| `subscribe` | `{ keys: Vec<String> }` | `{ keys: Vec<String> }` (resolved set after applying) |
| `unsubscribe` | `{ keys: Vec<String> }` | `{ keys: Vec<String> }` (resolved set after applying) |
| `get_window_subscriptions` | — | `{ keys: Vec<String> }` |

The `default` permission set in `permissions/default.toml` exposes all ten commands — opt out by overriding the permission set in your app's capability file.

### Webview-label authority

`dispatch_action`, `batch_dispatch`, `register_thunk`, `complete_thunk`, `state_update_ack`, `subscribe`, `unsubscribe`, and `get_window_subscriptions` all derive the source webview label from `tauri::Window<R>::label()` and overwrite any client-supplied `source_label`. This blocks the spoofing vector where a malicious webview could subscribe / ack on another window's behalf.

### `ZubridgeAction` wire shape

```rust
pub struct ZubridgeAction {
    pub id: Option<String>,                 // generated server-side if absent
    pub action_type: String,                // wire name; renderer's `type` field
    pub payload: Option<JsonValue>,
    pub source_label: Option<String>,       // overwritten by the plugin
    pub thunk_parent_id: Option<String>,
    pub immediate: Option<bool>,
    pub keys: Option<Vec<String>>,
    pub bypass_access_control: Option<bool>,
    pub starts_thunk: Option<bool>,
    pub ends_thunk: Option<bool>,
}
```

## State-update events

After each successful dispatch (or batch), the plugin emits one event to every subscribed webview:

```rust
pub struct StateUpdatePayload {
    pub seq: u64,                       // monotonic, per-webview
    pub update_id: String,              // ack identifier
    pub delta: Option<StateDelta>,      // present when delta encoding is in use
    pub full_state: Option<JsonValue>,  // initial sync, after a gap, or non-object roots
    pub source: Option<UpdateSource>,   // { action_id?, thunk_id? }
}

pub struct StateDelta {
    pub changed: Map<String, JsonValue>, // top-level keys whose values changed
    pub removed: Vec<String>,            // top-level keys removed
}
```

The default event name is `zubridge://state-update` (overridable via `ZubridgeOptions::event_name`).

`batch_dispatch` applies every action and then emits a single coalesced update for the whole batch — the plugin intentionally does not emit one update per action inside a batch.

## Errors

Commands return `Result<T, Error>` where `Error` serialises to a string. The variants are:

| Variant | Raised when |
| --- | --- |
| `Io` | std::io errors bubbled up by the runtime |
| `StateError` | lock poisoning / internal state inconsistency |
| `EmitError` | the runtime fails to emit a state-update event |
| `SerializationError` | serde JSON conversion failure |
| `ActionProcessing { action_id, message }` | the state manager rejected the action |
| `QueueOverflow { queue_size, max_size }` | the action queue is full |
| `Subscription { source_label, message }` | subscription / unsubscription failed |
| `ThunkRegistration { thunk_id, message }` | thunk could not be registered |
| `ThunkNotFound { thunk_id }` | complete / ack referenced an unknown thunk |
| `StateManagerMissing` | a command was invoked before any `StateManager` was registered |

## Architecture

<img alt="zubridge tauri plugin architecture" src="https://raw.githubusercontent.com/goosewobbler/zubridge/main/resources/zubridge-tauri-plugin-architecture.png"/>

```
                           +-----------------------------+
                           |        webview ("main")     |
                           |   @zubridge/tauri client    |
                           +-----------------------------+
                                      |  invoke / listen
                                      v
+------------------------------------------------------------------+
|                       tauri-plugin-zubridge                      |
|                                                                  |
|   commands::{state, dispatch, thunk, subscription}               |
|     - Window<R>::label() -> authoritative source_label           |
|     - args carry batch_id / thunk_id / keys / update_id          |
|                                                                  |
|   Zubridge<R>                                                    |
|     - StateManagerHandle  (host's state manager)                 |
|     - SubscriptionManager (keys per webview)                     |
|     - DeltaCalculator     (last-state cache per webview)         |
|     - ThunkRegistry       (parent / child thunk lineage)         |
|     - StateUpdateTracker  (in-flight update_id -> webview map)   |
|     - SequenceTracker     (monotonic seq per webview)            |
|                                                                  |
|   Emit `zubridge://state-update` (StateUpdatePayload) to subset  |
+------------------------------------------------------------------+
```

## Example application

A complete example demonstrating the plugin end-to-end:

- [Tauri E2E app](https://github.com/goosewobbler/zubridge/tree/main/apps/tauri/e2e)

## License

MIT
