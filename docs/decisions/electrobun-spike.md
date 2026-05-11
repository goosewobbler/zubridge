# Spike: Electrobun Integration (incorporates Bun NAPI Audit)

> Gate for Electrobun integration. Linked from [ROADMAP.md §7](../../ROADMAP.md#7-sequencing-and-dependencies), [UNIFFI_REFACTOR_PLAN.md](../../UNIFFI_REFACTOR_PLAN.md), and [docs/evaluations/electrobun.md](../evaluations/electrobun.md).

This spike combines two activities into a single deliverable:

1. **Bun NAPI compatibility audit** — does Bun support the N-API surface `@zubridge/node-native` uses?
2. **Electrobun ergonomics spike** — does the integration *feel* like a good fit for a Bun/Electrobun developer?

The audit (1) runs first. If it fails, the spike (2) is dropped and the document captures the audit-failure rationale alone.

## Context

Path A (NAPI reuse) is the cheapest integration path. Electrobun runs on Bun, which has expanding-but-incomplete NAPI support. Beyond raw API compatibility, the integration must also feel idiomatic — Zubridge's value proposition (cross-window state sync) needs to land cleanly for Electrobun's developer audience.

## Owner

Core team (1 dev, ~5 days end-to-end).

## When

**During P5 of the refactor**, concurrent with NAPI binding development. The spike consumes the P5 dual-runtime smoke test (`apps/standalone-node/`) as its starting point.

## Scope

### Part 1 — NAPI audit (~1 day)

Run the dual-runtime smoke test under Bun. Confirm or fail on:

- Handle-scope management
- Async work (`napi_create_async_work` and friends)
- ThreadsafeFunction (`napi_threadsafe_function_*`) — used for event emission from Rust to JS
- Reference / weak-reference semantics

**Acceptance:** pass = all required calls work; fail = list missing calls with remediation cost.

### Part 2 — Ergonomics spike (~3–4 days; runs only if Part 1 passes)

Build a minimal Electrobun app in `spikes/electrobun/` that:

- Opens two webview windows
- Shares state across them via `@zubridge/node-native` in the Bun main process
- Demonstrates dispatch, subscribe, and thunk lifecycle from JS
- Uses a Zustand-style API mirroring `@zubridge/electron`'s

**Validate:**

- The Electrobun-specific wiring layer (translating between Electrobun's IPC primitives and the runtime-neutral NAPI surface) is small and obvious
- The developer experience matches `@zubridge/electron`'s ergonomics
- No surprises: error messages, edge cases (rapid dispatch, window lifecycle) behave reasonably
- Performance feels right (qualitative; not a benchmark)

## Deliverables

- Spike code in `spikes/electrobun/` (working app + minimal wrapper code)
- This document updated with audit findings and spike outcomes
- Updated [docs/evaluations/electrobun.md](../evaluations/electrobun.md) "Spike findings" subsection

## Outcomes

- **Go.** Spike code seeds `@zubridge/electrobun` package; ROADMAP §1.1 status promotes from "Evaluating" to "Queued." Full integration begins post-P7.
- **No-go on audit (Part 1 fail).** Document missing Bun NAPI APIs. Options: contribute upstream, ship a Bun-FFI shim, or defer integration entirely. ROADMAP §1.1 status moves to "Deferred."
- **No-go on spike (Part 2 fail).** Audit passed but ergonomics revealed Electrobun's IPC model doesn't compose well with the runtime-neutral NAPI surface. Document specific friction; consider whether the wiring layer needs Electrobun-specific extensions to `zubridge-core`.

## Risks

- Bun's NAPI surface may evolve mid-spike — pin Bun version at spike start
- Electrobun's API stability — confirm minimum-supported-version with maintainers before committing
