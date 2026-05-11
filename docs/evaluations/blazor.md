# Blazor — Integration Feasibility

> **Deferred pending [WASM value-proposition research](../decisions/wasm-value-research.md)** scheduled during P5 of the refactor. Listed in [ROADMAP.md §5](../../ROADMAP.md#5-deferred-pending-research). Hands-on validation in [blazor-spike.md](../decisions/blazor-spike.md) (only if research returns "go").
>
> Critical re-evaluation: Blazor WebAssembly is a single-tab web app where Zubridge's multi-process value-add doesn't strongly apply. The more compelling variant (Blazor Hybrid / MAUI) uses a native shell, not WASM, and would be a Path C integration if pursued. The Path D investment is not justified by Blazor alone.

## Summary

C# UI framework with two runtime modes — Blazor Server (server-side rendering with SignalR) and Blazor WebAssembly (C# compiled to WASM in the browser).

## Runtime model

- **Blazor WebAssembly:** C# → WASM in the browser. Single-process; communicates with backend via standard HTTP/SignalR if needed.
- **Blazor Server:** C# on the server; UI events round-trip over SignalR. Not a target for Zubridge state management directly.
- **Blazor Hybrid (MAUI):** C# in a native shell; potentially a target via MAUI's native interop.

## Integration path (WebAssembly focus)

Compile `zubridge-core` to WASM via `wasm-bindgen`. Provide JS glue. Blazor C# wrapper imports the JS module via JS interop (`IJSRuntime`). Trade-offs:

- Pure C#-Rust interop is rough; going via JS adds a layer
- Alternative: target `dotnet-bindgen` if it matures; currently the JS bridge is most reliable

## Verdict

**MEDIUM** — feasible but smaller ecosystem; experimental status appropriate.

## Pre-requisites

P7 of the [refactor](../../UNIFFI_REFACTOR_PLAN.md) + WASM scaffolding (Path D).

## Effort

**L–XL** — WASM target work has secondary value (also enables Dioxus Web + future browser-only targets).

## Risks / open questions

- WASM bundle size for Blazor apps (every byte counts on web). Tracked in [docs/decisions/wasm-bundle-budget.md](../decisions/wasm-bundle-budget.md).
- Blazor performance characteristics with the JS-Rust hop; benchmark vs. pure-C# state management
- Whether to support Blazor Server / Hybrid as separate variants
