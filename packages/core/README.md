# @zubridge/core (Rust)

Core Rust implementation of Zubridge state synchronization with multi-platform bindings.

## Overview

This crate provides the foundational state management logic for Zubridge, designed to compile for multiple target platforms through conditional compilation:

- **UniFFI**: For Swift, Kotlin, and other foreign function interfaces
- **NAPI-RS**: For Node.js and Electron integration
- **Tauri**: For Tauri v2 plugin system

## Architecture

```
packages/core/
├── src/
│   ├── core/           # Platform-agnostic core logic
│   │   └── store.rs    # Store struct with basic state management
│   ├── middleware/     # Extensible middleware system
│   │   ├── mod.rs      # Middleware trait and chain
│   │   └── logging.rs  # Example logging middleware
│   ├── wrappers/       # Platform-specific bindings
│   │   ├── napi.rs     # NAPI-RS wrapper for Node.js/Electron
│   │   └── tauri.rs    # Tauri plugin wrapper
│   ├── uniffi.udl      # UniFFI interface definition
│   └── lib.rs          # Conditional compilation orchestration
├── tests/              # Integration tests for feature validation
│   ├── feature_uniffi.rs
│   ├── feature_napi.rs
│   └── feature_tauri.rs
└── build.rs            # Build script for UniFFI and NAPI
```

### Core Components

- **Store**: Platform-agnostic state container with name and accessor methods
- **Middleware**: Trait-based architecture for extensible event handling
- **MiddlewareChain**: Manages and triggers multiple middleware instances

## Building

### Prerequisites

- Rust 1.86+ (stable)
- For NAPI builds: Node.js 18+
- For Tauri builds: Tauri CLI
- For UniFFI builds: UniFFI bindgen

### Feature Flags

The crate uses Cargo features for conditional compilation:

```toml
[features]
default = []
uniffi = ["dep:uniffi", "uniffi?/build"]
napi = ["dep:napi", "dep:napi-derive", "dep:napi-build"]
tauri = ["dep:tauri"]
```

### Build Commands

**Default build (no bindings):**
```bash
cargo build
```

**UniFFI (for Swift, Kotlin):**
```bash
cargo build --features uniffi
```

**NAPI-RS (for Node.js, Electron):**
```bash
cargo build --features napi --lib
```

**Tauri plugin:**
```bash
cargo build --features tauri
```

**Combined builds:**
```bash
# UniFFI + Tauri (compatible)
cargo build --features "uniffi,tauri"

# Note: NAPI cannot be combined with other features
# as it requires a Node.js runtime environment
```

## Testing

**Run all unit tests:**
```bash
cargo test
```

**Test specific features:**
```bash
cargo test --features uniffi
cargo test --features napi
cargo test --features tauri
```

**Integration tests:**

The `tests/` directory contains integration tests that verify each feature flag compiles correctly:
- `feature_uniffi.rs`: Tests UniFFI bindings generation and basic Store functionality
- `feature_napi.rs`: Verifies NAPI compilation (execution requires Node.js)
- `feature_tauri.rs`: Tests Tauri command generation

## Module Organization

### Core (`src/core/`)

Platform-agnostic state management logic. All types here use standard Rust with serde for serialization.

```rust
use zubridge_core::core::store::Store;

let store = Store::new("my-store".to_string());
assert_eq!(store.get_name(), "my-store");
```

### Middleware (`src/middleware/`)

Extensible event system for cross-cutting concerns:

```rust
use zubridge_core::middleware::{Middleware, MiddlewareChain, LoggingMiddleware};

let mut chain = MiddlewareChain::new();
chain.add(Box::new(LoggingMiddleware));
chain.trigger_store_created("my-store");
```

### Wrappers (`src/wrappers/`)

Platform-specific bindings that adapt core functionality:

**NAPI (Node.js/Electron):**
```rust
#[cfg(feature = "napi")]
use zubridge_core::wrappers::napi::{Store, create_store};

// These are NAPI-wrapped versions for JavaScript interop
```

**Tauri:**
```rust
#[cfg(feature = "tauri")]
use zubridge_core::wrappers::tauri::{create_store, init};

// Tauri commands and plugin initialization
```

## Platform-Specific Usage

### UniFFI (iOS, Android)

After building with `--features uniffi`, generate platform bindings:

```bash
# Generate Swift bindings
cargo run --features uniffi --bin uniffi-bindgen generate src/uniffi.udl --language swift

# Generate Kotlin bindings
cargo run --features uniffi --bin uniffi-bindgen generate src/uniffi.udl --language kotlin
```

### NAPI-RS (Electron, Node.js)

The NAPI build produces a native Node.js addon:

```bash
# Build the NAPI module
cargo build --release --features napi

# Use from JavaScript
const { Store, createStore } = require('./index.node');
const store = createStore('my-store');
```

### Tauri (Desktop Apps)

Integrate as a Tauri plugin in your app:

```rust
use zubridge_core::wrappers::tauri;

fn main() {
    tauri::Builder::default()
        .plugin(tauri::init())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

## Middleware Architecture

Create custom middleware by implementing the `Middleware` trait:

```rust
use zubridge_core::middleware::Middleware;

pub struct CustomMiddleware;

impl Middleware for CustomMiddleware {
    fn on_store_created(&self, store_name: &str) {
        // Handle store creation
    }

    fn on_state_update(&self, store_name: &str, action: &str) {
        // Handle state updates
    }
}
```

## Future Platform Scaffolding

The architecture is designed to easily add new platforms:

1. Add feature flag to `Cargo.toml`
2. Create wrapper module in `src/wrappers/`
3. Add conditional compilation in `src/lib.rs`
4. Create integration test in `tests/`
5. Update CI/CD pipeline

Potential future platforms:
- WebAssembly (wasm-bindgen)
- Python (PyO3)
- C FFI (cbindgen)

## Development

### Adding New Core Functionality

1. Write tests in the respective module (inline `#[cfg(test)]`)
2. Implement functionality in `src/core/`
3. Update platform wrappers as needed
4. Run tests: `cargo test --all-features`

### Adding New Middleware

1. Create module in `src/middleware/`
2. Implement `Middleware` trait
3. Add tests
4. Export from `src/middleware/mod.rs`

## CI/CD

The GitHub Actions workflow validates:
- Default build (no features)
- Each feature individually (uniffi, napi, tauri)
- Compatible feature combinations (uniffi+tauri)

See `.github/workflows/ci.yml` for the complete CI configuration.

## License

See LICENSE file in repository root.
