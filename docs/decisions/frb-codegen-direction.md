# Decision: flutter_rust_bridge Codegen Direction

> Gate for Flutter integration. Linked from [ROADMAP.md §6](../../ROADMAP.md#6-sequencing-and-dependencies) and [docs/evaluations/flutter.md](../evaluations/flutter.md).

## Context

flutter_rust_bridge (FRB) uses its own codegen to produce Dart bindings + a Rust glue layer. The underlying `zubridge_core::*` API is consumed identically to how UniFFI consumers (RN, Capacitor) consume it. But on Android and iOS, FRB also generates platform-specific glue (Kotlin / Swift) — and so does UniFFI for RN/Capacitor. We need to decide whether the same Kotlin/Swift artifacts are used by both Flutter and RN/Capacitor, or whether each framework generates its own.

## Decision needed

Does Flutter ship with FRB-generated Kotlin/Swift glue, while RN/Capacitor ship with UniFFI-generated Kotlin/Swift glue — keeping them independent? Or does Flutter consume the same UniFFI-generated Kotlin/Swift bindings that RN/Capacitor will use, with FRB only handling the Dart layer on top?

## Owner

Core team.

## When

Before starting Flutter integration (post-P7).

## Acceptance criterion

Pick one source of truth per native artifact to avoid version skew. Decision documented here with rationale:

- **Path A — Independent:** Flutter has its own FRB-managed Kotlin/Swift; RN/Capacitor have UniFFI-managed Kotlin/Swift. Two binding artifacts per platform. More code; less coordination cost.
- **Path B — Unified:** UniFFI is the single source for Kotlin/Swift; FRB only handles the Dart-side wrapper. Less duplication; tighter coupling between Flutter and RN/Capacitor pipelines.

## Trade-offs to evaluate

- FRB v2 ergonomics — how much friction does FRB add if used only for Dart?
- UniFFI's stability and feature coverage for what Flutter needs
- Maintenance burden of two binding stacks vs one
- Release coordination: if UniFFI is unified, every Flutter release waits on RN/Capacitor compatibility
