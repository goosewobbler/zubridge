# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).


## [@zubridge/tauri@1.1.1-next.2] - 2026-09-05

[Full Changelog](https://github.com/goosewobbler/zubridge/compare/zubridge-tauri@v1.1.0...zubridge-tauri@v1.1.1-next.2)

### Added
- **p4**: integrate releasekit (standing-PR) + Tauri v2 release prep (PR [#169](https://github.com/goosewobbler/zubridge/pull/169))
- **p3**: perf comparison harness + middleware removal (PR [#168](https://github.com/goosewobbler/zubridge/pull/168))
- **tauri-e2e**: add Tauri E2E suite using \@wdio/tauri-service embedded provider (P3.5) (PR [#159](https://github.com/goosewobbler/zubridge/pull/159))
- **core**: P1 — carve out zubridge-core Rust crate (PR [#153](https://github.com/goosewobbler/zubridge/pull/153))
- **tauri**: align tauri with electron v3 (PR [#152](https://github.com/goosewobbler/zubridge/pull/152))
- **electron**: add configurable maxDepth for state serialization (PR [#128](https://github.com/goosewobbler/zubridge/pull/128))
- rework thunks (PR [#113](https://github.com/goosewobbler/zubridge/pull/113))

### Changed
- **deps-dev**: bump the development-dependencies group across 1 directory with 27 updates (PR [#173](https://github.com/goosewobbler/zubridge/pull/173))
- **deps**: bump the production-dependencies group across 1 directory with 7 updates (PR [#166](https://github.com/goosewobbler/zubridge/pull/166))
- update deps, remove `xvfb-maybe` (PR [#131](https://github.com/goosewobbler/zubridge/pull/131))
- remove broken title show/hide
- update deps
- second pass
- fix type errors
- fix non-null assertions
- more type fixes
- fix type errors
- lint fixes
- formatting & linting update
- **release**: \@zubridge/core, \@zubridge/electron, \@zubridge/middleware, \@zubridge/tauri, \@zubridge/tauri-plugin, \@zubridge/types, \@zubridge/ui 2.0.0-next.5
- **release**: \@zubridge/core, \@zubridge/electron, \@zubridge/middleware, \@zubridge/tauri, \@zubridge/tauri-plugin, \@zubridge/types, \@zubridge/ui 2.0.0-next.4
- update deps
- **tauri**: use core
- update deps
- **tauri**: fix test
- **tauri**: fix type
- add fallback title

## [@zubridge/electron@3.1.0] - 2026-09-05

[Full Changelog](https://github.com/goosewobbler/zubridge/compare/zubridge-electron@v3.0.0...zubridge-electron@v3.1.0)

### Added
- **p3**: perf comparison harness + middleware removal (PR [#168](https://github.com/goosewobbler/zubridge/pull/168))
- **tauri-e2e**: add Tauri E2E suite using \@wdio/tauri-service embedded provider (P3.5) (PR [#159](https://github.com/goosewobbler/zubridge/pull/159))
- **core**: P1 — carve out zubridge-core Rust crate (PR [#153](https://github.com/goosewobbler/zubridge/pull/153))
- **tauri**: align tauri with electron v3 (PR [#152](https://github.com/goosewobbler/zubridge/pull/152))

### Changed
- **deps-dev**: bump the development-dependencies group across 1 directory with 27 updates (PR [#173](https://github.com/goosewobbler/zubridge/pull/173))
- **deps**: bump the production-dependencies group across 1 directory with 7 updates (PR [#166](https://github.com/goosewobbler/zubridge/pull/166))
- delete spec

### Fixed
- **electron**: bundle weald into main/preload so debug works in the published package (PR [#202](https://github.com/goosewobbler/zubridge/pull/202))
- **electron**: drop workspace: protocol runtime dep that broke npm install (PR [#196](https://github.com/goosewobbler/zubridge/pull/196) · closes [#194](https://github.com/goosewobbler/zubridge/issues/194))

## [@zubridge/types@2.3.0] - 2026-09-05

[Full Changelog](https://github.com/goosewobbler/zubridge/compare/zubridge-types@v2.2.0...zubridge-types@v2.3.0)

### Added
- **tauri-e2e**: add Tauri E2E suite using \@wdio/tauri-service embedded provider (P3.5) (PR [#159](https://github.com/goosewobbler/zubridge/pull/159))
- **core**: P1 — carve out zubridge-core Rust crate (PR [#153](https://github.com/goosewobbler/zubridge/pull/153))

### Changed
- **deps-dev**: bump the development-dependencies group across 1 directory with 27 updates (PR [#173](https://github.com/goosewobbler/zubridge/pull/173))
- **deps**: bump the production-dependencies group across 1 directory with 7 updates (PR [#166](https://github.com/goosewobbler/zubridge/pull/166))

## [@zubridge/ui@0.1.1-next.2] - 2026-09-05

### Changed
- **deps-dev**: bump the development-dependencies group across 1 directory with 27 updates (\#173)
