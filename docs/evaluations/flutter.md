# Flutter — Integration Feasibility

> Previously committed; revalidated. Linked from [ROADMAP.md §4](../../ROADMAP.md#4-post-refactor-framework-integrations). Hands-on validation in [flutter-spike.md](../decisions/flutter-spike.md).

## Summary

Dart-authored cross-platform UI framework; targets iOS, Android, macOS, Linux, Windows, web.

## Runtime model

Dart code + Flutter engine (Skia / Impeller renderer). Native code via platform channels or FFI.

## Integration path

**`flutter_rust_bridge` uses its own codegen, not UniFFI.** What's shared across Path C frameworks is the **Rust core itself** (`zubridge-core`), not a unified bindgen. For Flutter specifically, flutter_rust_bridge generates Dart bindings + a Rust glue layer; the underlying `zubridge_core::*` API is consumed identically to how UniFFI consumers (RN, Capacitor) consume it. Provides:

- Idiomatic Dart API: `ZubridgeStore`, listenable state, action dispatch
- State manager implemented in Dart by the user; core handles scheduling, batching, deltas, subscriptions
- Multi-isolate state synchronization (Flutter's process model differs from Electron/Tauri — isolates are the unit of concurrency)

## Verdict

**HIGH** — well-established integration pattern.

## Pre-requisites

P7 of the [refactor](../../UNIFFI_REFACTOR_PLAN.md).

## Effort

**L–XL**. Anchors the mobile bindings story for Path C; subsequent RN and Capacitor integrations reuse the **same Rust core** but generate their own UniFFI-based Kotlin/Swift artifacts (not Flutter's Dart artifacts).

## Risks / open questions

- flutter_rust_bridge v2 codegen ergonomics — pick stable major release at start. Tracked in [docs/decisions/frb-codegen-direction.md](../decisions/frb-codegen-direction.md).
- Dart's null-safety story interplay with Rust `Option<T>`
- Multi-isolate sync semantics need design upfront — different model from Electron's main+renderer
- Whether to use UniFFI for the same Kotlin/Swift bindings RN/Capacitor will use later, or rely on flutter_rust_bridge's own iOS/Android codegen — pick a single source of truth per binding artifact to avoid version skew
