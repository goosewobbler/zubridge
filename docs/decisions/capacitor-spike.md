# Spike: Ionic / Capacitor Integration

> Gate for Ionic / Capacitor integration. Linked from [ROADMAP.md §7](../../ROADMAP.md#7-sequencing-and-dependencies) and [docs/evaluations/ionic-capacitor.md](../evaluations/ionic-capacitor.md).

## Context

Capacitor is the third Path C consumer. Same UniFFI Kotlin + Swift bindings as Flutter / RN, wrapped in a Capacitor Plugin instead of a TurboModule. The spike validates that the Plugin model fits and that Zubridge's value proposition survives Capacitor's webview-based architecture (especially the PWA degradation case).

## Owner

Core team (1 dev, ~5–7 days).

## When

**After the Flutter spike completes** (consumes the same UniFFI Kotlin+Swift artifacts). Can run in parallel with the React Native spike.

## Scope

Build a minimal `@zubridge/capacitor` package:

- Capacitor Plugin wrapping UniFFI-generated Kotlin (Android) and Swift (iOS) bindings
- JS-side wrapper: `dispatch`, `getState`, `subscribe`, `registerThunk`, `completeThunk`
- Initial bindings for **Ionic-React** (single front-end framework for the spike; Vue/Angular bindings deferred to full integration)

Build a minimal Ionic-React app in `spikes/capacitor/` demonstrating:

- Two pages sharing state
- Action dispatch from JS, state subscription via React hooks
- PWA-mode degradation behaviour (i.e., what happens when no native plugin is available)

## Validate

- Capacitor Plugin scaffolding is straightforward
- Plugin API surface exposes the runtime-neutral primitives cleanly — no impedance mismatch with the NAPI/UniFFI layer
- JS wrapper composes naturally with React hooks (Vue/Angular variants estimated qualitatively, full validation deferred)
- **PWA mode handling** — if the app runs in browser-only mode (no native plugin), the wrapper should fail clearly or degrade to a renderer-only mode. This is the biggest open question for Capacitor: does Zubridge's multi-process value survive web-only deployment?
- Capacitor desktop (electron-wrapped) interaction — what happens when `@zubridge/electron` and `@zubridge/capacitor` are both present?

## Deliverables

- `spikes/capacitor/` — working Ionic-React app for iOS + Capacitor Plugin wrapper
- This document updated with spike findings — especially PWA degradation behaviour
- Updated [docs/evaluations/ionic-capacitor.md](../evaluations/ionic-capacitor.md) "Spike findings" subsection

## Outcomes

- **Go.** Spike code seeds `@zubridge/capacitor`. Full integration begins; Vue/Angular front-end variants added; Android support added.
- **No-go on PWA degradation.** If Capacitor users predominantly target web-mode (where multi-process sync doesn't apply), the integration's value proposition is too thin. Move Capacitor to "Considered but not prioritized" with rationale.
- **No-go on plugin ergonomics.** Document specific friction; likely culprits: native-plugin bridge marshalling overhead, plugin discovery in Ionic's runtime.

## Risks

- Ionic supports three front-end frameworks; the spike only validates React. Full integration must verify Vue and Angular don't expose hidden friction.
- Capacitor's desktop story uses Electron; need to document interaction model with `@zubridge/electron`.
