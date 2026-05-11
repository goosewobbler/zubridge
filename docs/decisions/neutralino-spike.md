# Spike: Neutralino Integration

> Gate for Neutralino integration. Linked from [ROADMAP.md §7](../../ROADMAP.md#7-sequencing-and-dependencies) and [docs/evaluations/neutralino.md](../evaluations/neutralino.md).

## Context

Neutralino's native shell is C++ — not Node — so reusing `@zubridge/node-native` requires architectural work (see [neutralino-approach.md](./neutralino-approach.md)). The spike validates the Node-extension shim approach (option 1) and measures the performance cost of the extra IPC hop, before committing to a full integration.

## Owner

Core team or Blessed contributor (1 dev, ~5 days).

## When

**Only if/when Neutralino is prioritized.** §7.1 places Neutralino at step 6 of the post-refactor sequence (lower priority unless community demand emerges). This spike is **not** scheduled until the priority decision is made.

If Electrobun integration fails (Bun NAPI audit returns "no-go"), Neutralino moves up and the spike runs earlier.

## Scope

Build a minimal Neutralino app in `spikes/neutralino/` with:

- A Node.js process packaged as a Neutralino extension (per [neutralino-approach.md](./neutralino-approach.md) option 1)
- The extension loads `@zubridge/node-native` and exposes dispatch/getState/subscribe to the webview via Neutralino's extensions API
- Two windows sharing state through the extension

## Validate

- The Node-extension shim works end-to-end
- **IPC hop latency** — measure dispatch + state-update round-trip; compare to Electron baseline
- Whether the extension lifecycle (start/stop with the main app) behaves reliably
- Whether Neutralino's value proposition (lightweight) is preserved given the extra Node process
- Whether [neutralino-approach.md](./neutralino-approach.md) option 3 (upstream Rust extension) is still worth pursuing — does the option 1 cost justify upstream effort?

## Deliverables

- `spikes/neutralino/` — working Neutralino app + Node-extension shim
- IPC latency measurements in this document
- This document updated with spike findings
- [neutralino-approach.md](./neutralino-approach.md) resolved with evidence (option 1 viable / requires option 3 escalation)
- Updated [docs/evaluations/neutralino.md](../evaluations/neutralino.md) "Spike findings" subsection

## Outcomes

- **Go on option 1.** Spike code seeds `@zubridge/neutralino`. Full integration begins; option 3 (upstream Rust extension) becomes a future enhancement, not a blocker.
- **Go but requires option 3.** Option 1 works but performance is unacceptable. Open upstream issue with Neutralino project; defer full integration until upstream lands a Rust extension type.
- **No-go.** Document specific blockers — most likely candidates: extension API too limited; IPC overhead unacceptable; Neutralino's runtime stability insufficient for production state-management. Move Neutralino to "Considered but not prioritized."

## Risks

- Neutralino's extensions API is less mature than Tauri's plugin API; expect undocumented behaviour
- Neutralino runtime version may need to be pinned narrowly
- Whether Neutralino's adoption justifies any spike effort vs. focusing core team time elsewhere
