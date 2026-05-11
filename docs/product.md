# Zubridge Product Positioning

> Product mission, target users, problem statements, and differentiators. For current technical direction see [ROADMAP.md](../ROADMAP.md); for the in-flight Rust core refactor see [UNIFFI_REFACTOR_PLAN.md](../UNIFFI_REFACTOR_PLAN.md).

## Pitch

Zubridge is a cross-platform state management library that helps desktop and mobile application developers coordinate state across process boundaries by providing Zustand-like APIs for seamless state synchronization in Electron, Tauri, and future multi-process frameworks.

## Users

### Primary customers

- **Cross-platform desktop developers** — teams building applications with Electron, Tauri, or one of the post-refactor framework targets that need state management across process boundaries
- **Performance-critical application teams** — organisations building real-time applications (trading platforms, data dashboards, monitoring tools) where state-synchronisation overhead is critical
- **Frontend developers transitioning to desktop** — web developers familiar with Zustand who want the same ergonomic API when building desktop applications

### User personas

**Senior Frontend Developer** (28–45)
- **Role:** Lead engineer / tech lead
- **Context:** Building Electron or Tauri applications for enterprise clients; managing state across main process, renderer processes, and multiple windows
- **Pain points:** Complex IPC boilerplate, state-synchronisation bugs, performance overhead from naive state syncing, lack of type safety across process boundaries
- **Goals:** Reduce development time, maintain type safety, achieve predictable state updates, minimise IPC overhead

**Full-stack Developer** (25–35)
- **Role:** Product engineer
- **Context:** Shipping cross-platform desktop applications for startups or SaaS products; rapid development without sacrificing reliability
- **Pain points:** Switching mental models between web state management and desktop IPC patterns; debugging async state issues across processes
- **Goals:** Use familiar APIs (Zustand), ship features quickly, maintain code quality

**Systems Programmer** (30–50)
- **Role:** Senior software engineer / architect
- **Context:** Building high-performance desktop applications with strict latency requirements; considering migration to Rust-based frameworks
- **Pain points:** Performance unpredictability with JavaScript-only solutions; lack of control over state-synchronisation batching and priority
- **Goals:** Optimise for performance, control execution details, ensure cross-platform consistency

## The problem

### Process-boundary state-management complexity

Desktop frameworks like Electron and Tauri require developers to manually manage state synchronisation across process boundaries using IPC mechanisms. This leads to hundreds of lines of boilerplate code, type-safety issues, and difficult-to-debug race conditions.

**Our solution:** Zubridge provides a drop-in Zustand-like API that automatically handles IPC communication, type safety, and state synchronisation across all processes and windows.

### Performance overhead from naive synchronisation

Most state-management solutions for multi-process applications send every state update across process boundaries immediately, causing performance degradation in high-frequency update scenarios like real-time data streams or user interactions.

**Our solution:** Zubridge implements priority queueing for thunks, action batching (default 16 ms window with priority flush threshold), and delta state updates to minimise IPC overhead while maintaining state consistency.

### Framework lock-in and migration challenges

Teams building cross-platform applications often face difficult migration paths when switching between frameworks (Electron to Tauri, adding Flutter support, etc.), requiring complete rewrites of state-management logic.

**Our solution:** Zubridge's unified Rust core provides consistent APIs across the supported integration paths (NAPI-RS for Node-API runtimes, direct Rust for native frameworks, UniFFI for mobile bindings), enabling gradual migrations and multi-framework support in the same product. See [ROADMAP.md](../ROADMAP.md) for the current list of target frameworks.

## Differentiators

### Zustand-familiar API for cross-process state

Unlike traditional IPC-based state management that requires learning framework-specific patterns (Electron's `ipcMain`/`ipcRenderer`, Tauri's `invoke`/`emit`), Zubridge provides the familiar Zustand API that web developers already know. This dramatically reduces onboarding time and produces code that's easier to read and maintain.

### Performance-first architecture with batching and priority

Unlike simple state-sync libraries that send every update immediately, Zubridge implements configurable batching windows, priority-based action queuing, and delta state synchronisation. Teams building real-time applications report significant performance improvements while maintaining state consistency.

### Unified multi-framework core

Unlike framework-specific state libraries (electron-store, tauri-plugin-store), Zubridge is building a unified Rust core that will support multiple frameworks through a consistent API. This approach enables teams to support multiple frameworks without maintaining separate codebases. The first two shipped consumers are Electron and Tauri; the post-refactor framework integrations are tracked in [ROADMAP.md](../ROADMAP.md).

## Key features

### Core (shipped)

- **Zustand-like API** — familiar `create()`, `getState()`, `setState()`, and `subscribe()` methods that work identically across process boundaries
- **Type-safe IPC communication** — automatic TypeScript type inference and runtime validation for all state updates and actions
- **Multi-window state synchronisation** — automatic state propagation to all renderer processes and windows without manual subscriptions
- **Multiple state patterns** — basic stores, handlers pattern, reducers pattern, Redux adapters
- **Thunks with priority queueing** — async actions with configurable priority levels, lifecycle hooks (`onStart`, `onSuccess`, `onError`), automatic queue management
- **Custom bridge implementation** — low-level API for teams needing full control over IPC mechanisms
- **Action batching** — configurable time-window batching reducing IPC overhead by 80–95 % for high-frequency updates
- **Delta state updates** — efficient state synchronisation sending only what changed
- **Debug logging infrastructure** — built-in structured logging for troubleshooting

### Planned

See [ROADMAP.md](../ROADMAP.md) for the full list. Highlights: backpressure handling, performance benchmarking + optimisation, security review, Redux DevTools integration, Sentry middleware, official middleware API.

### Supported frameworks today

- **Electron** — `@zubridge/electron` v3.x; ≥12 supported
- **Tauri** — `@zubridge/tauri` (v1 shipped; v2 in the refactor)

Additional framework integrations sequenced in [ROADMAP.md §4](../ROADMAP.md#4-post-refactor-framework-integrations). Lifecycle / support policy in [SUPPORT.md](../SUPPORT.md).

### Developer experience

- **Comprehensive test coverage** — Vitest unit tests and WebdriverIO E2E tests ensuring reliability
- **Monorepo structure** — pnpm workspaces with Turbo for efficient development and publishing
- **Minimal dependencies** — lean dependency tree focused on performance and security
