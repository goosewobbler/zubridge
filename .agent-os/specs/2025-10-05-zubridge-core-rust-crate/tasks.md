# Spec Tasks

These are the tasks to be completed for the spec detailed in @.agent-os/specs/2025-10-05-zubridge-core-rust-crate/spec.md

> Created: 2025-10-05
> Status: Ready for Implementation

## Tasks

- [x] 1. Rename existing TypeScript package from @zubridge/core to @zubridge/utils
  - [x] 1.1 Write tests to verify package imports work after rename
  - [x] 1.2 Rename directory from packages/core/ to packages/utils/
  - [x] 1.3 Update package.json name field to @zubridge/utils
  - [x] 1.4 Update all imports across codebase from @zubridge/core to @zubridge/utils
  - [x] 1.5 Verify all tests pass after rename

- [x] 2. Set up Rust crate structure at packages/core/
  - [x] 2.1 Write integration test skeleton for feature flag validation
  - [x] 2.2 Create packages/core/ directory with Cargo.toml (name: zubridge-core)
  - [x] 2.3 Set up feature flags (uniffi, napi, tauri) with conditional dependencies
  - [x] 2.4 Create module structure (src/core/, src/middleware/, src/wrappers/)
  - [x] 2.5 Add build.rs for UniFFI and NAPI-RS build scripts
  - [x] 2.6 Verify cargo build succeeds with default features

- [x] 3. Implement core Store struct and minimal working example
  - [x] 3.1 Write unit tests for Store struct (new, get_name)
  - [x] 3.2 Implement Store struct in src/core/store.rs
  - [x] 3.3 Create UniFFI interface definition (src/uniffi.udl) with create_store function
  - [x] 3.4 Implement NAPI-RS wrapper in src/wrappers/napi.rs
  - [x] 3.5 Implement Tauri plugin wrapper in src/wrappers/tauri.rs
  - [x] 3.6 Wire up lib.rs with conditional compilation for all platforms
  - [x] 3.7 Verify all unit tests pass

- [x] 4. Implement middleware architecture
  - [x] 4.1 Write unit tests for Middleware trait and MiddlewareChain
  - [x] 4.2 Define Middleware trait in src/middleware/mod.rs
  - [x] 4.3 Implement MiddlewareChain with add() and trigger methods
  - [x] 4.4 Create LoggingMiddleware example in src/middleware/logging.rs
  - [x] 4.5 Verify all middleware tests pass

- [ ] 5. Create integration tests for feature flag validation
  - [ ] 5.1 Implement tests/feature_uniffi.rs to verify uniffi feature compiles
  - [ ] 5.2 Implement tests/feature_napi.rs to verify napi feature compiles
  - [ ] 5.3 Implement tests/feature_tauri.rs to verify tauri feature compiles
  - [ ] 5.4 Test default build (no features) compiles successfully
  - [ ] 5.5 Test multiple feature combinations don't conflict
  - [ ] 5.6 Verify all integration tests pass

- [ ] 6. Update CI/CD pipeline for Rust validation
  - [ ] 6.1 Identify existing GitHub Actions workflow file to update
  - [ ] 6.2 Add rust-core job with matrix strategy for all feature combinations
  - [ ] 6.3 Configure cargo build and test steps for each feature set
  - [ ] 6.4 Verify CI pipeline runs successfully on test branch

- [ ] 7. Write comprehensive documentation
  - [ ] 7.1 Create README.md with architecture overview
  - [ ] 7.2 Document build instructions for each platform (uniffi, napi, tauri)
  - [ ] 7.3 Explain module organization and middleware architecture
  - [ ] 7.4 Add testing instructions and future platform scaffolding notes
  - [ ] 7.5 Verify documentation is complete and accurate
