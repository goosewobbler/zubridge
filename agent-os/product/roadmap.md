# Product Roadmap

> Last Updated: 2025-10-04
> Version: 1.1.0
> Status: Active Development

## Phase 0: Already Completed

The following features have been implemented:

- [x] **Electron v2.0.0 Release** - Major rework of thunk and action processing with priority queueing, lifecycle management, and performance improvements
- [x] **Zustand-like API for Electron** - Familiar `create()`, `getState()`, `setState()`, and `subscribe()` methods working across process boundaries
- [x] **Type-Safe IPC Communication** - Automatic TypeScript type inference and runtime validation for state updates
- [x] **Multi-Window State Synchronization** - Automatic state propagation to all renderer processes
- [x] **Multiple State Patterns** - Support for basic stores, handlers pattern, reducers pattern, and Redux adapters
- [x] **Advanced Thunk Support** - Async actions with priority levels, lifecycle hooks (onStart, onSuccess, onError), and queue management
- [x] **Custom Bridge Implementation** - Low-level API for full control over IPC mechanisms
- [x] **Debug Logging Infrastructure** - Built-in structured logging for troubleshooting
- [x] **Comprehensive Test Suite** - Vitest unit tests and WebdriverIO E2E tests for all patterns
- [x] **Tauri v1 and v2 Support** - Dependency injection pattern supporting both Tauri API versions
- [x] **Monorepo Infrastructure** - pnpm workspaces with Turbo build orchestration
- [x] **Middleware Prototype** - Initial middleware implementation (unreleased)

## Phase 1: UniFFI Core Migration (Current Priority)

**Goal:** Establish unified Rust core with UniFFI to enable multi-framework support
**Success Criteria:**
- Rust core handles thunk management and state coordination
- Core middleware architecture and API established
- NAPI-RS wrapper provides Electron/Node.js integration
- Tauri plugin structure outputs functional code
- Performance benchmarks show no regression vs TypeScript implementation

### Features

- [ ] Create `zubridge-core` Rust crate with conditional compilation - `L`
- [ ] Port thunk priority queue and lifecycle management to Rust - `L`
- [ ] Implement state coordination and synchronization logic in Rust - `M`
- [ ] Core middleware architecture and API in Rust - `M`
- [ ] Basic performance/logging middleware for testing - `S`
- [ ] Build NAPI-RS wrapper for Electron/Neutralino support - `M`
- [ ] Create Tauri plugin structure output - `M`
- [ ] Foundation for Flutter support (flutter_rust_bridge scaffolding) - `M`
- [ ] Foundation for Blazor support (WASM bindings scaffolding) - `M`

### Dependencies

- Rust toolchain and UniFFI setup
- NAPI-RS build pipeline
- Tauri plugin development environment
- Performance testing infrastructure

## Phase 2: Tauri v2.0 Release

**Goal:** Release first version of Zubridge with unified Rust core for Tauri
**Success Criteria:**
- All Electron v2 main process features ported to Rust
- Tauri v2 package reaches feature parity with Electron v2
- E2E tests pass for all state patterns in Tauri
- Published as stable v2.0.0 for Tauri

### Features

- [ ] Port all Electron v2 main process features to Rust core - `XL`
- [ ] Port Electron v2 improvements to Tauri (multi-window enhancements, logging improvements) - `M`
- [ ] Advanced thunk support for Tauri (matching Electron v2) - `M`
- [ ] Comprehensive E2E test suite for Tauri v2 - `L`
- [ ] Documentation and setup guide - `M`

### Dependencies

- Phase 1 completion (Rust core)
- Tauri v2 stable release
- Updated test infrastructure

## Phase 3: Electron v3.0 Migration

**Goal:** Migrate Electron package from TypeScript to unified Rust core
**Success Criteria:**
- Electron package uses Rust core via NAPI-RS
- All existing Electron v2 features work identically (backward compatible API)
- All existing E2E tests pass without modification
- Performance matches or exceeds v2
- Synchronized release versioning across Electron and Tauri

### Features

- [ ] Replace TypeScript main process with NAPI-RS bindings to Rust core - `XL`
- [ ] Validate all E2E tests pass with new architecture - `M`
- [ ] Synchronized release pipeline for Electron and Tauri - `S`

### Dependencies

- Phase 2 completion
- NAPI-RS production readiness
- Performance benchmarking results

## Phase 4: Flutter Support

**Goal:** Expand to mobile and desktop with Flutter via flutter_rust_bridge
**Success Criteria:**
- Flutter package published with full Zubridge API support
- Mobile examples working on iOS and Android
- Desktop Flutter examples validated
- E2E tests passing for Flutter integration

