# Neutralino — Integration Feasibility

> Re-evaluated; harder than initially scoped. Linked from [ROADMAP.md §4](../../ROADMAP.md#4-post-refactor-framework-integrations). Hands-on validation in [neutralino-spike.md](../decisions/neutralino-spike.md) (only if Neutralino is prioritized).

## Summary

Lightweight desktop framework using a small native shell + the system webview engine (no bundled Chromium, no Node by default).

## Runtime model

**C++ native binary** (the Neutralino shell) serves a local HTTP API; the webview connects via that API. App code is plain JS/HTML/CSS in the webview. **Node.js is not in the default architecture** — it's available only via Neutralino's Extensions API, which spawns child processes.

## Integration path options

1. **Node-extension shim** — package a Node.js process as a Neutralino extension that loads `@zubridge/node-native`. Webview JS calls Neutralino's extension API; the extension translates to the NAPI binding. Adds one extra process and one extra IPC hop vs. Electron.
2. **Webview-only adapter** — state lives entirely in the renderer; no cross-window sync. Limited utility; really just a `@zubridge/types`-compatible Zustand wrapper. Not the value proposition.
3. **Rust extension type** — contribute a Rust extension mechanism to Neutralino upstream so a Rust process can be the extension directly. Larger upfront cost; better long-term ergonomics.

## Verdict

**MEDIUM**. The Node-extension shim (option 1) is the realistic short-term path; option 3 is desirable but requires upstream collaboration.

## Pre-requisites

- P5 of the [refactor](../../UNIFFI_REFACTOR_PLAN.md) (NAPI binary published)
- Integration design decision between options 1 and 3 — tracked in [docs/decisions/neutralino-approach.md](../decisions/neutralino-approach.md)

## Effort

- **M–L** for option 1 (extension scaffolding + IPC bridging)
- **L–XL** for option 3 (Neutralino upstream contribution + Rust extension type)

## Risks / open questions

- Performance: extra IPC hop may matter for high-frequency dispatch; benchmark required
- Neutralino's adoption curve relative to Electrobun
- Whether the extra runtime hop is acceptable to Neutralino's "lightweight" value proposition
- Whether option 3 (Rust extension) is politically viable with the Neutralino project
- **Recommendation:** evaluate Electrobun first; only invest in Neutralino if there's clear user demand
