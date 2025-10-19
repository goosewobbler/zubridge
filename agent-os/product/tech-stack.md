# Technical Stack

> Last Updated: 2025-10-04
> Version: 1.0.0

## Project Type

**Library / SDK** - Multi-framework cross-platform state management library

## Core Languages

- **Current**: TypeScript 5.7+ (ESM)
- **Future Core**: Rust (with UniFFI for cross-language bindings)
- **Module System**: ES Modules (ESM) with CommonJS compatibility where needed

## Package Management

- **Package Manager**: pnpm 10.x
- **Workspace Structure**: pnpm workspaces monorepo
- **Build Orchestration**: Turbo
- **Node Version**: Node.js ≥22 LTS (for development)

## Primary Dependencies

- **State Management**: Zustand 5.x (peer dependency)
- **React Integration**: React 18+ (optional peer dependency for React hooks)
- **Electron Support**: Electron ≥12 (peer dependency)
- **Tauri Support**: @tauri-apps/api v1/v2 (peer dependency, dependency injection pattern)

## Build Tools

- **TypeScript Bundler**: tsup
- **Module Bundler**: Rollup
- **Application Bundler**: Vite, electron-vite
- **Type Checking**: TypeScript 5.7+ strict mode

## Testing Infrastructure

- **Unit Testing**: Vitest 2.x
- **E2E Testing**: WebdriverIO 9.x
- **Test Applications**: Electron and Tauri test apps in `apps/` directory
- **Coverage**: Comprehensive unit and E2E coverage for all state patterns

## Code Quality

- **Linting & Formatting**: Biome 2.x
- **Type Safety**: TypeScript strict mode, full type inference
- **Code Style**: Enforced via Biome configuration

## Supported Target Frameworks

### Current (v1.x - v2.x)

- **Electron**: ≥12, full ESM and CommonJS support
- **Tauri**: v1 and v2 via dependency injection

### Future (v3.x+)

- **Flutter**: Via flutter_rust_bridge
- **Blazor**: Via WebAssembly bindings
- **Neutralino**: Via NAPI-RS

## Future Core Architecture (v3.x)

- **Core Language**: Rust
- **Cross-Platform Bindings**: UniFFI (Foreign Function Interface)
- **Electron/Node.js Bridge**: NAPI-RS
- **Tauri Integration**: Native Tauri plugin structure
- **Flutter Integration**: flutter_rust_bridge
- **WebAssembly**: wasm-bindgen for Blazor

## CI/CD & Deployment

- **CI/CD Platform**: GitHub Actions
- **Publishing**: npm registry
- **Versioning**: Conventional commits with automated versioning
- **Release Strategy**: Independent package versioning in monorepo
- **Distribution**: Published as npm packages (@zubridge/electron, @zubridge/tauri, etc.)

## Repository & Source Control

- **Version Control**: Git
- **Repository**: GitHub (https://github.com/goosewobbler/zubridge)
- **Branching Strategy**: Feature branches with main as stable
- **Monorepo Structure**: pnpm workspaces with packages for Electron, Tauri, shared types, and examples

## Development Environment

- **Monorepo Packages**:
  - `@zubridge/electron` - Electron implementation
  - `@zubridge/tauri` - Tauri implementation
  - `@zubridge/core` - Shared utilities
  - `@zubridge/types` - Type definitions
  - `@zubridge/ui` - Shared UI components
  - `@zubridge/apps-shared` - Shared application code
  - `@zubridge/middleware` - Middleware (prototypal, unreleased)
- **Example Applications**: Multiple example apps demonstrating different patterns (basic, handlers, reducers, Redux, custom)
- **Documentation**: Package-specific docs in `packages/*/docs/` directories
