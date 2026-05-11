# Spike: Blazor Integration

> **Blocked on [`wasm-value-research.md`](./wasm-value-research.md).** This spike is only scheduled if the WASM value-proposition research returns "go." If "no-go," this document is archived and Blazor remains in [ROADMAP §5 Deferred pending research](../../ROADMAP.md#5-deferred-pending-research).
>
> Gate for Blazor integration. Linked from [docs/evaluations/blazor.md](../evaluations/blazor.md).

## Context

Blazor was originally planned as a Path D consumer. Critical re-evaluation identified that:

- Blazor WebAssembly is a single-tab web app where Zubridge's multi-process value doesn't strongly apply
- Blazor Hybrid (MAUI) is the more compelling variant — but it uses a native shell, not WASM, and would be a Path C integration

The WASM value-proposition research is intended to settle whether browser-target frameworks (Blazor WebAssembly + Dioxus Web) have enough cross-tab / multi-process demand to justify the WASM target's ongoing engineering tax. This spike runs **only if that research says "go."**

## Owner

Core team or Blessed contributor (1 dev, ~7–10 days).

## When

**Only after [wasm-value-research.md](./wasm-value-research.md) returns "go".** Until then, this spike is not scheduled. Sequenced after Path D scaffolding (i.e., once `zubridge-core` has a `wasm` feature with passing CI).

## Scope

Build a minimal `@zubridge/blazor` package:

- `zubridge-core` compiled to WASM via `wasm-bindgen` (Path D scaffolding must exist first)
- JS glue layer exposed via `IJSRuntime` interop from C# Blazor
- C# wrapper class around the JS API: `ZubridgeStore`, `Dispatch`, `Subscribe`

Build a minimal Blazor WebAssembly app in `spikes/blazor/` demonstrating:

- A single-page Blazor WASM app with two components
- State shared across components via the Zubridge wrapper
- Action dispatch from one component, state observation in the other
- WASM bundle size measurement (against the 200 KB gzipped cap from [wasm-bundle-budget.md](./wasm-bundle-budget.md))

## Validate

- WASM bundle stays within budget (Blazor apps are bundle-size-sensitive)
- C# ↔ JS interop via `IJSRuntime` is acceptable (latency, error propagation, type marshalling)
- The "JS-Rust hop" performance is acceptable for typical Blazor app patterns
- Whether Blazor Hybrid (MAUI) should be a separate spike (Path C, not D) or covered by the same package
- Whether the bundle size + perf cost justifies the integration vs. C# users writing their own state management

## Deliverables

- `spikes/blazor/` — working Blazor WASM app + C# wrapper + JS glue
- WASM bundle size measurements
- This document updated with spike findings
- Updated [docs/evaluations/blazor.md](../evaluations/blazor.md) "Spike findings" subsection
- If a Blazor Hybrid path emerges as more compelling: a recommendation to split Blazor Hybrid into a separate Path C integration

## Outcomes

- **Go.** Spike code seeds `@zubridge/blazor`. Full integration begins. Blazor moves from "Deferred" to "Queued" in ROADMAP §1.1.
- **No-go on bundle size.** WASM target too heavy for Blazor users. Document specific overhead; consider whether a stripped-down `zubridge-core-lite` for WASM is worth pursuing — but only if other Path D consumers (Dioxus Web) also need it.
- **No-go on ergonomics / perf.** C#-JS-Rust hop too painful. Blazor moves back to permanent "Deferred."
- **Pivot.** If Blazor Hybrid (MAUI) emerges as the compelling target, pivot to a Path C integration (UniFFI native bindings + C# wrapper) and deprecate the Path D Blazor work.

## Risks

- Blazor's adoption trajectory in 2026+ is uncertain — re-validate market interest before spike begins
- `wasm-bindgen` ergonomics with C# consumers via `IJSRuntime` is uncommon — community examples may be sparse
- The 200 KB gzipped cap is aggressive; may force feature-flag gymnastics in core
