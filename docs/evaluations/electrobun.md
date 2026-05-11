# Electrobun — Integration Feasibility

> New evaluation. Linked from [ROADMAP.md §4](../../ROADMAP.md#4-post-refactor-framework-integrations). Hands-on validation in [electrobun-spike.md](../decisions/electrobun-spike.md).

## Summary

TS-authored Electron alternative built on the Bun runtime; uses native system webviews.

## Runtime model

Bun main process (Node-compatible API surface); native webviews per platform. Process model resembles Tauri/Neutralino more than Electron — single main process, lightweight webviews.

## Integration path

Reuse `@zubridge/node-native` (NAPI) from the Bun main process. Bun has been expanding its NAPI surface; verification is the gating step. If a NAPI gap exists for a specific API the core uses, options are:

- Wait for Bun upstream to land the missing call
- Provide a JS-side fallback in the adapter package
- Provide a CFFI / Bun-FFI shim (Bun's native FFI) bypassing NAPI for the affected path

## Verdict

**MEDIUM–HIGH**, contingent on a one-page Bun NAPI compatibility audit before committing dev time. If Bun NAPI handles handle-scope, async work, and ThreadsafeFunction (used by event emission), integration is straightforward.

## Pre-requisites

- P5 of the [refactor](../../UNIFFI_REFACTOR_PLAN.md)
- Bun NAPI compatibility audit — part of [docs/decisions/electrobun-spike.md](../decisions/electrobun-spike.md) Part 1

## Effort

- **S–M** if NAPI works fully
- **M–L** if a shim layer is needed

## Risks / open questions

- Bun NAPI ThreadsafeFunction support for state-update event emission
- Electrobun's IPC primitive shape vs Electron's `ipcMain.handle` (adapter pattern handles this; cost is documentation)
- Electrobun's maturity / API stability (still pre-1.0; spec a minimum-supported-version)
- Cross-platform native webview behaviour gaps already addressed by Tauri research — leverage that work
