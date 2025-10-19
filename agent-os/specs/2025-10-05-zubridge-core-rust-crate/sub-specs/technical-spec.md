# Technical Specification

This is the technical specification for the spec detailed in @.agent-os/specs/2025-10-05-zubridge-core-rust-crate/spec.md

## Technical Requirements

### Package Renaming

**First, rename the existing TypeScript package:**
- Rename directory: `packages/core/` → `packages/utils/`
- Update `package.json`: `"name": "@zubridge/core"` → `"name": "@zubridge/utils"`
- Update all imports across the codebase from `@zubridge/core` → `@zubridge/utils`

### Crate Structure

**Create new Rust crate at `packages/core/`:**

```
packages/core/              # Directory name (following pattern of tauri-plugin/)
├── Cargo.toml              # name = "zubridge-core" (full prefixed name)
├── src/
│   ├── lib.rs              # Main entry point with conditional compilation
│   ├── core/               # Core state management logic (platform-agnostic)
│   │   ├── mod.rs
│   │   └── store.rs        # Minimal Store struct
│   ├── middleware/         # Middleware trait and implementations
│   │   ├── mod.rs          # Middleware trait definition
│   │   └── logging.rs      # Example logging middleware
│   ├── uniffi.udl          # UniFFI interface definition
│   └── wrappers/           # Platform-specific wrappers
│       ├── mod.rs
│       ├── napi.rs         # NAPI-RS wrapper (feature = "napi")
│       └── tauri.rs        # Tauri plugin wrapper (feature = "tauri")
├── tests/                  # Integration tests
│   ├── feature_uniffi.rs   # Test uniffi feature compilation
│   ├── feature_napi.rs     # Test napi feature compilation
│   └── feature_tauri.rs    # Test tauri feature compilation
└── README.md               # Build instructions and architecture docs
```

### Feature Flag Configuration (Cargo.toml)

```toml
[package]
name = "zubridge-core"
version = "0.1.0"
edition = "2021"

[features]
default = []
uniffi = ["dep:uniffi"]
napi = ["dep:napi", "dep:napi-derive"]
tauri = ["dep:tauri"]

# Future platform scaffolding (commented out)
# flutter = ["uniffi"]  # Uses uniffi + flutter_rust_bridge
# wasm = ["dep:wasm-bindgen"]

[dependencies]
# Core dependencies (always included)
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"

# Platform-specific dependencies (conditional)
uniffi = { version = "0.28", optional = true }
napi = { version = "2", optional = true }
napi-derive = { version = "2", optional = true }
tauri = { version = "2", optional = true }

[build-dependencies]
uniffi = { version = "0.28", features = ["build"], optional = true }
napi-build = { version = "2", optional = true }
```

### Minimal Working Example - `create_store()` Function

**Core Implementation (src/core/store.rs):**
```rust
#[derive(Debug, Clone)]
pub struct Store {
    pub name: String,
}

impl Store {
    pub fn new(name: String) -> Self {
        Store { name }
    }

    pub fn get_name(&self) -> String {
        self.name.clone()
    }
}
```

**UniFFI Interface Definition (src/uniffi.udl):**
```udl
namespace zubridge_core {
    Store create_store(string name);
};

interface Store {
    constructor(string name);
    string get_name();
};
```

**NAPI-RS Wrapper (src/wrappers/napi.rs):**
```rust
#[cfg(feature = "napi")]
use napi_derive::napi;

#[cfg(feature = "napi")]
#[napi]
pub fn create_store(name: String) -> Store {
    crate::core::store::Store::new(name)
}

#[cfg(feature = "napi")]
#[napi]
pub struct Store(crate::core::store::Store);

#[cfg(feature = "napi")]
#[napi]
impl Store {
    #[napi(constructor)]
    pub fn new(name: String) -> Self {
        Store(crate::core::store::Store::new(name))
    }

    #[napi]
    pub fn get_name(&self) -> String {
        self.0.get_name()
    }
}
```

**Tauri Plugin Wrapper (src/wrappers/tauri.rs):**
```rust
#[cfg(feature = "tauri")]
use tauri::{command, Runtime};

#[cfg(feature = "tauri")]
#[command]
pub fn create_store(name: String) -> crate::core::store::Store {
    crate::core::store::Store::new(name)
}

#[cfg(feature = "tauri")]
pub fn init<R: Runtime>() -> tauri::plugin::TauriPlugin<R> {
    tauri::plugin::Builder::new("zubridge")
        .invoke_handler(tauri::generate_handler![create_store])
        .build()
}
```

### Middleware Architecture

