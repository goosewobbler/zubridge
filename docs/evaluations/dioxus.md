# Dioxus — Integration Feasibility

> New evaluation. Listed in [ROADMAP.md §4](../../ROADMAP.md#4-post-refactor-framework-integrations). Hands-on validation in [dioxus-spike.md](../decisions/dioxus-spike.md).
>
> **Scope: Dioxus Desktop + Dioxus Mobile (Path B).** Dioxus Web is **deferred** pending the [WASM value-proposition research](../decisions/wasm-value-research.md) — see [ROADMAP.md §5](../../ROADMAP.md#5-deferred-pending-research). If the research returns "go", Dioxus Web rejoins this integration as a secondary target (covered by the Conditional Phase 2 of the Dioxus spike).

## Summary

Rust UI framework for cross-platform development; targets web (WASM), desktop (Wry webview), mobile (iOS/Android), TUI, and server-side rendering from one Rust codebase.

## Runtime model

- **Desktop (Dioxus Desktop):** Rust process hosting a Wry webview; components in Rust, virtual DOM diff'd into webview HTML/JS. Tauri-adjacent.
- **Mobile (Dioxus Mobile):** Rust components → native UI. Wry on iOS; Wry-equivalent on Android.
- **Web (Dioxus Web):** Rust components compiled to WASM in the browser.

## Integration path

Direct Rust-to-Rust — no FFI layer needed. `zubridge-dioxus` crate provides:

- `use_zubridge_state<S>(selector)` hook subscribing to state slices
- `use_zubridge_dispatch()` hook returning a typed dispatch function
- `ZubridgeProvider` component scoping a store to a subtree
- For desktop, optional out-of-the-box wiring with Dioxus Desktop's window management
- For web target, requires the `wasm` feature on `zubridge-core` (shared with Blazor)

## Verdict

- **HIGH** for desktop + mobile
- **MEDIUM** for web (gated on WASM scaffolding)

## Pre-requisites

- P7 of the [refactor](../../UNIFFI_REFACTOR_PLAN.md) (stable core)
- For the web target: the WASM scaffolding that also enables Blazor

## Effort

- **M** for desktop + mobile (idiomatic hook layer)
- **+S** to extend to web once WASM is in place

## Risks / open questions

- Dioxus is pre-1.0 (last checked); API churn during integration development
- Adoption is growing but smaller than React/Flutter — investment vs. demand calculation
- Dioxus's own state-management story (Signals, Context) — clarify positioning: Zubridge for *cross-process* / *cross-window* state, Dioxus primitives for local/component state. Document the distinction.
- Performance characteristics with Wry vs Tauri; benchmark parity expected since Wry is shared
