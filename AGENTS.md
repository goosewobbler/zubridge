# AGENTS.md

AI context file for the Zubridge monorepo.

## Project Overview

Zubridge is a cross-platform state management library that brings Zustand-inspired simplicity to desktop applications. It solves the challenge of managing state across process boundaries in Electron and Tauri apps by providing a single-store workflow that abstracts IPC management and state synchronisation.

**Key Value Proposition:**
- Seamlessly interact with backend state from frontend processes using Zustand-like hooks
- Automatic state synchronisation across multiple windows
- Type-safe state management across process boundaries
- Framework-agnostic backend contract supporting custom state providers

**Shipped Adapters:**
- **Electron** — `@zubridge/electron` (v3.x, stable)
- **Tauri v2** — `@zubridge/tauri` (v1.x, in active refactor via P4)
- **Tauri v1** — `@zubridge/tauri` (maintenance only)

**Planned Integrations:** Electrobun, Dioxus, Flutter, React Native, Ionic/Capacitor. See [ROADMAP.md](./ROADMAP.md) for details.

## Tech Stack

| Category | Technology |
|----------|------------|
| Language | TypeScript 5.9+ (strict mode, ESM) |
| Runtime | Node.js ≥ 24 |
| Package Manager | pnpm 10.8.1+ |
| Monorepo | Turborepo 2.8+ with pnpm workspaces |
| Testing | Vitest 4.1+ (unit), WebdriverIO 9.4+ (E2E) |
| Linting/Formatting | Biome 2.4+ |
| Bundling | Rollup 4 (electron), tsdown (other packages) |
| Rust | tauri-plugin-zubridge, zubridge-core (P1 refactor) |

## Monorepo Structure

```
packages/
├── core/              # zubridge-core — Unified Rust crate (P1 refactor; platform-agnostic state primitives)
├── electron/          # @zubridge/electron — Electron adapter (main, renderer, preload)
├── tauri/             # @zubridge/tauri — Tauri adapter (v1 + v2)
├── tauri-plugin/      # tauri-plugin-zubridge — Rust-side Tauri plugin (being absorbed into core)
├── types/             # @zubridge/types — Shared TypeScript type definitions
├── utils/             # @zubridge/utils — Debug system and shared utilities
├── ui/                # @zubridge/ui — Reusable React UI components for examples/tests
└── apps-shared/       # @zubridge/apps-shared — Shared logic for example apps (private)

apps/
├── electron/
│   ├── e2e/                         # Electron E2E test application (multi-pattern)
│   ├── minimal-zustand-basic/       # Simple Zustand store example
│   ├── minimal-zustand-handlers/    # Zustand with handler pattern
│   ├── minimal-zustand-reducers/    # Zustand with Redux-style reducers
│   ├── minimal-zustand-immer/       # Zustand with immer
│   ├── minimal-redux/               # Redux + Redux Toolkit integration
│   ├── minimal-custom/              # Custom state manager via createCoreBridge
│   ├── minimal-sandbox-true/        # Sandbox-enabled security variant
│   └── minimal-context-isolation-false/  # Context isolation disabled variant
├── tauri/
│   └── e2e/                         # Tauri v2 E2E test application
└── tauri-v1/
    └── e2e/                         # Tauri v1 compatibility test application

e2e/                   # WebdriverIO E2E test suites + wdio.conf.ts
docs/                  # Architecture docs, decisions, roadmap detail, evaluations
scripts/               # Maintenance scripts (update-releasekit, etc.)
spikes/                # Feasibility spikes for planned integrations
```

## Electron Package Architecture

The Electron adapter splits across three entry points with distinct responsibilities:

```
packages/electron/src/
├── main.ts            # Main process — bridge setup, IPC handlers, store subscription
├── preload.ts         # Preload — exposes typed API via contextBridge
├── renderer.ts        # Renderer — Zustand hooks for consuming state
├── action/            # Action dispatch helpers
├── adapters/          # Zustand + Redux store adapters
├── batching/          # ActionBatcher — groups renderer actions into single IPC calls
├── bridge/            # Core bridge logic
├── deltas/            # Delta state computation — sends only changed state
├── errors/            # Error types
├── main/              # Main-process internals (actionQueue, dispatch, mainThunkProcessor)
├── registry/          # State manager registry and lifecycle management
├── subscription/      # SubscriptionManager — state change subscriptions
├── thunk/             # Thunk system (lifecycle, processing, registration, scheduling, tracking)
├── types/             # Internal TypeScript types
└── utils/             # Shared utilities
```

**Important:** The `ActionBatcher` flush logic is complex and uses a dual-guard pattern — take care when modifying `packages/electron/src/batching/`.

## Coding Standards

### TypeScript
- Strict mode enabled across all packages
- ESM everywhere (`"type": "module"` in all package.json)
- Prefer `undefined` over `null`
- Avoid `any` — use `warn` level is configured; treat it as a forcing function
- All public packages ship dual ESM + CJS (`.js` / `.cjs`) with `.d.ts` + `.d.cts`

### Code Style (Biome)
- 2-space indentation
- Single quotes for strings
- Trailing commas always
- Semicolons always
- Max line width: 100 characters
- Strict rules: `noUnusedVariables`, `noImplicitBoolean`, `noParameterAssign`, `noNonNullAssertion` (all error level)

