# Decision: Neutralino Integration Approach

> Gate for Neutralino integration. Linked from [ROADMAP.md §6](../../ROADMAP.md#6-sequencing-and-dependencies) and [docs/evaluations/neutralino.md](../evaluations/neutralino.md).

## Context

Neutralino's native shell is C++, not Node.js, so consuming `@zubridge/node-native` requires architectural work — it isn't a pure Path A drop-in like Electrobun.

Three options exist:

1. **Node-extension shim** — package a Node process as a Neutralino extension that loads the NAPI binding; webview JS talks to it via Neutralino's extension API.
2. **Webview-only adapter** — state lives in the renderer; no cross-window sync. Limited utility.
3. **Upstream Rust extension type** — contribute a new extension mechanism to Neutralino so a Rust process can be the extension directly.

## Decision needed

Which option ships first?

## Owner

Core team + Neutralino maintainers (for option 3).

## When

Pre-Neutralino integration. Engage Neutralino project upstream first.

## Acceptance criterion

- Engage Neutralino maintainers within a quarter; if they're receptive to a Rust extension type, commit to **option 3**.
- Otherwise, ship **option 1** (Node-extension shim) and document the extra IPC hop.
- **Option 2** is documented as a fallback for renderer-only use cases but not as the headline integration.

## Trade-offs to evaluate

- Performance: option 1 adds one process + one IPC hop vs Electron baseline; benchmark required before committing
- Maintenance: option 3 ties Zubridge release cadence to Neutralino upstream
- User experience: option 1 may feel "not lightweight" — at odds with Neutralino's value proposition
- Whether user demand justifies the engineering investment in either path
