# Support and Lifecycle Policy

This document defines how Zubridge packages are supported, who maintains what, and when packages stop receiving updates. Roadmap and product direction live in [ROADMAP.md](./ROADMAP.md).

---

## 1. Commitment levels

Every Zubridge package and integration is published under one of three commitment levels.

| Level | Meaning |
|-------|---------|
| **Core** | The core team maintains the package. It ships in this monorepo. Versioned with the rest of Zubridge. Compatibility tests run in CI. Bugs are triaged by the core team. |
| **Blessed** | A community contributor maintains the package, usually in a separate repository. It follows the documented core API. The core team supplies compatibility test fixtures and triages bugs that turn out to originate in `zubridge-core`. |
| **External** | Built by the community without coordination. Not tracked by the core team. Not listed in ROADMAP.md. |

Roadmap entries marked "(proposed)" indicate the *intended* commitment level at completion. Capacity may force re-tiering before ship.

---

## 2. Supported versions and end-of-life policy

Zubridge follows a **minimal-support** policy. The goal is to keep maintenance surface small and honest about what we will and won't fix.

### 2.1 Rule

| Version | Status |
|---------|--------|
| Latest minor of the latest major | **Active** — feature work, bug fixes, security fixes |
| Previous minors of the latest major | Bug fixes only on best-effort; no guarantee |
| Previous major | **Archived** on the day the new major ships. Security CVEs only, for 30 days after the new-major release. After 30 days: no further releases. |
| Older majors | Unsupported. No fixes. |

This applies to every package independently: `@zubridge/electron`, `@zubridge/tauri`, `tauri-plugin-zubridge`, `zubridge-core`, `@zubridge/node-native`, etc.

### 2.2 What "Archived" means

- No new releases on the old major after the 30-day security window.
- GitHub issues against the archived major may be closed with a "please upgrade" pointer.
- npm / crates.io listings remain (versions never unpublished); only support stops.

### 2.3 Pre-1.0 crates

`zubridge-core` and other pre-1.0 Rust crates may make breaking changes between minor versions (0.x). Once a crate reaches 1.0, the rule above applies in full.

Criteria for `zubridge-core` to reach 1.0 are in [UNIFFI_REFACTOR_PLAN.md §7](./UNIFFI_REFACTOR_PLAN.md#7-versioning-and-housekeeping).

---

## 3. Compatibility matrix

### 3.1 NAPI ABI (Path A consumers)

`@zubridge/node-native` (and downstream Path A consumers) is built against a specific N-API version. The matrix below applies from the first 3.1 release onward.

| Surface | Constraint |
|---------|------------|
| N-API version | **8** (matches napi-rs default for the build chain at 3.1 release) |
| Electron | Last three LTS lines covered, plus the current latest. Initial commitment at 3.1 release: **Electron 22 LTS through latest**. |
| Node.js (for `apps/standalone-node/` and tooling) | **≥ 20 LTS** |
| Bun | Minimum version determined by the Bun NAPI compatibility audit (part of the Electrobun spike); see [docs/decisions/electrobun-spike.md](./docs/decisions/electrobun-spike.md). |
| Neutralino runtime | No version constraint; the Node-extension shim runs under Node ≥ 20 inside the Neutralino app process. |

Per-platform triple availability matches what `napi-rs` produces in the standard release pipeline: `darwin-x64`, `darwin-arm64`, `linux-x64-gnu`, `linux-arm64-gnu`, `win32-x64-msvc`, `win32-arm64-msvc`.

The live compatibility matrix is maintained alongside the released binary at `packages/node-native/COMPATIBILITY.md` from P5 onward.

### 3.2 Tauri

| Surface | Constraint |
|---------|------------|
| Tauri | `tauri@2.x` stable (specific minor pinned at each `@zubridge/tauri` minor release) |
| Rust MSRV | 1.75 (matches `zubridge-core` MSRV — see refactor plan §7) |

### 3.3 UniFFI (Path C consumers)

| Surface | Constraint |
|---------|------------|
| UniFFI | 0.28 or later |
| iOS deployment target | Latest two iOS major versions |
| Android API level | API 24 (Android 7.0) or later |

---

## 4. Security reporting

Security issues should be reported privately rather than via public GitHub issues. See `SECURITY.md` at the repo root.

The external security review committed in [ROADMAP.md §7.3](./ROADMAP.md#73-security-review) covers the unified core after P2 + P3.

---

## 5. Getting help

- **Questions / discussion:** GitHub Discussions
- **Bug reports:** GitHub Issues against the relevant package
- **Feature requests:** GitHub Discussions first; promoted to Issues once direction is clear
- **Security:** See [§4](#4-security-reporting)
