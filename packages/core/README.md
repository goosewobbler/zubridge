<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/goosewobbler/zubridge/main/resources/zubridge-hero.png">
  <source media="(prefers-color-scheme: light)" srcset="https://raw.githubusercontent.com/goosewobbler/zubridge/main/resources/zubridge-hero.png">
  <img alt="zubridge hero image" src="https://raw.githubusercontent.com/goosewobbler/zubridge/main/resources/zubridge-hero.png" style="max-height: 415px;">
</picture>

<h1 align="center">zubridge-core</h1>

_Cross-platform state without boundaries: the unified Rust core powering Zubridge across Tauri, Electron (via NAPI), and future runtimes._

<a href="https://crates.io/crates/zubridge-core" alt="Crates.io Version">
  <img src="https://img.shields.io/crates/v/zubridge-core" /></a>
<a href="https://crates.io/crates/zubridge-core" alt="Crates.io Downloads">
  <img src="https://img.shields.io/crates/dr/zubridge-core" /></a>

`zubridge-core` is the platform-agnostic Rust crate that implements Zubridge's state-management primitives. It is consumed by the platform-specific wrappers — [`tauri-plugin-zubridge`](https://crates.io/crates/tauri-plugin-zubridge) today, `@zubridge/node-native` and other Path A runtimes in future releases.

## What's in the crate

- **State management** — `StateManager` trait + `StateManagerHandle` for host-implemented state.
- **Subscription manager** — multi-window subscription tracking with per-window key filtering.
- **Delta calculator** — diffed state updates that minimise wire payload size; falls back to full-state snapshots when a delta is impractical.
- **Action + thunk scheduler** — full priority-aware scheduling ported from `@zubridge/electron` v3 (priority queue, concurrency control, parent-child thunk relationships, queue overflow handling).
- **Action batcher** — window-based batching of high-frequency dispatches for IPC efficiency.
- **`EventEmitter` trait** — sync, runtime-agnostic observability extension point; consumed by the scheduler, batcher, and orchestrator to publish action and thunk lifecycle events.

## Feature gates

Pick the feature(s) for your target runtime:

```toml
[dependencies]
zubridge-core = { version = "0.1", features = ["tauri"] }   # for tauri-plugin-zubridge
# zubridge-core = { version = "0.1", features = ["napi"] }   # for @zubridge/node-native (planned)
# zubridge-core = { version = "0.1", features = ["uniffi"] } # for UniFFI-based bindings
```

The default feature set is empty; consumers opt in to exactly the wrappers they need.

## Relation to the wider project

`zubridge-core` is the engine; the public packages most users will reach for are:

- [`@zubridge/tauri`](https://www.npmjs.com/package/@zubridge/tauri) + [`tauri-plugin-zubridge`](https://crates.io/crates/tauri-plugin-zubridge) — Tauri integration.
- [`@zubridge/electron`](https://www.npmjs.com/package/@zubridge/electron) — Electron integration (TypeScript today; will consume this crate via NAPI in a future release).

Roadmap and refactor context: see [UNIFFI_REFACTOR_PLAN.md](https://github.com/goosewobbler/zubridge/blob/main/UNIFFI_REFACTOR_PLAN.md) and [ROADMAP.md](https://github.com/goosewobbler/zubridge/blob/main/ROADMAP.md) in the monorepo.

## License

MIT OR Apache-2.0
