# Spike: Flutter Integration

> Gate for Flutter integration. Linked from [ROADMAP.md §7](../../ROADMAP.md#7-sequencing-and-dependencies) and [docs/evaluations/flutter.md](../evaluations/flutter.md).

## Context

Flutter is the Path C anchor. The full integration is L–XL effort; a misstep is expensive. The spike validates `flutter_rust_bridge` ergonomics, Dart's null-safety interop with Rust's `Option<T>`, and Flutter's multi-isolate model against `zubridge-core` *before* committing to the full integration.

## Owner

Core team (1 dev, ~7–10 days). Includes time for the `flutter_rust_bridge` codegen direction decision documented in [frb-codegen-direction.md](./frb-codegen-direction.md).

## When

**Post-P7**, immediately before the Flutter integration kicks off. The decision on `flutter_rust_bridge` codegen direction (UDL vs proc-macro) must be made during this spike.

## Scope

Build a minimal `zubridge-flutter` Dart wrapper around a thin Rust seam over `zubridge_core`:

- `ZubridgeStore<S>` Dart class exposing dispatch, getState, subscribe
- Listenable state integrated with Flutter's reactive system (`ValueListenable` or similar)
- Basic thunk lifecycle from Dart

Build a minimal Flutter app in `spikes/flutter/` demonstrating:

- A single iOS or Android target (whichever is faster to set up — both supported in full integration)
- Two screens / two isolates sharing state
- Action dispatch and state subscription via the Dart wrapper

## Validate

- `flutter_rust_bridge` ergonomics — does the generated Dart API feel native? Are error messages comprehensible?
- Dart `Option<T>` ↔ Rust `Option<T>` translation behaves correctly (null safety + Rust semantics)
- Multi-isolate state sync semantics — Flutter isolates are not threads; ensure `Send` bounds don't cause subtle bugs
- Build pipeline: how painful is `cargo build` + Flutter bundling integration?
- Whether to use UniFFI's Kotlin/Swift generators alongside `flutter_rust_bridge`, or rely on `flutter_rust_bridge`'s own — informs `frb-codegen-direction.md` decision

## Deliverables

- `spikes/flutter/` — working Flutter app for one platform + Dart wrapper crate
- This document updated with spike findings
- [frb-codegen-direction.md](./frb-codegen-direction.md) resolved with evidence
- Updated [docs/evaluations/flutter.md](../evaluations/flutter.md) "Spike findings" subsection

## Outcomes

- **Go.** Spike code seeds `@zubridge/flutter`. Full integration begins; effort estimate refined based on the spike's realized cost.
- **No-go.** Document specific friction. Most likely candidates: `flutter_rust_bridge` ergonomic gaps; isolate-vs-thread model creates unfixable correctness issues; build pipeline complexity makes the integration unmaintainable. Flutter moves to "Deferred" with a path to revisit after the bindgen ecosystem matures.

## Risks

- `flutter_rust_bridge` v2 is the targeted version; pin major version at spike start
- Flutter SDK changes can break Rust-FFI integrations between major releases; document compatibility window
- iOS/Android toolchain setup is non-trivial — budget time accordingly
