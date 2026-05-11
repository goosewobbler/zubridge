# Spike: React Native Integration

> Gate for React Native integration. Linked from [ROADMAP.md §7](../../ROADMAP.md#7-sequencing-and-dependencies) and [docs/evaluations/react-native.md](../evaluations/react-native.md).

## Context

React Native is the second Path C consumer. The Flutter spike establishes UniFFI Kotlin + Swift bindings; the RN spike validates that wrapping those bindings in a TurboModule (with optional JSI for sync hot paths) meets latency targets and developer-ergonomics expectations.

The existing [JSI vs TurboModule async dispatch](./jsi-vs-turbomodule.md) decision is **evidence-driven by this spike** — the spike includes the microbenchmark needed to pick a side.

## Owner

Core team (1 dev, ~7–10 days).

## When

**After the Flutter spike completes** (consumes UniFFI Kotlin+Swift artifacts that Flutter spike produces). Can run in parallel with the Capacitor spike.

## Scope

Build a minimal `zubridge-react-native` package:

- TurboModule wrapping the UniFFI-generated Kotlin (Android) and Swift (iOS) bindings
- Optional JSI binding for synchronous hot paths (dispatch + state-update round-trip)
- JS-side hooks: `useZubridgeStore`, `useZubridgeDispatch`

Build a minimal RN app in `spikes/react-native/` targeting iOS (faster setup than Android for the spike) demonstrating:

- Two screens sharing state
- Dispatch from JS, state subscription via hooks
- Microbenchmark: dispatch + state-update round-trip latency

## Validate

- TurboModule scaffolding is straightforward; signature codegen behaves
- JSI binding for the hot path achieves the **5 ms target** per [jsi-vs-turbomodule.md](./jsi-vs-turbomodule.md)
- If 5 ms not achievable: identify whether the bottleneck is JSI overhead, UniFFI marshalling, or `zubridge-core` scheduler latency
- Old Architecture (legacy NativeModules) — confirm we can drop support for it
- RN's frequent SDK updates — pin a minimum RN version

## Deliverables

- `spikes/react-native/` — working RN app for iOS + TurboModule wrapper
- Microbenchmark results in this document
- [jsi-vs-turbomodule.md](./jsi-vs-turbomodule.md) resolved with evidence
- This document updated with spike findings
- Updated [docs/evaluations/react-native.md](../evaluations/react-native.md) "Spike findings" subsection

## Outcomes

- **Go.** Spike code seeds `@zubridge/react-native`. Full integration begins; Android support added once iOS is stable.
- **No-go on perf (5 ms target missed).** Document where the budget goes; consider relaxed targets vs architecture changes vs deferring RN entirely. If miss is in UniFFI marshalling, may need to revisit `flutter_rust_bridge` decision since both paths share core.
- **No-go on ergonomics.** TurboModule scaffolding overhead too high; consider alternative bridging mechanisms (Hermes native modules, etc.).

## Risks

- RN's New Architecture is now stable but ecosystem still migrating — pin minimum RN version
- iOS toolchain reuse from Flutter spike — if Flutter spike used a different signing/provisioning setup, expect time to adapt
