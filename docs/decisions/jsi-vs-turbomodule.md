# Decision: JSI vs TurboModule Async Dispatch (React Native)

> Gate for React Native integration. Linked from [ROADMAP.md §6](../../ROADMAP.md#6-sequencing-and-dependencies) and [docs/evaluations/react-native.md](../evaluations/react-native.md).

## Context

React Native's New Architecture offers two ways to call native code:

- **JSI (JavaScript Interface)** — direct synchronous C++ binding from the JS engine; lowest latency
- **TurboModule async queue** — events posted to a native queue; results delivered asynchronously

For Zubridge's hot path (action dispatch + state update round-trip), the choice affects both performance and implementation complexity.

## Decision needed

Use JSI (synchronous, lower complexity per call but careful threading required) or TurboModule async queue (simpler model, higher per-call latency) for the dispatch + state-update round trip?

## Owner

Core team.

## When

Before starting RN integration. Concurrent or immediately after Flutter integration.

## Acceptance criterion

Microbenchmark in a throwaway RN harness:

- **Target:** dispatch + state-update round-trip under **5 ms** on a mid-range device (e.g., a 2-year-old Android device or an iPhone SE-class iPhone)
- Pick whichever path meets the target with lower implementation complexity
- If JSI meets the target: commit to JSI for the hot path; use TurboModule for lifecycle (init, destroy)
- If TurboModule meets the target: commit to TurboModule throughout; revisit only if user reports validate the latency budget

## Trade-offs to evaluate

- JSI's threading model — Zubridge core is `Send + Sync`, but JS engine threads have constraints
- TurboModule's serialization cost — every cross-boundary call marshals arguments
- Maintenance: JSI bindings drift with RN versions; TurboModule signatures are more stable
- Whether the action-batching window (16ms default) already absorbs the per-call latency
