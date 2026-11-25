# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [@zubridge/electron@3.1.0] - 2026-11-25

[Full Changelog](https://github.com/goosewobbler/zubridge/compare/zubridge-electron@v3.0.0...zubridge-electron@v3.1.0)

### Added

- **p3**: perf comparison harness + middleware removal (PR [#168](https://github.com/goosewobbler/zubridge/pull/168))
- **tauri-e2e**: add Tauri E2E suite using \@wdio/tauri-service embedded provider (P3.5) (PR [#159](https://github.com/goosewobbler/zubridge/pull/159))
- **core**: P1 — carve out zubridge-core Rust crate (PR [#153](https://github.com/goosewobbler/zubridge/pull/153))
- **tauri**: align tauri with electron v3 (PR [#152](https://github.com/goosewobbler/zubridge/pull/152))

### Changed

- remove refactor leftovers, group the Tauri release unit, refresh docs (PR [#212](https://github.com/goosewobbler/zubridge/pull/212) · closes [#181](https://github.com/goosewobbler/zubridge/issues/181))
- enable biome noNestedTernary
- drop remaining unneeded comments
- tighten comments
- migrate deprecated tsdown options and silence build warnings
- **electron**: add unit tests for the preload bridge (PR [#220](https://github.com/goosewobbler/zubridge/pull/220))
- **biome**: enforce braces around if statements (useBlockStatements) (PR [#218](https://github.com/goosewobbler/zubridge/pull/218))
- **electron**: stop per-window debug serialization and duplicate diffs (PR [#214](https://github.com/goosewobbler/zubridge/pull/214))
- update dependencies (PR [#215](https://github.com/goosewobbler/zubridge/pull/215))
- delete spec

### Fixed

- stop leaking listeners, clamp oversized timers, and quiet test warnings
- **electron**: bundle weald into main/preload so debug works in the published package (PR [#202](https://github.com/goosewobbler/zubridge/pull/202))
- **electron**: drop workspace: protocol runtime dep that broke npm install (PR [#196](https://github.com/goosewobbler/zubridge/pull/196) · closes [#194](https://github.com/goosewobbler/zubridge/issues/194))

### Dependencies & version bumps

- **deps-dev**: bump the development-dependencies group across 1 directory with 27 updates (PR [#173](https://github.com/goosewobbler/zubridge/pull/173))
- **deps**: bump the production-dependencies group across 1 directory with 7 updates (PR [#166](https://github.com/goosewobbler/zubridge/pull/166))

## [@zubridge/types@2.3.0] - 2026-11-25

[Full Changelog](https://github.com/goosewobbler/zubridge/compare/zubridge-types@v2.2.0...zubridge-types@v2.3.0)

### Added

- **tauri-e2e**: add Tauri E2E suite using \@wdio/tauri-service embedded provider (P3.5) (PR [#159](https://github.com/goosewobbler/zubridge/pull/159))
- **core**: P1 — carve out zubridge-core Rust crate (PR [#153](https://github.com/goosewobbler/zubridge/pull/153))

### Changed

- migrate deprecated tsdown options and silence build warnings
- update dependencies (PR [#215](https://github.com/goosewobbler/zubridge/pull/215))

### Dependencies & version bumps

- **deps-dev**: bump the development-dependencies group across 1 directory with 27 updates (PR [#173](https://github.com/goosewobbler/zubridge/pull/173))
- **deps**: bump the production-dependencies group across 1 directory with 7 updates (PR [#166](https://github.com/goosewobbler/zubridge/pull/166))

## [@zubridge/utils@2.0.1] - 2026-11-25

[Full Changelog](https://github.com/goosewobbler/zubridge/compare/zubridge-utils@v2.0.0...zubridge-utils@v2.0.1)

### Changed

- add unit tests for utils and tauri (PR [#219](https://github.com/goosewobbler/zubridge/pull/219))
- **utils**: adopt weald as a first-class dependency (PR [#217](https://github.com/goosewobbler/zubridge/pull/217))
- **biome**: enforce braces around if statements (useBlockStatements) (PR [#218](https://github.com/goosewobbler/zubridge/pull/218))
- **electron**: stop per-window debug serialization and duplicate diffs (PR [#214](https://github.com/goosewobbler/zubridge/pull/214))
- update dependencies (PR [#215](https://github.com/goosewobbler/zubridge/pull/215))
