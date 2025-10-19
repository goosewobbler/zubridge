# Product Mission

> Last Updated: 2025-10-04
> Version: 1.0.0

## Pitch

Zubridge is a cross-platform state management library that helps desktop application developers coordinate state across process boundaries by providing Zustand-like APIs for seamless state synchronization in Electron, Tauri, and future multi-process frameworks.

## Users

### Primary Customers

- **Cross-Platform Desktop Developers**: Teams building applications with Electron, Tauri, Flutter, Blazor, or Neutralino that need state management across process boundaries
- **Performance-Critical Application Teams**: Organizations building real-time applications (trading platforms, data dashboards, monitoring tools) where state synchronization overhead is critical
- **Frontend Developers Transitioning to Desktop**: Web developers familiar with Zustand who want the same ergonomic API when building desktop applications

### User Personas

**Senior Frontend Developer** (28-45 years old)
- **Role:** Lead Engineer / Tech Lead
- **Context:** Building Electron or Tauri applications for enterprise clients, managing state across main process, renderer processes, and multiple windows
- **Pain Points:** Complex IPC boilerplate, state synchronization bugs, performance overhead from naive state syncing, lack of type safety across process boundaries
- **Goals:** Reduce development time, maintain type safety, achieve predictable state updates, minimize IPC overhead

**Full-Stack Developer** (25-35 years old)
- **Role:** Product Engineer
- **Context:** Shipping cross-platform desktop applications for startups or SaaS products, needs rapid development without sacrificing reliability
- **Pain Points:** Switching mental models between web state management and desktop IPC patterns, debugging async state issues across processes
- **Goals:** Use familiar APIs (Zustand), ship features quickly, maintain code quality

**Systems Programmer** (30-50 years old)
- **Role:** Senior Software Engineer / Architect
- **Context:** Building high-performance desktop applications with strict latency requirements, considering migration to Rust-based frameworks
- **Pain Points:** Performance unpredictability with JavaScript-only solutions, lack of control over state synchronization batching and priority
- **Goals:** Optimize for performance, control execution details, ensure cross-platform consistency

## The Problem

### Process Boundary State Management Complexity

Desktop frameworks like Electron and Tauri require developers to manually manage state synchronization across process boundaries using IPC mechanisms. This leads to hundreds of lines of boilerplate code, type safety issues, and difficult-to-debug race conditions.

**Our Solution:** Zubridge provides a drop-in Zustand-like API that automatically handles IPC communication, type safety, and state synchronization across all processes and windows.

### Performance Overhead from Naive Synchronization

Most state management solutions for multi-process applications send every state update across process boundaries immediately, causing performance degradation in high-frequency update scenarios like real-time data streams or user interactions.

**Our Solution:** Zubridge implements priority queueing for thunks and will add intelligent action batching and backpressure handling to minimize IPC overhead while maintaining state consistency.

### Framework Lock-in and Migration Challenges

Teams building desktop applications often face difficult migration paths when switching between frameworks (Electron to Tauri, adding Flutter support, etc.), requiring complete rewrites of state management logic.

**Our Solution:** Zubridge's unified Rust core with UniFFI will provide consistent APIs across Electron, Tauri, Flutter, Blazor, and Neutralino, enabling gradual migrations and multi-framework support in the same product.

## Differentiators

### Zustand-Familiar API for Cross-Process State

Unlike traditional IPC-based state management that requires learning framework-specific patterns (Electron's ipcMain/ipcRenderer, Tauri's invoke/emit), Zubridge provides the familiar Zustand API that web developers already know. This results in dramatically reduced onboarding time and code that's easier to read and maintain.

### Performance-First Architecture with Batching and Priority

Unlike simple state sync libraries that send every update immediately, Zubridge implements configurable batching windows, priority-based action queuing, and backpressure handling. Teams building real-time applications report significant performance improvements while maintaining state consistency.

### Unified Multi-Framework Core via UniFFI

Unlike framework-specific state libraries (electron-store, tauri-plugin-store), Zubridge is building a unified Rust core using UniFFI that will support Electron, Tauri, Flutter, Blazor, and Neutralino through the same API. This unique approach enables teams to support multiple frameworks without maintaining separate codebases.

## Key Features

### Core Features

- **Zustand-like API**: Familiar `create()`, `getState()`, `setState()`, and `subscribe()` methods that work identically across process boundaries
- **Type-Safe IPC Communication**: Automatic TypeScript type inference and runtime validation for all state updates and actions
- **Multi-Window State Synchronization**: Automatic state propagation to all renderer processes and windows without manual subscriptions
- **Multiple State Patterns**: Support for basic stores, handlers pattern, reducers pattern, and Redux adapters

### Advanced Features

- **Thunk Support with Priority Queueing**: Async actions with configurable priority levels, lifecycle hooks (onStart, onSuccess, onError), and automatic queue management
- **Custom Bridge Implementation**: Low-level API for teams needing full control over IPC mechanisms
- **Debug Logging Infrastructure**: Built-in structured logging for troubleshooting state synchronization issues

### Planned Features

- **Action Batching**: Configurable time-window batching to reduce IPC overhead for high-frequency updates
- **Backpressure Handling**: Automatic detection and management of overwhelmed processes

### Cross-Platform Features

- **Electron Support**: Full support for Electron ≥12 with ESM and CommonJS compatibility
- **Tauri v1 and v2 Support**: Dependency injection pattern for supporting both Tauri API versions
- **Future Framework Support**: Planned support for Flutter (via flutter_rust_bridge), Blazor (via WASM), and Neutralino (via NAPI-RS)

### Developer Experience

- **Comprehensive Test Coverage**: Vitest unit tests and WebdriverIO E2E tests ensuring reliability
- **Monorepo Structure**: pnpm workspaces with Turbo for efficient development and publishing
- **Minimal Dependencies**: Lean dependency tree focused on performance and security