### Comments
- Default to writing no comments. Add one only when the **why** is non-obvious — a hidden constraint, a subtle invariant, a workaround for a specific bug, behaviour that would surprise a reader.
- Don't restate what the code already says — a good name removes the need for prose.
- Don't cite transient details like specific version numbers or old stack traces. Keep the rationale, drop the citation.
- **Do** link load-bearing tracking refs — an issue or PR whose resolution removes or rewrites the commented code. These are active signals to update, not drift.
- JSDoc for public APIs only when necessary.

## Testing

### Test Organisation
```
packages/<name>/
└── test/
    ├── *.spec.ts          # Unit tests
    └── integration/
        └── *.spec.ts      # Integration tests (where applicable)

e2e/
└── *.spec.ts              # WebdriverIO E2E test suites
```

### Running Tests
```bash
pnpm test                                 # All tests (unit + E2E)
pnpm test:unit                            # Unit tests only (requires build:packages)
pnpm test:e2e                             # All E2E tests (Electron only — see note below)
pnpm test:e2e:electron-zustand-basic      # Single Electron variant
```

> **Note:** `pnpm test:e2e:tauri-basic` runs the real Tauri v2 E2E suite in `apps/tauri/e2e`
> (via `pnpm --filter tauri-e2e test:e2e:tauri`) — the same command CI uses. Build the app first
> (`pnpm build:tauri`). The default `pnpm test:e2e` aggregate is Electron-only by design during the
> P4 refactor; Tauri E2E is run through its dedicated command and in CI. `pnpm test:e2e:tauri-v1-basic`
> is an honest no-op — Tauri v1 is maintenance-only and has no E2E suite.

### E2E Test Notes
- E2E tests require built apps — run `pnpm build:electron-<variant>` / `pnpm build:tauri` first
- Binary paths are auto-discovered per platform (macOS arm64/x86_64, Windows, Linux)
- Set `DEBUG=zubridge:*` for verbose IPC logging during E2E runs
- Electron E2E uses `wdio.conf.ts` in `e2e/`; Tauri E2E is configured per app

## Build Commands

```bash
pnpm build               # Build all packages
pnpm build:packages      # Build core packages only (types → utils → electron/tauri/ui)
pnpm lint                # Run Biome linter
pnpm format              # Format all files with Biome
pnpm check               # Biome lint + format check
pnpm check:fix           # Fix lint and format issues
pnpm typecheck           # TypeScript validation across all packages
```

## Key Documentation

| File | Purpose |
|------|---------|
| [README.md](./README.md) | Project overview and quick start |
| [ROADMAP.md](./ROADMAP.md) | Framework support roadmap with P1–P7 refactor phases |
| [SUPPORT.md](./SUPPORT.md) | Lifecycle policy and compatibility matrix |
| [docs/developer.md](./docs/developer.md) | Repository structure, architecture, thunk manager design |
| [docs/product.md](./docs/product.md) | Product positioning and use cases |
| [docs/decisions/](./docs/decisions/) | Technical decision gates and feasibility spike plans |
| [UNIFFI_REFACTOR_PLAN.md](./UNIFFI_REFACTOR_PLAN.md) | Unified Rust core refactor plan (P1–P7) |

## Active Development Context

The **Unified Rust Core Refactor** (P1–P7) is in progress. Key phases:

| Phase | Status | Goal |
|-------|--------|------|
| P1 | In progress | Extract `zubridge-core` Rust crate from tauri-plugin |
| P2 | Planned | Port action/thunk scheduler from TypeScript to Rust |
| P3 | Planned | Absorb middleware package |
| P4 | Planned | Release `@zubridge/tauri` v2.0 |
| P5 | Planned | NAPI-RS bindings + `@zubridge/node-native` |
| P6 | Planned | Electron 3.1 migrates to NAPI core |
| P7 | Planned | Synchronised stable release (Electron 3.1 + Tauri 2.x) |

When touching Tauri or Rust code, check [UNIFFI_REFACTOR_PLAN.md](./UNIFFI_REFACTOR_PLAN.md) to understand where that code sits in the refactor sequence.

## Common Tasks

### Adding a New Adapter Package
1. Create `packages/<framework>/` following the existing package structure
2. Add to `pnpm-workspace.yaml`
3. Update `turbo.jsonc` with appropriate build/test dependencies
4. Create example/E2E app in `apps/<framework>/e2e/`
5. Add E2E task to root `package.json` and `turbo.jsonc`
6. Check `docs/evaluations/` for feasibility notes on the framework

### Debugging Unit Tests
- Per-package tests run with Vitest; add `--reporter=verbose` for detail
- Check `vitest.config.ts` per package for environment/mock setup
- Coverage reports output to `coverage/` per package

### Debugging E2E Tests
1. Build the target app first (`pnpm build:electron-<variant>` or `pnpm build:tauri`)
2. Run with `DEBUG=zubridge:*` for IPC tracing
3. Check `e2e/wdio.conf.ts` for binary path discovery logic
4. For Tauri E2E, check the `apps/tauri/e2e/` wdio config