**Middleware Trait (src/middleware/mod.rs):**
```rust
pub trait Middleware: Send + Sync {
    fn on_store_created(&self, store_name: &str);
    fn on_state_update(&self, store_name: &str, action: &str);
}

pub struct MiddlewareChain {
    middlewares: Vec<Box<dyn Middleware>>,
}

impl MiddlewareChain {
    pub fn new() -> Self {
        MiddlewareChain {
            middlewares: Vec::new(),
        }
    }

    pub fn add(&mut self, middleware: Box<dyn Middleware>) {
        self.middlewares.push(middleware);
    }

    pub fn trigger_store_created(&self, store_name: &str) {
        for mw in &self.middlewares {
            mw.on_store_created(store_name);
        }
    }

    pub fn trigger_state_update(&self, store_name: &str, action: &str) {
        for mw in &self.middlewares {
            mw.on_state_update(store_name, action);
        }
    }
}
```

**Example Logging Middleware (src/middleware/logging.rs):**
```rust
use super::Middleware;

pub struct LoggingMiddleware;

impl Middleware for LoggingMiddleware {
    fn on_store_created(&self, store_name: &str) {
        println!("[Zubridge] Store created: {}", store_name);
    }

    fn on_state_update(&self, store_name: &str, action: &str) {
        println!("[Zubridge] State update in {}: {}", store_name, action);
    }
}
```

### Testing Requirements

**Unit Tests (inline in source files):**
- Add `#[cfg(test)] mod tests` modules in `src/core/store.rs` and `src/middleware/mod.rs`
- Test `Store::new()` creates store with correct name
- Test `Store::get_name()` returns expected value
- Test middleware chain triggers callbacks correctly

**Integration Tests (tests/ directory):**
Each file in `tests/` is a separate integration test binary:

- `tests/feature_uniffi.rs` - Verify `uniffi` feature compiles and generates bindings
- `tests/feature_napi.rs` - Verify `napi` feature compiles and generates TypeScript definitions
- `tests/feature_tauri.rs` - Verify `tauri` feature compiles and builds plugin structure
- Test that no features (default build) compiles successfully
- Test that multiple features together don't conflict

### CI/CD Configuration

**Update Existing GitHub Actions Workflow:**

The existing CI pipeline should be updated to include Rust core validation. Add a job to test all feature flag combinations:

```yaml
# Add to existing .github/workflows/ configuration
rust-core:
  runs-on: ubuntu-latest
  strategy:
    matrix:
      features:
        - ""           # default (no features)
        - "uniffi"
        - "napi"
        - "tauri"
        - "uniffi,napi"
        - "uniffi,tauri"
  steps:
    - uses: actions/checkout@v3
    - uses: actions-rs/toolchain@v1
      with:
        toolchain: stable
    - name: Build zubridge-core with features
      working-directory: ./packages/core
      run: cargo build --features "${{ matrix.features }}"
    - name: Test zubridge-core with features
      working-directory: ./packages/core
      run: cargo test --features "${{ matrix.features }}"
```

This integrates with the existing CI rather than creating a separate workflow.

### Build Scripts

**build.rs:**
```rust
fn main() {
    #[cfg(feature = "uniffi")]
    uniffi::generate_scaffolding("./src/uniffi.udl").unwrap();

    #[cfg(feature = "napi")]
    napi_build::setup();
}
```

### Documentation Requirements

**README.md must include:**
- Architecture overview with conditional compilation explanation
- Build instructions for each platform:
  - `cargo build --features uniffi` → UniFFI bindings in `target/`
  - `cargo build --features napi` → NAPI .node file + index.d.ts
  - `cargo build --features tauri` → Tauri plugin structure
- Module organization explanation
- Middleware architecture overview
- Testing instructions
- Future platform scaffolding explanation (`flutter`, `wasm`)

## External Dependencies

**UniFFI (v0.28)**
- **Purpose:** Generate foreign function interface bindings for Kotlin, Swift, Python, and future Flutter integration
- **Justification:** Mozilla-maintained standard for Rust FFI, mature ecosystem, supports multiple target languages

**NAPI-RS (v2)**
- **Purpose:** Generate Node.js native addon bindings with TypeScript definitions for Electron and Neutralino
- **Justification:** Best-in-class Rust → Node.js bridge, excellent TypeScript support, used by production tools (SWC, Rspack)

**Tauri (v2)**
- **Purpose:** Enable Tauri plugin structure output for seamless Tauri application integration
- **Justification:** Required for Tauri v2 release, official Tauri plugin API

**Serde/Serde-JSON (v1)**
- **Purpose:** Serialization/deserialization for state management and cross-boundary communication
- **Justification:** Rust standard for serialization, zero-cost abstractions, required for state synchronization

All dependencies are mature, actively maintained, and aligned with Zubridge's production requirements. No experimental or unmaintained dependencies are included.
