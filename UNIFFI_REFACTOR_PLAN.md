# UniFFI Refactor Plan

> Seven-phase plan to migrate Zubridge onto a shared Rust core compiled with conditional features (UniFFI / NAPI-RS / Tauri). Tracks issue [#104](https://github.com/goosewobbler/zubridge/issues/104).

This document is the authoritative source for the **refactor itself** — Phases P1–P7, ending with synchronized Electron 3.1 + Tauri 2.x releases on a unified core. Framework integrations that build on top of the refactor (Flutter, Neutralino, Blazor, and frameworks under evaluation) are tracked in [ROADMAP.md](./ROADMAP.md) at the repo root.

---

## 1. Context

### Why this refactor

Per issue #104, Zubridge is unifying its platform implementations onto a single Rust crate (`zubridge-core`) using [UniFFI](https://github.com/mozilla/uniffi-rs). The crate compiles with conditional features so the same logic powers Electron (via NAPI-RS), Tauri (direct Rust integration), and future targets (Flutter via flutter_rust_bridge, Neutralino via NAPI, Blazor via WASM).

Notable state at the time this plan was written:

- **Electron 3.0** has shipped on TypeScript (commit `ad93b994`).
- **Tauri renderer + plugin** have been aligned with Electron v3 features (PR #152, commit `62a38f33`). The Rust plugin already contains a rich wire protocol, delta calculator, subscription manager, and thunk registry — but does **not** yet contain the full priority scheduler.
- **Tauri v2 has not been released** yet (current versions: `tauri-plugin-zubridge@0.1.1-next.1`, `@zubridge/tauri@1.1.1-next.1`).
- **`packages/core/`** still exists only as the TypeScript debug-utility package (no Rust crate yet).
- **`packages/middleware/`** is a standalone Rust observability crate that has never been integrated.

### Architectural decisions (resolved)

| # | Decision |
|---|----------|
| 1 | Tauri v2 ships **on** the unified core — `packages/tauri-plugin/src/core/` is extracted into a new `packages/core/` Rust crate before the v2 release. |
| 2 | Full action + thunk scheduler logic (Electron's `ActionScheduler`, `ThunkScheduler`, `ActionExecutor`, `ActionBatcher`) is ported into core during the extraction phase. Tauri v2 ships with full scheduler parity to Electron v3. |
| 3 | `packages/middleware/` is absorbed into `packages/core/src/middleware/`. Observability (telemetry, WebSocket export, MessagePack) becomes conditional features within the unified crate. |
| 4 | This document is authoritative for Phases 1–7 (the refactor itself). Long-term direction including post-refactor framework integrations lives in [ROADMAP.md](./ROADMAP.md). |
| 5 | NAPI binary package name: **`@zubridge/node-native`** (not `@zubridge/electron-native`) — reused by Path A consumers (Electrobun, Neutralino-shim, future Node-API runtimes). **Public** npm package using the standard napi-rs platform-optionalDependencies pattern. |
| 6 | UniFFI flow: **proc-macro** (`#[uniffi::export]` attributes), not UDL. Single source of truth in Rust; less drift during P2's interface churn. |
| 7 | WASM scaffolding **deferred pending research**. P1 does not add a `wasm` feature or wasm32 CI target. Code-hygiene practices (use `instant::Instant`, avoid hard tokio dependency outside feature-gated modules, keep `EventEmitter` sync) preserve future compatibility without enforcement. A WASM value-proposition research deliverable is scheduled during P5 — see [`docs/decisions/wasm-value-research.md`](./docs/decisions/wasm-value-research.md). Outcome of the research informs whether Path D (Blazor + Dioxus Web in ROADMAP.md) is pursued. |
| 8 | `EventEmitter` trait surface designed in P1 to support the three immediate integration paths (Tauri / NAPI / Direct Rust) — sync signature, generic string target, no async-runtime dependency in core. The sync-signature choice independently preserves future WASM compatibility (single-threaded; no `Send` requirement for WASM impls). |
| 9 | NAPI binding (P5) exposes **runtime-neutral primitives** — not Electron-shaped. IPC channel naming (`BATCH_DISPATCH`, etc.) lives in the runtime-specific TS wrapper, not in the binding. |
| 10 | Logging adapter exposes a **generic JS callback** — `(level, target, message, fields)`. Runtime-specific wrappers route to their preferred backend (`@zubridge/utils.debug()`, `tauri::log`, Bun's `console.log`, etc.). |

### Current state on `main` (verified)

| Package | Version | Language | Status |
|---------|---------|----------|--------|
| `packages/electron/` | 3.0.0 | TypeScript | Released. ~3,338 LOC across `action/` (642+79), `thunk/` (154+423 + sub-dirs), `main/` (198+154+469), `subscription/` (359), `deltas/` (178+144+20), `batching/` (407+84). Full priority scheduler, batching, deltas, middleware interface. |
| `packages/tauri-plugin/` | 0.1.1-next.1 | Rust | Unreleased. ~748 LOC: `core/{delta,subscription,thunk_manager,state_manager}.rs` + `commands/{dispatch,state,subscription,thunk}.rs`. **Registry-only thunk model, no scheduler.** Coupled to Tauri (uses `Emitter`, `AppHandle`). |
| `packages/tauri/` | 1.1.1-next.1 | TypeScript | Unreleased. Renderer architecture mirrors `packages/electron/`: `batching/`, `deltas/`, `renderer/{bridgeClient,actionValidator,subscriptionValidator,rendererThunkProcessor,invokeListeners}`, `thunk/`. |
| `packages/core/` | 1.x | TypeScript | Still the legacy debug-utility package. No Cargo.toml. Will be renamed to `packages/utils/`. |
| `packages/middleware/` | 0.1.0 | Rust | Standalone observability crate (tokio, tokio-tungstenite, rmp-serde). Not integrated. |
| `packages/types/` | 2.2.0 | TypeScript | Shared types: `Action`, `Thunk<S>`, `Dispatch<S>`, `StateManager<State>`, `BridgeStatus`. |

---

## 2. Phase Overview

| Phase | Title | Outputs |
|-------|-------|---------|
| **P1** | Carve out `zubridge-core` crate | New `packages/core/` Rust crate with `uniffi`/`napi`/`tauri` features; `packages/tauri-plugin/` re-consumes it; existing Tauri E2E green |
| **P2** | Port full action + thunk scheduler | Core gains `ActionScheduler`, `ThunkScheduler`, `ActionExecutor`, `ActionBatcher`; Tauri renderer exercises the new APIs |
| **P3** | Middleware absorption | `packages/middleware/` merged into `core::middleware`; conditional `telemetry`/`websocket`/`messagepack` features |
| **P4** | Tauri v2.0 release | `tauri-plugin-zubridge@0.2.0` + `@zubridge/tauri@2.0.0` published on unified core |
| **P5** | NAPI-RS bindings + Electron 3.1 prep | Core exposes `napi` facade; `@zubridge/node-native` ships platform `.node` artifacts |
| **P6** | Electron 3.1 migration | `packages/electron/src/{action,thunk,main,subscription,deltas,batching,middleware}` replaced with NAPI calls; renderer/preload TS unchanged |
| **P7** | Synchronized release | Concurrent Electron 3.1.0 + Tauri 2.x + core 0.2.0 release with migration guides |

P1–P4 are the critical path to **Tauri v2**. P5–P7 are the critical path to **Electron 3.1**. The refactor ends at P7. Additional framework integrations (Electrobun, Dioxus, Flutter, React Native, Ionic / Capacitor, Neutralino, and the deferred Blazor / Dioxus Web targets) are sequenced in [ROADMAP.md](./ROADMAP.md).

---

## 3. Phase Details

### P1 — Carve out `zubridge-core` Rust crate

**Goal:** Establish `packages/core/` as a standalone Rust crate housing platform-agnostic state-management logic. `packages/tauri-plugin/` becomes a thin Tauri-specific consumer.

**Steps:**

1. **Rename existing TS package.**
   - Move `packages/core/` → `packages/utils/`.
   - Update `package.json`: `"name": "@zubridge/core"` → `"@zubridge/utils"`.
   - Update all imports across the monorepo: `git grep -l '@zubridge/core'` — touches `packages/electron/src/middleware.ts`, `packages/tauri/src/index.ts`, and others.

2. **Create new `packages/core/` Rust crate** with crate name `zubridge-core`.
   - `Cargo.toml` features: `uniffi`, `napi`, `tauri` (gated optional dependencies). Default = empty. **No `wasm` feature** — that decision is deferred pending P5 research (see §1 decision 7).
   - **UniFFI flow: proc-macro, not UDL.** UniFFI 0.25+ supports `#[uniffi::export]` attributes on Rust items directly; UDL is being maintained but not preferred. Proc-macro keeps a single source of truth in the Rust source — important during P2 when interfaces churn heavily.
   - **Code hygiene for forward-compatibility** (not enforced via CI; documented in CONTRIBUTING.md):
     - Prefer `instant::Instant` over `std::time::Instant` — works identically natively, supports WASM if needed later
     - Keep `tokio` confined to feature-gated modules (`telemetry`, `websocket`); do not introduce hard tokio dependency in core paths
     - Keep `EventEmitter` trait sync (step 4) — no `async fn` in the trait
     - These choices independently improve Path A consumer builds (Electrobun running on Bun shouldn't need to compile `tokio-tungstenite` either). WASM-readiness is a side benefit, not the primary motivation.
   - Module layout:
     ```
     packages/core/
     ├── Cargo.toml
     ├── build.rs                  # napi-build only; uniffi proc-macro needs no build script
     ├── src/
     │   ├── lib.rs                # conditional re-exports per feature
     │   ├── models/               # ZubridgeAction, StateDelta, payloads (ex-tauri-plugin models)
     │   ├── state/                # StateManager trait, StateManagerHandle
     │   ├── subscription/         # SubscriptionManager
     │   ├── deltas/               # DeltaCalculator, DeltaResult
     │   ├── thunk/                # ThunkRegistry, StateUpdateTracker (P1) — scheduler arrives in P2
     │   ├── emit/                 # EventEmitter trait + default impls
     │   ├── middleware/           # placeholder module (P3 fills it)
     │   └── wrappers/
     │       ├── napi.rs           # NAPI-RS bindings (feature = "napi")
     │       ├── tauri.rs          # Tauri-specific EventEmitter impl + plugin glue (feature = "tauri")
     │       └── uniffi.rs         # UniFFI proc-macro re-exports (feature = "uniffi")
     └── tests/
         ├── feature_uniffi.rs
         ├── feature_napi.rs
         └── feature_tauri.rs
     ```

3. **Move logic from `packages/tauri-plugin/src/core/`** → `packages/core/src/`:
   | Source | Destination |
   |--------|-------------|
   | `tauri-plugin/src/core/delta.rs` | `core/src/deltas/calculator.rs` |
   | `tauri-plugin/src/core/subscription.rs` | `core/src/subscription/manager.rs` |
   | `tauri-plugin/src/core/thunk_manager.rs` | `core/src/thunk/registry.rs` (lifecycle registry only — full scheduler in P2) |
   | `tauri-plugin/src/core/state_manager.rs` | `core/src/state/handle.rs` |

4. **Abstract platform coupling — design `EventEmitter` for all three immediate integration paths.** Introduce `core::emit::EventEmitter` trait. The trait surface is spec'd in the P1 design doc and verified against the planned consumers (Tauri immediately; NAPI via P5; Direct Rust post-refactor):

   ```rust
   pub trait EventEmitter: Send + Sync {
       /// Emit `event` with `payload` to a runtime-defined `target` string.
       /// Target meaning per runtime: Tauri webview label, NAPI subscriber ID,
       /// or Dioxus channel name.
       fn emit(&self, target: &str, event: &str, payload: &serde_json::Value);
   }
   ```

   Sync signature; async dispatch happens inside implementations (e.g., NAPI's `ThreadsafeFunction.call`). Avoiding `async fn` in the trait keeps core out of any async-runtime dependency. The Tauri impl in `wrappers/tauri.rs` wraps `app.emit_to(...)`. Side benefit: the sync signature + generic string target also preserves compatibility with a future WASM target (single-threaded, no `Send` requirement) should the P5 research conclude Path D is justified.

5. **Extract `core::models`** from `packages/tauri-plugin/src/models.rs`: `ZubridgeAction`, `StateUpdatePayload`, `StateDelta`, `UpdateSource`, `ProcessResult`, all command payload/response structs (`DispatchActionArgs/Result`, `BatchDispatchArgs/Result`, `BatchFailure`, `GetStateArgs/Result`, `RegisterThunkArgs/Result`, `CompleteThunkArgs/Result`, `StateUpdateAckArgs`, `SubscribeArgs/Result`, `UnsubscribeArgs/Result`, `GetWindowSubscriptionsResult`).

6. **Update `packages/tauri-plugin/Cargo.toml`** to depend on `zubridge-core` with `features = ["tauri"]`. The plugin's `src/` shrinks to:
   - `lib.rs` (plugin registration, command wiring)
   - `commands/*.rs` (thin Tauri command wrappers around core)
   - `desktop.rs` (Tauri-specific `Zubridge<R>` struct holding the core handles, implementing `EventEmitter`)
   - `mobile.rs`, `error.rs` (unchanged)
   - `models.rs` becomes a re-export of `zubridge_core::models`

7. **CI:** add `cargo test -p zubridge-core --features <combo>` matrix — features `uniffi`, `napi`, `tauri`, default (none), and pairs `uniffi,napi`, `uniffi,tauri`. No WASM build target (deferred pending P5 research; see §1 decision 7).

**Critical files:**

- `packages/tauri-plugin/src/core/*.rs` (sources of extraction)
- `packages/tauri-plugin/src/models.rs` (types to relocate)
- `packages/tauri-plugin/src/desktop.rs` (consumer that wires it all; learn how `Zubridge<R>` orchestrates today)
- `packages/electron/src/main/dispatch.ts:1-154` (reference for Electron's main-side wiring; mirror in core)

**Verification:**

- `cargo build -p zubridge-core --features uniffi,napi,tauri` succeeds.
- `cargo test -p zubridge-core --features <each>` passes for every feature combo in the CI matrix.
- All `apps/tauri/**/test/specs/` E2E pass unchanged.
- `pnpm -r test:unit` green.
- `pnpm -r typecheck` green.

---

### P2 — Port full action + thunk scheduler to core

**Goal:** Bring Electron v3 scheduling parity into Rust: priority queue, concurrency control, thunk lifecycle scheduling, batching. The current `core/thunk/registry.rs` (ex-`tauri-plugin/src/core/thunk_manager.rs`) is upgraded from registry-only to full scheduler.

**Steps:**

1. **Port `packages/electron/src/action/ActionScheduler.ts` (642 LOC)** → `core::action::scheduler`:
   - Priority queue with deferred O(n log n) sort
   - Concurrency control: block non-immediate actions while thunks execute
   - Queue overflow handling (default cap 1000)
   - Events: `ACTION_ENQUEUED`, `ACTION_STARTED`, `ACTION_COMPLETED`, `ACTION_FAILED` (delivered via `core::emit::EventEmitter`)

2. **Port `packages/electron/src/action/ActionExecutor.ts` (79 LOC)** → `core::action::executor`:
   - Final execution stage; calls `state.process_action(action)`
   - Sets/clears thunk context during execution
   - Handles async results (`result.completion`)

3. **Port `packages/electron/src/thunk/ThunkManager.ts` (423 LOC) + `Thunk.ts` (154 LOC) + sub-dirs** (`lifecycle/`, `processing/`, `scheduling/`, `tracking/`, `registration/`, `shared/`) → `core::thunk::{manager, scheduler, lifecycle, tracking}`:
   - Replaces the registry-only model installed in P1
   - Forwards events: `THUNK_REGISTERED`, `THUNK_STARTED`, `THUNK_COMPLETED`, `THUNK_FAILED`, `ROOT_THUNK_CHANGED`, `ROOT_THUNK_COMPLETED`
   - Parent-child thunk relationships
   - Thunk state machine: `Pending` → `Executing` → `Completed`/`Failed`

4. **Port `packages/electron/src/main/actionQueue.ts` (198 LOC) + `main/mainThunkProcessor.ts` (469 LOC)** → `core::orchestration`:
   - Central queue orchestration
   - Routes thunk actions vs normal actions by `__thunkParentId`

5. **Port `packages/electron/src/batching/ActionBatcher.ts` (407 LOC) + `batching/types.ts` (84 LOC)** → `core::batching`:
   - Window-based batching (default `windowMs` = 16ms)
   - `maxBatchSize` (default 50), `priorityFlushThreshold` (default 80)
   - `BATCH_DISPATCH` / `BATCH_ACK` payload shapes preserved for IPC compatibility

6. **Reconcile partial implementations.** The `delta.rs` and `subscription.rs` already moved in P1 are a subset of what Electron has. During P2 we pick the best of both and unify on the Rust implementation:
   - `packages/electron/src/subscription/SubscriptionManager.ts:1-359`
   - `packages/electron/src/deltas/DeltaCalculator.ts:1-178` + `deltas/DeltaMerger.ts:1-144`

7. **Update `packages/tauri-plugin/` commands** to wrap the new scheduler. The renderer (`packages/tauri/src/renderer/`) tests stay green — same wire protocol, richer scheduling under the hood.

8. **Cross-platform action-id strategy:** unify on UUIDv4 generation in core. Document expectations for any TS callers that pre-assigned IDs.

**Critical files:**

- `packages/electron/src/action/ActionScheduler.ts:1-642`
- `packages/electron/src/action/ActionExecutor.ts:1-79`
- `packages/electron/src/thunk/ThunkManager.ts:1-423` + `packages/electron/src/thunk/Thunk.ts:1-154` + `packages/electron/src/thunk/{lifecycle,processing,scheduling,tracking,registration,shared}/**`
- `packages/electron/src/main/actionQueue.ts:1-198` + `packages/electron/src/main/mainThunkProcessor.ts:1-469` + `packages/electron/src/main/dispatch.ts:1-154`
- `packages/electron/src/batching/ActionBatcher.ts:1-407` + `packages/electron/src/batching/types.ts:1-84`
- `packages/electron/src/subscription/SubscriptionManager.ts:1-359`
- `packages/electron/src/deltas/DeltaCalculator.ts:1-178` + `packages/electron/src/deltas/DeltaMerger.ts:1-144`

**Verification:**

- `cargo test -p zubridge-core` covers scheduler edge cases: queue overflow, priority preemption, immediate-action bypass, thunk blocking, parent-child cascades.
- Property tests (e.g., via `proptest`) for `ActionScheduler` concurrency invariants.
- Tauri E2E exercises thunk priority + batching paths through the new scheduler.
- Scheduler throughput benchmark documented vs the TS reference — no regression target, parity required.

---

### P3 — Middleware absorption

**Goal:** Fold `packages/middleware/` into `packages/core/src/middleware/`. Observability features become conditional within the unified crate.

**Steps:**

1. **Move `packages/middleware/src/*` → `packages/core/src/middleware/`:**
   | Source | Destination | Feature gate |
   |--------|-------------|--------------|
   | `middleware.rs` | `middleware/traits.rs` | (always on) |
   | `metrics.rs` | `middleware/metrics.rs` | (always on) |
   | `transaction.rs` | `middleware/transaction.rs` | (always on) |
   | `telemetry.rs` | `middleware/telemetry.rs` | `telemetry` |
   | `websocket.rs` | `middleware/websocket.rs` | `websocket` |
   | `serialization.rs` | `middleware/serialization.rs` | `messagepack` |
   | `error.rs` | `middleware/error.rs` | (always on) |

2. **Wire middleware hooks** into scheduler / executor at three boundaries:
   - Action-dispatch (pre-execution)
   - State-update (post-execution)
   - Batch-received (in the batcher)

3. **TS interfaces stay stable.** `packages/electron/src/middleware.ts:1-40` continues to expose `ZubridgeMiddleware`; it will consume the NAPI binding in P6. No public TS API change in P3.

4. **Delete `packages/middleware/`** after `cargo build` + tests confirm parity at the new location.

5. **Clean optional-feature gating.** `telemetry` and `websocket` features depend on `tokio` / `tokio-tungstenite`; both stay strictly optional, gated with `#[cfg(feature = "<feature>")]`. This is required for clean Path A consumer builds (Electrobun on Bun shouldn't need to compile `tokio-tungstenite`). If the P5 WASM value-research concludes "go," these gates are already in the right place to add a `wasm` feature later.

6. **Document feature flags** in `packages/core/README.md`: `uniffi`, `napi`, `tauri`, `telemetry`, `websocket`, `messagepack`, plus valid combos.

**Critical files:**

- `packages/middleware/src/*.rs`
- `packages/middleware/Cargo.toml` (dependencies to merge into core's `Cargo.toml`)
- `packages/electron/src/middleware.ts:1-40` (TS consumer to preserve as-is)

**Verification:**

- `cargo build -p zubridge-core --features uniffi,napi,tauri,telemetry,websocket,messagepack` succeeds.
- `cargo build -p zubridge-core --features uniffi,napi,tauri` (no observability features) succeeds — confirms optional gating is clean.
- Existing middleware unit tests (in `packages/middleware/tests/` if any) pass at their new location.
- Smoke test: a logging middleware records every action through both Tauri (E2E) and a Rust unit test.

---

### P4 — Tauri v2.0 release

**Goal:** First public release on the unified core. Validates the multi-feature architecture in production before Electron migration begins.

**Steps:**

1. **Version bumps:**
   - `tauri-plugin-zubridge`: `0.1.1-next.1` → `0.2.0`
   - `@zubridge/tauri`: `1.1.1-next.1` → `2.0.0`
   - `zubridge-core`: → `0.1.0` (first publish)
2. **Update Tauri dep** in `packages/tauri-plugin/Cargo.toml` and `packages/core/Cargo.toml` from `2.0.0-beta` → `2.x` stable.
3. **CHANGELOG entries:**
   - `packages/tauri/CHANGELOG.md`: feature parity with Electron v3 (thunks, deltas, subscriptions, batching), migration from v1.
   - `packages/tauri-plugin/CHANGELOG.md`: 0.1 → 0.2 release notes; dependency on `zubridge-core`.
   - `packages/core/CHANGELOG.md` (new): initial 0.1.0 release notes.
4. **Publish flow:**
   - `cargo publish` for `zubridge-core` first.
   - `cargo publish` for `tauri-plugin-zubridge`.
   - `pnpm publish` for `@zubridge/tauri`.
5. **Update `ROADMAP.md`:** mark P1–P4 of the refactor complete in §1.1 (Tracks table); update §1.2 (Packages table) for the published versions.

**Critical files:**

- `packages/tauri/CHANGELOG.md`
- `packages/tauri-plugin/CHANGELOG.md`
- `packages/core/CHANGELOG.md` (new)
- `ROADMAP.md`

**Verification:**

- All `apps/tauri/**` E2E specs pass.
- `cargo publish --dry-run` succeeds for both Rust crates.
- `pnpm publish --dry-run` succeeds for `@zubridge/tauri`.
- Sample Tauri app outside the monorepo can install `@zubridge/tauri@2.0.0` + `tauri-plugin-zubridge@0.2.0` and run end-to-end.

---

### P5 — NAPI-RS bindings + Electron 3.1 prep

**Goal:** Expose the unified core to JavaScript runtimes via NAPI-RS so Electron (and other Path A consumers from ROADMAP.md) can consume it.

**Steps:**

1. **Enable `napi` feature** in `packages/core/Cargo.toml`: optional dependencies `napi`, `napi-derive`; build-dependency `napi-build`.

2. **Implement `packages/core/src/wrappers/napi.rs` exposing runtime-neutral primitives.** The NAPI surface is intentionally **not** Electron-shaped — it accepts:
   - `dispatch(action) -> Promise<DispatchResult>`
   - `getState() -> Value`
   - `subscribe(callback) -> SubscriptionId`
   - `registerThunk(args) -> ThunkId`
   - `completeThunk(args)`
   - `batchDispatch(actions) -> Promise<BatchResult>`
   - `setMiddleware(mw)`
   - `setEventEmitter(callback)` (registers the JS callback used by the `EventEmitter` trait impl for NAPI)

   IPC channel naming (`BATCH_DISPATCH`, `BATCH_ACK`, state-update event payload, etc.) is **not** part of the NAPI surface — that's wiring done in the runtime-specific wrapper (`packages/electron/` for Electron, `@zubridge/electrobun` post-P7 for Electrobun, `@zubridge/neutralino` post-P7 for the Neutralino-shim). The same binding must remain consumable from any Node-API-compatible runtime by writing a different wrapper, never modifying the binding. Generated `.d.ts` from napi-rs documents the surface.

3. **Create `packages/node-native/`** — the platform-specific binary package, **public on npm**.
   - Standard napi-rs packaging pattern: `@zubridge/node-native` as the dispatcher with platform optional dependencies:
     - `@zubridge/node-native-darwin-x64`
     - `@zubridge/node-native-darwin-arm64`
     - `@zubridge/node-native-linux-x64-gnu`
     - `@zubridge/node-native-linux-arm64-gnu`
     - `@zubridge/node-native-win32-x64-msvc`
     - `@zubridge/node-native-win32-arm64-msvc`

4. **GitHub Actions matrix** builds the `.node` artifacts on each target, uploads to releases, and publishes via changesets / release-please.

5. **Dual-runtime smoke test:** standalone script in `apps/standalone-node/` imports `@zubridge/node-native`, dispatches an action, receives a state update — independent of any Electron app. **Runs under both Node.js ≥ 20 and Bun (current stable)** via separate npm scripts (`pnpm smoke:node` / `pnpm smoke:bun`). Any NAPI feature gaps observed under Bun are documented in [`docs/decisions/electrobun-spike.md`](./docs/decisions/electrobun-spike.md) as the audit deliverable — saving a separate audit task.

6. **WASM value-proposition research.** Concurrent with the Bun audit (similar "investigate-and-document" category; ideally same owner). ~1–2 days. Investigates:
   - Blazor's three runtime modes (WebAssembly / Server / Hybrid) — does any align with Zubridge's multi-process state value? Hybrid uses native shell, not WASM — does that change the integration path?
   - Dioxus Web demand vs. Dioxus Desktop + Mobile — is there evidence of multi-window/multi-tab demand from Dioxus users?
   - Browser-only multi-tab state sync (via SharedWorker / BroadcastChannel) — is this a real Zubridge use case?
   - Survey of other browser-resident frameworks (Solid, Svelte, etc.) — do any have cross-tab state needs Zubridge addresses?

   Output: [`docs/decisions/wasm-value-research.md`](./docs/decisions/wasm-value-research.md) with **go/no-go** recommendation for Path D and rationale. Influences ROADMAP "Deferred pending research" section: a "go" outcome promotes Blazor + Dioxus Web back into the post-refactor framework integration plan; "no-go" deprecates them.

**Critical files:**

- `packages/core/src/wrappers/napi.rs` (new)
- `packages/node-native/` (new package)
- `apps/standalone-node/` (new — dual-runtime smoke + Bun audit fixture)
- `docs/decisions/electrobun-spike.md` (audit deliverable)
- `docs/decisions/wasm-value-research.md` (research deliverable)
- `.github/workflows/` (extend with binary build matrix)

**Verification:**

- `napi build --release` produces `.node` artifacts on every triple.
- Node smoke test (`pnpm smoke:node`) dispatches and receives an update.
- Bun smoke test (`pnpm smoke:bun`) dispatches and receives an update — OR `docs/decisions/electrobun-spike.md` documents specific NAPI gaps preventing success, with remediation cost estimate.
- TypeScript declarations from napi-rs document the runtime-neutral primitive surface; reviewed for absence of Electron-specific assumptions.
- `docs/decisions/wasm-value-research.md` exists with a go/no-go recommendation for Path D; ROADMAP "Deferred pending research" section updated based on the outcome.

---

### P6 — Electron 3.1 migration

**Goal:** Replace `packages/electron/src/main/*` and related modules with calls into the NAPI-bound core. Public renderer/preload API unchanged for end-users.

**Inventory:**

| Module | Migrates to NAPI? |
|--------|-------------------|
| `packages/electron/src/action/*` | **Yes** — calls into `@zubridge/node-native` |
| `packages/electron/src/thunk/*` | **Yes** — into native |
| `packages/electron/src/main/*` | **Thin TS glue** wrapping NAPI for `ipcMain.handle` |
| `packages/electron/src/subscription/*` | **Yes** — into native |
| `packages/electron/src/deltas/*` | **Yes** — except renderer-side `DeltaMerger.ts` stays TS (same approach as Tauri) |
| `packages/electron/src/batching/*` | **Yes** — into native |
| `packages/electron/src/middleware.ts` | **Rewired** to bind to NAPI middleware trait |
| `packages/electron/src/renderer/*` | **No** — stays TS (user-facing) |
| `packages/electron/src/preload/*` | **No** — stays TS (security boundary, sandbox-aware) |
| `packages/electron/src/adapters/*` | **No** — stays TS (Redux/Zustand patterns at user-API edge) |
| `packages/electron/src/registry/stateManagerRegistry.ts` | **No** — singleton at user API edge; could move later |
| `packages/electron/src/types/*` | **No** — TS types stay TS |
| `packages/electron/src/runtime-helpers/*` | **No** — Electron-specific lifecycle helpers |
| `packages/electron/src/index.ts`, `main.ts`, `renderer.ts`, `preload.ts` | **No** — public entry points |

**Steps:**

1. Replace the migrated modules' implementations with NAPI calls. The TS shape of internal exports is allowed to change (these are not public), but the public API (`index.ts`, `main.ts`, `renderer.ts`, `preload.ts`) must remain identical.

2. **Preserve IPC channel parity** in the Electron-specific wrapper. Channel names and payload shapes (`BATCH_DISPATCH`, `BATCH_ACK`, state-update event payload, etc.) must remain unchanged so renderer/preload TS continues to function. The NAPI binding exposes only runtime-neutral primitives (see P5 step 2); the Electron-specific TS shim in `packages/electron/src/main/` is responsible for wiring those primitives to `ipcMain.handle` / `WebContents.send` with the existing channel names.

3. **Delete duplicated TS implementation** once the NAPI-backed path is green on E2E.

4. **Run the full E2E matrix.** All apps in `apps/electron/`:
   - `minimal-zustand-basic`
   - `minimal-zustand-handlers`
   - `minimal-zustand-reducers`
   - `minimal-zustand-immer`
   - `minimal-redux`
   - `minimal-custom`
   - `minimal-sandbox-true`

5. Watch for behavioural drift around: thunk priority ordering across windows, batch timing windows, delta consistency under high frequency.

**Critical files:**

- `packages/electron/src/{action,thunk,main,subscription,deltas,batching}/**` — to replace
- `packages/electron/src/middleware.ts:1-40` — to rewire (keep external interface)
- `apps/electron/minimal-*/test/specs/**` — verification suite

**Verification:**

- All `apps/electron/minimal-*` E2E specs pass without modification.
- Performance benchmarks (dispatch throughput, batch latency, multi-window sync) — no regression vs v3.0.
- Bundle size of `@zubridge/electron` shrinks (TS implementation removed); native package size documented separately.
- No public API change required for users upgrading from 3.0 → 3.1.

---

### P7 — Synchronized release

**Goal:** Coordinate Electron 3.1, Tauri 2.x (if changed since P4), and core releases. Align versioning narrative across packages.

**Steps:**

1. **Versioning:**
   - `zubridge-core` → 0.2.0 (post-NAPI maturation)
   - `@zubridge/node-native` → 0.1.0 (first release) + platform packages
   - `@zubridge/electron` → 3.1.0
   - `@zubridge/tauri` → 2.1.0 (if changed since v2) or stays at 2.0
   - `tauri-plugin-zubridge` → 0.3.0 (if API changed) or stays at 0.2

2. **Release stage plan** (sequential to avoid resolution races):
   1. `zubridge-core` (`cargo publish`)
   2. `tauri-plugin-zubridge` (`cargo publish`, if changed)
   3. `@zubridge/node-native` platform packages, then dispatcher (`pnpm publish` via napi-rs flow)
   4. `@zubridge/electron`, `@zubridge/tauri` (`pnpm publish`)

3. **Migration guides:**
   - `docs/migration/electron-v3-to-v3.1.md` (zero public-API breaking changes; native binary install notes)
   - `docs/migration/tauri-v1-to-v2.md` (already drafted in P4; finalize)

4. **Roadmap update:** mark refactor complete in `ROADMAP.md`; unlock the next-tier framework integrations queued there.

**Verification:**

- `pnpm changeset publish --dry-run` (or release-please equivalent) lists expected releases.
- All package READMEs reflect new versions and reference this plan.
- Docs site (if any) regenerated.

---

## 4. Cross-Phase Concerns

### Backward compatibility

- **Electron public API: zero breaking changes.** `createDispatch`, `useZubridgeStore`, `createBridge`, and the action/thunk/dispatch shapes stay identical. Internal main-process implementation is what's replaced.
- **Tauri public API:** breaking from v1 → v2 is acceptable per the version bump. The Phase 2-3 commit (#152) already aligns the wire shape with Electron v3.

### Testing strategy

**Rust unit tests** — `#[cfg(test)] mod tests` in each `core::*` module. Coverage focuses on:

- `core::action::scheduler`: priority ordering, queue overflow at cap, immediate-action bypass, thunk-blocking semantics
- `core::thunk::manager`: lifecycle transitions, parent-child cascades, root-thunk events
- `core::batching::batcher`: window timing, max-batch enforcement, priority flush threshold
- `core::deltas::calculator`: full-state vs delta vs unchanged outcomes, baseline reset on shape change
- `core::subscription::manager`: default-all behaviour, key filtering, label scoping
- `core::middleware`: trait dispatch ordering, error propagation

**Property / fuzz tests** — `proptest` for ActionScheduler concurrency invariants:

- For any sequence of `enqueue`/`dequeue` operations, priority ordering holds
- For any thunk lifecycle, no action is dispatched while a blocking thunk is `Executing`
- Queue size never exceeds the configured cap

**TS unit-test fate** — `packages/electron/`'s vitest tests for `ActionScheduler`, `ThunkManager`, `ActionBatcher`, `DeltaCalculator`, `SubscriptionManager` encode subtle behaviour. Strategy:

- During P2, port each assertion to a Rust unit test in `core::*`. The Rust version is the new source of truth.
- After P6, keep the TS-side tests that exercise the **IPC/glue layer** (validators, preload listeners, renderer-side merger). Delete the tests that duplicated logic now in core.
- Audit per-file during P6 to confirm intent before deletion.

**Cross-platform parity layer** — introduce `tests/scenarios/` at the repo root containing platform-agnostic scenario descriptors (action sequences + expected state). Both `apps/electron/minimal-*` and `apps/tauri/minimal-*` E2E suites consume the same scenarios so a single test divergence catches drift between platforms.

**Native artifact platform smoke tests** — each `.node` triple built in P5 gets a smoke test on its native CI runner (GitHub Actions matrix: `macos-13`, `macos-14`, `ubuntu-22.04`, `ubuntu-22.04-arm`, `windows-2022`, `windows-11-arm`). The smoke test imports the binding, dispatches a sample action, and asserts the returned state.

**Stress / long-running tests** — a soak harness (`tests/stress/`) that:

- Dispatches 100k actions across multiple windows and asserts `process.memoryUsage().heapUsed` does not grow beyond a threshold (e.g., 2x baseline after warmup)
- Runs for 30+ minutes in a nightly CI job (not on every PR)
- Targets known leak surfaces: NAPI handle scope, Tauri event subscriptions, thunk registry entries

**Performance benchmarking infrastructure** — concrete tooling:

- `criterion` for Rust microbenchmarks of scheduler/batcher/delta hot paths
- `vitest bench` for end-to-end TS-side benchmarks (dispatch latency, batch throughput)
- Baseline metrics captured pre-P6 in a checked-in `benches/baseline.json`
- CI regression gate: >10% slowdown on any tracked metric fails the build (threshold tunable per metric)
- Nightly job pushes metrics to a long-running history (TBD: artifact upload, no external service required for v1)

**Middleware behavioural tests** (P3) — beyond the feature-flag build matrix, validate behaviour:

- A logging middleware records every action dispatched through Tauri (E2E) and through a Rust unit test
- A telemetry middleware (gated `telemetry` feature) emits expected payloads to a mock WebSocket
- A blocking middleware in `processAction` correctly delays scheduling

**Integration tests** — `packages/core/tests/` validates feature-flag combinations:

- `feature_uniffi.rs`, `feature_napi.rs`, `feature_tauri.rs` (compile + minimal use)
- `feature_combos.rs` for combinations: `[]`, `[uniffi,napi]`, `[uniffi,tauri]`, `[napi,telemetry,websocket]`, `[tauri,telemetry,messagepack]`

### CI infrastructure

- Rust toolchain added to all CI jobs.
- `cargo fmt --check`, `cargo clippy -- -D warnings`, `cargo test --features <combo>` matrix.
- Cache `target/` per feature combination (sccache or `Swatinem/rust-cache`).
- Binary build matrix (P5) produces and publishes `.node` artifacts on every PR (artifact upload) and on release (npm publish).
- Nightly soak/perf job runs stress + benchmark suites.

### Rollback strategy

- Each phase is independently releasable. If P5 NAPI bindings hit a blocker, Tauri v2 (P4) still ships.
- Electron 3.0 remains the supported stable release until 3.1 is validated.
- During early P6, keep the original TS implementation alongside the NAPI-backed path behind a feature flag if needed; remove only once E2E is green.

---

## 5. Documentation Deliverables

Documentation is treated as a phase output, not a follow-up. Each phase that ships a release must include the docs updates listed below before the publish step in its Verification section is considered satisfied.

### Per-package READMEs

| Package | Update trigger | What changes |
|---------|----------------|--------------|
| `packages/core/README.md` (new) | P1 | Architecture overview, conditional compilation explanation, build instructions per feature, module map, testing instructions |
| `packages/tauri-plugin/README.md` | P1 (dep on core), P4 (release) | Updated install + usage for 0.2 API; reference to `zubridge-core` as backend |
| `packages/tauri/README.md` | P4 | v2 API (current README is for v1); migration callout from v1 |
| `packages/electron/README.md` | P6 | Notes on native binary install, troubleshooting, what's new in 3.1 |
| `packages/node-native/README.md` (new) | P5 | Platform package list, install/troubleshooting, supported triples, build-from-source instructions |
| Top-level `README.md` | P4 (after first unified release) | Updated architecture diagram showing core + platform wrappers; package list |

### Architecture documentation

- **`docs/architecture/overview.md`** (new) — produced in P1, refined through P6:
  - Process models for Electron (main + renderer + preload) and Tauri (main + webview)
  - Where the core/platform boundary sits per target
  - Conditional compilation matrix (which features are valid together)
  - Extension points for future framework targets (described in ROADMAP.md)
- **`docs/architecture/wire-protocol.md`** (new) — produced in P1:
  - Commands (get_state, dispatch_action, batch_dispatch, register_thunk, complete_thunk, subscribe, unsubscribe, state_update_ack)
  - Event shapes (state-update payload, action/thunk lifecycle events)
  - Sequence numbers + acknowledgement protocol
- **`docs/architecture/middleware.md`** (new) — produced in P3:
  - Middleware trait API
  - Where hooks fire (pre-dispatch, post-execution, batch-received)
  - Cross-platform authoring (writing once for Rust, exposing to TS via NAPI)

### Authoring guides

- **`docs/guides/state-manager.md`** — implementing the Rust `StateManager` trait. Currently scattered in `packages/tauri-plugin/README.md`; consolidate and update for the core trait location (P1).
- **`docs/guides/custom-middleware.md`** — writing a middleware that works across Electron + Tauri (P3 deliverable).
- **`docs/guides/custom-bridge.md`** — already partially documented for Electron; expand to cover Tauri-equivalent low-level use (P4).

### API reference regeneration

- **`packages/electron/docs/api-reference.md`** currently hand-written. Strategy decision: **keep hand-written** for the public TS API (which doesn't change), but **add auto-generated rustdoc** for the Rust core. Publish rustdoc to GitHub Pages from `cargo doc --features uniffi,napi,tauri --no-deps`.
- Add `pnpm typedoc` step for TS-side reference of the public API surface. Output goes to the same docs site.

### Migration guides

| Guide | Phase | Audience |
|-------|-------|----------|
| `docs/migration/tauri-v1-to-v2.md` | P4 | Tauri users upgrading from v1 |
| `docs/migration/electron-v3-to-v3.1.md` | P7 | Electron users (zero public-API break; native binary install notes) |
| `docs/migration/middleware-authors.md` | P3 | Authors of any middleware against the old `@zubridge/middleware` crate moving to `zubridge-core::middleware` |
| `docs/migration/custom-bridge-users.md` | P6 | Users of low-level `createBridge` API who may need IPC channel awareness |

### Contributing & dev workflow

- **`CONTRIBUTING.md`** — full rewrite as part of P1:
  - Rust toolchain version (MSRV pinned per §7)
  - `napi-rs` CLI install
  - Local dev workflow: rebuilding the native module, watch mode, `pnpm dev`
  - Debugging Rust from a JS stack trace (source-mapping limitations)
  - Running cross-platform tests locally vs in CI
- **`docs/release-process.md`** (new) — produced in P4, refined in P7:
  - Stage order (core → tauri-plugin → node-native → platform packages)
  - Dry-run commands
  - Rollback procedure

### Example apps

- `apps/electron/minimal-*/README.md` updated for 3.1 with native binary callouts (P6).
- `apps/tauri/minimal-*/README.md` updated for v2 API (P4).
- New `apps/standalone-node/` (optional, P5 verification) demonstrating `@zubridge/node-native` usage without Electron — useful for benchmarking and as a smoke fixture for downstream NAPI consumers (see ROADMAP.md).

---

## 6. Type Generation, Error Handling, Debug Logging

### Type generation strategy

`packages/types/` currently hand-authors the canonical TS types (`Action`, `Thunk<S>`, `Dispatch<S>`, `StateManager<State>`, `BridgeStatus`). After P5, the Rust source becomes authoritative for many of these.

**Strategy: hybrid.**

- `napi-rs` already auto-generates `.d.ts` for the `@zubridge/node-native` binding. Treat that as the source of truth for the NAPI surface.
- `@zubridge/types` remains hand-written for user-facing types (`Action<T>`, `Thunk<S>`, `Reducer`, `Handlers`) — these are part of the public API and have generic shapes that don't translate cleanly from Rust.
- Add a CI check (`tools/audit-types.ts`) that compares the shapes in `@zubridge/types` against the napi-generated `.d.ts` for fields that exist in both, failing if they drift.
- For Tauri renderer (`packages/tauri/src/types/`), import from `@zubridge/types` where possible; commands are typed inline against the wire schema.

### Error handling

Rust has a typed `Error` enum (per `packages/tauri-plugin/src/error.rs`). NAPI marshals it to a JS `Error` with `message` populated, but loses the enum discriminant.

**Strategy:**

- Define `core::error::ZubridgeError` (new) with explicit variants: `ActionProcessing`, `QueueOverflow`, `Subscription`, `ThunkRegistration`, `ThunkNotFound`, `StateManagerMissing`, `Serialization`, `Internal`.
- Each variant gets a `code` string (e.g., `"ZB_QUEUE_OVERFLOW"`) serialized into the JS error via NAPI custom error type.
- TS-side helper `isZubridgeError(err)` + `getCode(err)` for callers needing to branch on variant.
- Document error codes in `docs/architecture/errors.md`.
- Preserve compatibility: Electron 3.0 users currently catch generic `Error` with message-based logic; keep messages stable across 3.0 → 3.1 for the migration window.

### Debug logging integration

Rust core uses `log` + `tracing` crates. JS-side wrappers route records to their preferred backend. The binding stays runtime-neutral so Path A consumers (Electron, Electrobun, Neutralino-shim, future Node-API runtimes) can each choose where logs land.

**Strategy:**

- Rust core emits via `log::debug!` / `tracing::debug!` macros throughout.
- Subscriber adapter `core::logging::JsBridge` forwards Rust log records to a **generic JS callback** with shape `(level: number, target: string, message: string, fields: object) => void`. The binding does **not** know about `@zubridge/utils`, `tauri::log`, or any specific log backend.
- Each runtime-specific wrapper picks its routing:
  - `@zubridge/electron` → `@zubridge/utils`' `debug()` (WDIO logger / weald / console)
  - `tauri-plugin-zubridge` → `tauri::log` plugin
  - `@zubridge/electrobun` (post-P7) → Bun's `console.log`
  - `@zubridge/neutralino` (post-P7) → Neutralino's logging API
- Filtering: `RUST_LOG` env var controls Rust-side filtering; each wrapper applies its own filter on the JS side after the callback fires.
- Document the callback contract + per-runtime routing examples in `docs/architecture/logging.md` (P3).

---

## 7. Versioning and Housekeeping

### Minimum Supported Rust Version (MSRV)

- `packages/tauri-plugin/Cargo.toml` currently pins `rust-version = "1.70"`.
- New `packages/core/Cargo.toml` pins **MSRV = 1.75** to allow `async fn in traits` for middleware (stable since 1.75).
- Document MSRV in `packages/core/README.md` and `CONTRIBUTING.md`.
- CI tests against MSRV + stable; bump MSRV requires a minor version bump.

### Dependency version pinning

| Dependency | Pinned to | Rationale |
|------------|-----------|-----------|
| `tauri` | `2.x` stable (specific version chosen at P4 cut) | Move off `2.0.0-beta` for v2 release |
| `napi`, `napi-derive` | `2.x` | Current stable major; revisit at P5 |
| `napi-build` | `2.x` | Matches above |
| `uniffi` | `0.28+` | Per 2025-10-05 spec |
| `serde`, `serde_json` | `1.x` | Stable; minor updates auto-allowed |
| `tokio` | `1.x` (only with `telemetry`/`websocket` features) | Avoid forcing tokio into Tauri builds that don't need it |
| `tokio-tungstenite` | `0.20+` | From middleware crate |
| `rmp-serde` | `1.x` (only with `messagepack` feature) | Optional |

### Zubridge-core 1.0 milestone

`zubridge-core` enters at `0.1.0`. Criteria for `1.0`:

- Used by **shipped stable** Electron 3.1+ AND Tauri 2.x AND **at least one Path-A or Path-B framework integration** (per [ROADMAP.md](./ROADMAP.md) — e.g., Electrobun on Path A, or Dioxus on Path B), with that integration stable for **≥ 3 months without core API breakage**.
- No breaking API changes for two consecutive minor versions.
- All public types documented; rustdoc passes `#![warn(missing_docs)]`.
- Performance benchmarks established and stable across two release cycles.
- Document in `packages/core/CHANGELOG.md` as a tracked milestone.

Rationale: validating the API against a second runtime model (beyond Electron + Tauri) before committing to 1.0 prevents a forced 2.0 when post-refactor integrations discover gaps. The cost is roughly 6–9 months of additional 0.x evolution; the cost of a forced 2.0 in year two is higher.

### Feature-flag combo matrix (explicit)

CI runs `cargo test --features "<combo>"` for each row:

| Combo | Reason |
|-------|--------|
| `""` (default, no features) | Pure core compiles cleanly |
| `uniffi` | Single-target compile |
| `napi` | Single-target compile |
| `tauri` | Single-target compile |
| `uniffi,napi` | Multi-target: mobile + Electron |
| `uniffi,tauri` | Multi-target: mobile + Tauri |
| `napi,tauri` | Multi-target: Electron + Tauri |
| `uniffi,napi,tauri` | All current targets |
| `tauri,telemetry,websocket` | Tauri with observability |
| `napi,telemetry,websocket,messagepack` | Electron with full observability |

No `wasm` feature or target — deferred pending P5 research (see §1 decision 7).

### Renderer-side shared package (considered, not committed)

After PR #152, `packages/electron/src/renderer/`, `packages/electron/src/batching/`, `packages/electron/src/deltas/` (merger), `packages/electron/src/thunk/` mirror their `packages/tauri/src/` counterparts. There is duplication.

**Option:** extract `@zubridge/renderer-shared` (TS) containing the platform-agnostic renderer logic; each platform package layers on the IPC primitives (`ipcRenderer` vs `invoke`/`listen`).

**Decision: defer to post-P7.** Risk during the Electron migration is too high; better to land the Rust core first, then dedupe the TS renderer in a follow-up minor release. Tracked here so it isn't forgotten.

### Branch and spec cleanup

- During P1: audit existing `feat/*` branches (`feat/tauri-v2.x`, `feat/renderer-thunks`, `feat/deltas-3`, `feat/electron-batching`, `feat/tauri`, `feat/deltas`, `feat/deltas-2`, `feat/zubridge-core-rust-crate`, etc.) for unmerged work. Cherry-pick relevant commits; delete obsolete branches.

---

## 8. Open Execution-Time Questions

1. **`runtime-helpers/` future.** Electron lifecycle helpers — currently planned to stay TS in P6. Revisit after P7 if downstream Neutralino/Electrobun integrations would benefit from sharing this code.
2. **State of `feat/*` branches.** Several branches may contain useful WIP. Audit at P1 start; cherry-pick anything still relevant.
3. **Perf metrics history.** Nightly perf job needs a destination — artifact upload to GitHub Releases vs a third-party service. Decide in P5.
4. **Renderer-side shared package.** Whether and when to extract `@zubridge/renderer-shared` (see §7). Deferred to post-P7 by default.

---

## 9. References

- Tracking issue: [#104 — Create UniFFI Multi-Target Core Package](https://github.com/goosewobbler/zubridge/issues/104)
- Long-term direction including post-refactor framework integrations: [ROADMAP.md](./ROADMAP.md)
- Support and lifecycle policy: [SUPPORT.md](./SUPPORT.md)
- Product positioning: [docs/product.md](./docs/product.md)
- Tauri renderer + plugin alignment PR: [#152 (commit `62a38f33`)](https://github.com/goosewobbler/zubridge/pull/152)
