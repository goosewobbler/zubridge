# React Native — Integration Feasibility

> New evaluation. Linked from [ROADMAP.md §4](../../ROADMAP.md#4-post-refactor-framework-integrations). Hands-on validation in [react-native-spike.md](../decisions/react-native-spike.md).

## Summary

JavaScript-authored cross-platform mobile framework (React for native). Primary targets iOS + Android; community ports for macOS, Windows, web.

## Runtime model

JS thread (Hermes on Android, JSC on iOS) runs React; native code exposed via Native Modules / TurboModules; New Architecture introduces JSI (direct C++ binding) + Fabric (new renderer).

## Integration path

UniFFI generates Kotlin (Android) and Swift (iOS) bindings from `zubridge-core`. Wrap each in a TurboModule using JSI for high-performance bridge. JS-side hooks (`useZubridgeStore`, `useZubridgeDispatch`) mirror the Electron/Tauri renderer hooks.

## Verdict

**HIGH** — shares all UniFFI investment with Flutter.

## Pre-requisites

Flutter integration completed (anchors the Kotlin/Swift binding pipeline). Strictly: P7 + UniFFI mobile bindings; pragmatically: Flutter first.

## Effort

**L** — TurboModule scaffolding per platform; JSI binding for performance; JS-side hook layer.

## Risks / open questions

- RN's New Architecture rollout: Old Architecture still supported but deprecated; commit to TurboModules only (don't support old NativeModules)
- JSI binding for synchronous methods vs. async via TurboModule queue — pick based on action-dispatch hot path performance. Tracked in [docs/decisions/jsi-vs-turbomodule.md](../decisions/jsi-vs-turbomodule.md).
- Minimum RN version: 0.74+ (New Architecture default) likely fine in 2026
- RN macOS / Windows ports: out of initial scope; add via community contribution later
