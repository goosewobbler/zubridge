# Ionic / Capacitor — Integration Feasibility

> New evaluation. Linked from [ROADMAP.md §4](../../ROADMAP.md#4-post-refactor-framework-integrations). Hands-on validation in [capacitor-spike.md](../decisions/capacitor-spike.md).

## Summary

Capacitor is a native-bridge framework for hybrid apps; Ionic is the most common front-end paired with it. Capacitor wraps web tech (HTML/CSS/JS) in a native shell (WKWebView on iOS, WebView on Android, system webview on desktop via Electron host).

## Runtime model

Native main process (Swift on iOS, Kotlin/Java on Android, Electron on desktop) + webview running the JS application. Capacitor Plugins expose native code to JS via an automatic bridge.

## Integration path

UniFFI Kotlin + Swift bindings from `zubridge-core` (shared with Flutter and RN). Wrap each in a Capacitor Plugin:

- Define the plugin's JS API: `dispatch`, `getState`, `subscribe`, `registerThunk`, `completeThunk`
- Capacitor's plugin runtime auto-routes calls to the Kotlin/Swift implementation
- JS-side wrapper exposed as `@zubridge/capacitor` consumable by Ionic React / Vue / Angular and by vanilla Capacitor apps

## Verdict

**HIGH** — shares UniFFI investment with Flutter / RN.

## Pre-requisites

Flutter integration (UniFFI bindings infrastructure).

## Effort

**M–L** — Capacitor Plugin scaffolding is well-documented; main work is wiring + framework-agnostic JS wrapper.

## Risks / open questions

- On desktop, Capacitor sometimes wraps Electron — interaction with `@zubridge/electron` if both are present in the same app (recommend: use Capacitor plugin path for native mobile, fall back to `@zubridge/electron` directly for the Electron-hosted desktop case)
- JS wrapper must support Ionic's three front-end framework variants — Vue/Angular bindings may need framework-specific subpaths (`@zubridge/capacitor/react`, `@zubridge/capacitor/vue`, etc.)
- PWA mode: Capacitor apps can run as web (no native), in which case the plugin no-ops — need graceful degradation
