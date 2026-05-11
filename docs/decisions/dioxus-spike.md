# Spike: Dioxus Integration

> Gate for Dioxus integration. Linked from [ROADMAP.md §7](../../ROADMAP.md#7-sequencing-and-dependencies) and [docs/evaluations/dioxus.md](../evaluations/dioxus.md).

## Context

Dioxus is the Path B proof point — direct-Rust consumption of `zubridge-core` without an FFI layer. The spike validates that the core API is idiomatic enough for Dioxus's reactive runtime, not just the FFI-mediated paths (Tauri, NAPI).

Scope: **Dioxus Desktop + Mobile** only. Dioxus Web is deferred per the [WASM value research](./wasm-value-research.md) — if that research returns "go," a **Phase 2 web-target extension** is added to this spike (see "Conditional Phase 2" below).

## Owner

Core team (1 dev, ~5 days).

## When

**Early post-P7**, before committing to a full Dioxus integration. Sized small enough that it can run in parallel with Electrobun integration kick-off.

## Scope

Build a `zubridge-dioxus` crate prototype with idiomatic Dioxus hooks:

- `use_zubridge_state<S>(selector)` — subscribes to a state slice; re-renders the component when the slice changes
- `use_zubridge_dispatch()` — returns a typed dispatch function
- `ZubridgeProvider` — context provider scoping a store to a subtree

Build a minimal Dioxus Desktop app in `spikes/dioxus/` demonstrating:

- Two windows sharing state
- One component reading state, another dispatching actions
- Thunk lifecycle visible in the UI

## Validate

- The direct-Rust consumption is genuinely simpler than the FFI-mediated paths (i.e., we're not duplicating glue code that should live in core)
- `EventEmitter` trait implementation for Dioxus's reactive runtime is clean — sync API works without forcing weird threading
- Zubridge's value (cross-window state sync) lands for Dioxus users — distinct from Dioxus's own Signals/Context state primitives
- API ergonomics match the Tauri / Electron equivalents (consistency across paths)

## Deliverables

- `spikes/dioxus/` — working Dioxus Desktop app + `zubridge-dioxus` crate prototype
- This document updated with spike findings
- Updated [docs/evaluations/dioxus.md](../evaluations/dioxus.md) "Spike findings" subsection

## Outcomes

- **Go.** Spike code seeds the `zubridge-dioxus` crate. Full integration begins; Dioxus Mobile target added once Desktop is stable.
- **No-go.** Document specific friction — most likely candidates: `EventEmitter` design needs revision for Dioxus's reactive runtime; or Dioxus's own state primitives make Zubridge redundant for typical apps; or Wry-on-iOS thread-safety quirks block multi-window patterns. Update [dioxus.md](../evaluations/dioxus.md) verdict.

## Conditional Phase 2 — Dioxus Web target

**Only triggered if [wasm-value-research.md](./wasm-value-research.md) returns "go" AND Path D scaffolding has landed in `zubridge-core`.**

If both conditions are met, extend this spike with:

- A minimal Dioxus Web app in `spikes/dioxus/web/` consuming the WASM-compiled `zubridge-core`
- Validation that the same `zubridge-dioxus` crate hooks (`use_zubridge_state`, etc.) work identically across Desktop, Mobile, and Web targets
- Cross-tab state sync via `BroadcastChannel` or `SharedWorker` (the actual Zubridge value-add for browser-only apps)

Phase 2 effort: **~3 days** additional. Phase 2 is skipped entirely if WASM research returns "no-go" — Dioxus stays Desktop + Mobile only.

## Risks

- Dioxus is pre-1.0 — pin version at spike start; document compatibility window
- Dioxus's own state-management story (Signals, Context) — clarify positioning before publishing the integration
