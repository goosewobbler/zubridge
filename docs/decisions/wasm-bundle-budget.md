# Decision: WASM Bundle Size Budget (Path D)

> **Blocked on [`wasm-value-research.md`](./wasm-value-research.md).** Path D is deferred pending the value-proposition research scheduled during P5 of the refactor. If that research returns "go", this budget decision becomes active. If "no-go", this document is archived.
>
> Gate for Path D (Blazor + Dioxus Web). Linked from [ROADMAP.md](../../ROADMAP.md) and [docs/evaluations/blazor.md](../evaluations/blazor.md).

## Context

`zubridge-core` compiled to WASM is the basis of Path D. Browser apps are bundle-size-sensitive — every kilobyte of the core counts against the consuming app's page-weight budget. If the WASM module is too large, Blazor and Dioxus Web become non-viable for performance-conscious projects.

## Decision needed

What is the maximum acceptable WASM bundle size for `zubridge-core`?

## Owner

Core team.

## When

Before starting Path D scaffolding work.

## Acceptance criterion

**Cap: 200 KB gzipped** for the core WASM module with default features (i.e., no telemetry/websocket/messagepack).

If exceeded, identify feature flags to gate out:

1. Audit dependencies — what pulls the most weight (likely serde + tokio if accidentally pulled into WASM build)
2. `telemetry`, `websocket`, `messagepack` features must compile out cleanly in WASM builds
3. Consider whether the full scheduler (P2 of refactor) is needed for browser-only consumers; an optional "lite" core may make sense for WASM

## Trade-offs to evaluate

- Strict cap may force feature-flag gates that complicate other paths
- Generous cap may make Path D unappealing for the audiences that would use it
- Whether to ship a separate `zubridge-core-lite` for WASM with reduced scheduler complexity

## Outputs

- Bundle-size measurement script in `tools/wasm-size.ts`
- CI check fails if `cargo build --target wasm32-unknown-unknown --release` produces a binary above the cap (after `wasm-opt -Oz` + gzip)
