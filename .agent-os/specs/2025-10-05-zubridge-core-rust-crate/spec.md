# Spec Requirements Document

> Spec: Zubridge Core Rust Crate
> Created: 2025-10-05

## Overview

Establish the foundational Rust crate (`zubridge-core`) with conditional compilation support for multiple platform targets (UniFFI, NAPI-RS, Tauri), enabling a unified core that can be compiled for Electron, Tauri, Flutter, Blazor, and Neutralino. This crate will serve as the single source of truth for state management logic across all framework integrations, with a minimal working example to validate the architecture before full implementation.

## User Stories

### Platform Maintainer Setting Up Build Targets

As a Zubridge maintainer, I want to build the core library for different platform targets using feature flags, so that I can validate that the conditional compilation architecture works correctly before porting complex business logic.

**Workflow:**
- Run `cargo build --features uniffi` to generate UniFFI bindings
- Run `cargo build --features napi` to generate NAPI-RS bindings for Node.js/Electron
- Run `cargo build --features tauri` to output Tauri plugin structure
- Verify that a minimal `create_store()` function exports correctly for each target
- Confirm TypeScript definitions are generated for NAPI target
- Validate that all feature combinations compile without conflicts

### Developer Integrating Middleware

As a developer adding middleware to Zubridge, I want a clear middleware trait/interface defined in the core, so that I can understand how to implement custom middleware that works across all platform targets.

**Workflow:**
- Review the middleware trait definition in `zubridge-core`
- See example logging middleware implementation
- Understand where middleware hooks into store creation and state updates
- Know where the existing prototype middleware will be integrated in future tasks

### CI/CD Pipeline Validating Builds

As a CI system, I want to automatically test all feature flag combinations, so that breaking changes to any platform target are caught immediately.

**Workflow:**
- Run tests for each feature independently (`uniffi`, `napi`, `tauri`)
- Run tests for common feature combinations
- Verify conditional compilation tests pass
- Ensure documentation build succeeds

## Spec Scope

1. **Rename Existing Package** - Rename `packages/core` to `packages/utils` and update package name from `@zubridge/core` to `@zubridge/utils` (currently contains only debug utilities)
2. **Cargo Workspace Structure** - Create new `packages/core/` directory with proper Rust crate organization (Cargo.toml name: `zubridge-core`) with module layout for core functionality, platform-specific wrappers, and middleware architecture
3. **Feature Flag Configuration** - Define `uniffi`, `napi`, and `tauri` features in Cargo.toml with proper conditional compilation, plus commented scaffolding for `flutter` and `wasm` features
4. **Minimal Working Example** - Implement a simple `create_store()` function that compiles and exports correctly via all three platform targets (UniFFI bindings, NAPI-RS with TypeScript definitions, Tauri plugin structure)
5. **Middleware Architecture** - Define the middleware trait/interface and implement one example logging middleware to demonstrate the integration pattern
6. **Testing Infrastructure** - Create unit tests for core logic and conditional compilation tests that verify each feature flag compiles and exports correctly
7. **Build and CI Configuration** - Set up build scripts and update existing CI pipeline to validate all feature combinations compile successfully
8. **Documentation** - Provide README with build instructions for each platform target and architecture overview

## Out of Scope

- Full thunk management implementation (separate task: "Port thunk priority queue and lifecycle management to Rust")
- Complete state coordination logic (separate task: "Implement state coordination and synchronization logic in Rust")
- Full middleware system migration (separate task: "Integrate prototypal middleware feature into core")
- E2E testing with actual framework integrations
- Performance benchmarking and optimization
- Production-ready error handling and edge cases

## Expected Deliverable

1. **All feature flags compile independently** - Running `cargo build --features <flag>` succeeds for `uniffi`, `napi`, and `tauri` without errors
2. **Minimal function exports correctly** - The `create_store()` example function generates correct bindings/exports for all three targets (UniFFI bindings, NAPI TypeScript definitions, Tauri plugin structure)
3. **CI pipeline validates builds** - GitHub Actions (or equivalent) runs and passes for all feature combinations
4. **Documentation enables platform builds** - A developer can follow the README to successfully build the crate for any target platform