### Features

- [ ] Flutter package with flutter_rust_bridge integration - `XL`
- [ ] Mobile-specific Flutter example apps (iOS/Android) - `L`
- [ ] Desktop Flutter example application - `M`
- [ ] E2E test suite for Flutter - `L`
- [ ] Documentation - `L`

### Dependencies

- Phase 3 completion (Electron v3 on Rust core)
- flutter_rust_bridge maturity and stability
- Flutter mobile and desktop tooling

## Phase 5: Neutralino Support

**Goal:** Enable lightweight desktop framework support via existing NAPI wrapper
**Success Criteria:**
- Neutralino package published reusing NAPI-RS bindings
- Example application demonstrates Neutralino integration
- Documentation shows migration path from Electron

### Features

- [ ] Neutralino package configuration (reuses NAPI wrapper from Electron) - `S`
- [ ] Neutralino example application - `M`
- [ ] E2E test suite for Neutralino - `L`
- [ ] Documentation - `L`

### Dependencies

- Phase 3 completion (NAPI-RS wrapper proven)
- Neutralino stable release

## Phase 6: Blazor Support (Experimental)

**Goal:** Explore WebAssembly/web-native support for Blazor applications
**Success Criteria:**
- Blazor WASM bindings functional with core features
- Performance validated against JavaScript alternatives
- At least one production-ready example

### Features

- [ ] Blazor package with WASM bindings - `XL`
- [ ] Example Blazor application - `L`
- [ ] Documentation - `L`

### Dependencies

- Phase 3 completion (Rust core stable)
- wasm-bindgen maturity
- Blazor WebAssembly runtime stability
- Acknowledgment of E2E testing challenges

## Phase 7: Performance Measurement & Analysis

**Goal:** Establish performance baseline and identify optimization opportunities across all platforms
**Success Criteria:**
- Comprehensive benchmarking suite across all platforms
- Performance bottlenecks identified and documented
- Optimization roadmap established based on real data

### Features

- [ ] Cross-platform benchmarking suite - `L`
  - Standardized performance tests across all platforms
  - Baseline performance metrics for regression detection
  - Platform-specific performance characteristic profiling
- [ ] Performance measurement framework integrated with middleware - `M`
- [ ] Baseline performance metrics for all platforms - `M`
- [ ] Platform-specific bottleneck identification - `M`
  - Cross-boundary call frequency analysis
  - Serialization/deserialization overhead measurement
  - State synchronization performance profiling
- [ ] Performance optimization roadmap based on findings - `S`

### Dependencies

- Phases 4-6 completion (all platforms available for testing)
- Real-world usage data from Electron, Tauri, Flutter, Blazor, Neutralino
- Established middleware for performance measurement

## Phase 8: Performance Optimization

**Goal:** Implement performance improvements based on measurement data
**Success Criteria:**
- Measurable performance improvements across all platforms
- Platform-appropriate optimizations validated
- No regression in functionality or responsiveness

### Features

- [ ] Cross-boundary call batching implementation (if validated as bottleneck) - `L`
- [ ] Priority-based immediate flush mechanism - `M`
- [ ] Backpressure detection and handling - `L`
- [ ] Platform-specific optimizations based on Phase 7 findings - `M`
- [ ] Per-platform tuning and configuration - `M`
- [ ] Platform-agnostic optimization configuration system - `S`
- [ ] Documented optimal configurations per platform type - `S`

### Dependencies

- Phase 7 completion (measurement and analysis)
- Validated performance bottlenecks
- Clear optimization targets identified

## Phase 9: Developer Experience & Integrations

**Goal:** Enhance developer experience with debugging tools and key integrations
**Success Criteria:**
- Redux DevTools integration available for state inspection and debugging
- Sentry integration for error tracking established
- Middleware API documented and stable

### Features

- [ ] Redux DevTools integration - `M`
- [ ] Sentry integration middleware - `M`
- [ ] Official middleware API documentation - `M`
- [ ] Additional third-party integrations (as demand emerges) - `M`

### Future Considerations (If Community Demand Emerges)
- Custom Zubridge DevTools extension (for IPC visualization, batching metrics, platform-specific debugging)
- Time-travel debugging enhancements
- Community middleware contributions
- Additional monitoring/observability integrations

### Dependencies

- Phase 8 completion
- Stable middleware API
- Active community feedback

## Effort Scale Reference

- **XS**: 1 day
- **S**: 2-3 days
- **M**: 1 week
- **L**: 2 weeks
- **XL**: 3+ weeks
