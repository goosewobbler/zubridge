# Zubridge Roadmap

> Last updated: 2026-05-11
> What's coming next and roughly in what order. For policies (support, EOL, compatibility) see [SUPPORT.md](./SUPPORT.md). For the in-flight Rust core refactor see [UNIFFI_REFACTOR_PLAN.md](./UNIFFI_REFACTOR_PLAN.md). Detailed per-framework feasibility lives in [docs/evaluations/](./docs/evaluations/); detailed decision gates live in [docs/decisions/](./docs/decisions/).

---

## 1. Status at a glance

### 1.1 Tracks

| Track | Status | Ownership | Path |
|-------|--------|-----------|------|
| Electron v3.0 (TypeScript) | Shipped | Core | — |
| Tauri v1 wrapper | Maintenance only | Core | — |
| Unified Rust core refactor (P1–P7) | **In progress** | Core | — |
| Electrobun integration | Evaluating | Core (proposed) | A — NAPI reuse |
| Neutralino integration | Evaluating | Blessed (proposed) | A* — NAPI via extension |
| Dioxus integration (Desktop + Mobile) | Evaluating | Core (proposed) | B — direct Rust |
| Flutter integration | Queued | Core (proposed) | C — flutter_rust_bridge |
| React Native integration | Evaluating | Core (proposed) | C — UniFFI bindings |
| Ionic / Capacitor integration | Evaluating | Blessed (proposed) | C — UniFFI bindings |
| Blazor integration | **Deferred pending research** | — | (was D — WASM) |
| Dioxus Web target | **Deferred pending research** | — | (was D — WASM) |
| Performance measurement + optimization | Future | Core | — |
| Redux DevTools, Sentry, third-party integrations | Future | Mixed | — |

Path letters describe the **technical integration mechanism**, not priority — sequencing is in §7. Commitment levels (Core / Blessed / External) and lifecycle policy are defined in [SUPPORT.md](./SUPPORT.md).

### 1.2 Packages

| Package | Status |
|---------|--------|
| `@zubridge/electron` | Shipped 3.0; 3.1 ships P3 perf baseline against TS core; 3.2 migrates to Rust core via NAPI |
| `@zubridge/node-native` (new) | Planned P5 — platform `.node` artifacts |
| `@zubridge/tauri` | Unreleased 1.1.x-next; v2 in refactor |
| `tauri-plugin-zubridge` | Unreleased 0.1.x-next; v0.2 in refactor |
| `zubridge-core` (new Rust crate) | Planned P1 |
| `@zubridge/utils` (rename of `@zubridge/core`) | Rename in P1 |
| `@zubridge/types` | Shipped 2.2 |

---

## 2. Shipped

| Package | Latest | Lifecycle |
|---------|--------|-----------|
| `@zubridge/electron` | 3.0.0 (2026-Q1) | Active; 3.1 in refactor |
| `@zubridge/types` | 2.2.0 | Active |
| `@zubridge/tauri` | 1.1.1-next.1 (unreleased) | Superseded by v2; v1 archived at P4 |
| `tauri-plugin-zubridge` | 0.1.1-next.1 (unreleased) | Superseded by v0.2 at P4 |

Per-package release history lives in each package's `CHANGELOG.md`.

---

## 3. In progress: Unified Rust core refactor

Unifies platform implementations onto a single Rust crate (`zubridge-core`) compiled with conditional features. End-state: Electron 3.1 + Tauri v2 both on the shared core. Full detail in [UNIFFI_REFACTOR_PLAN.md](./UNIFFI_REFACTOR_PLAN.md).

| Phase | Outputs |
|-------|---------|
| P1 | Carve out `zubridge-core` (extract from `tauri-plugin`) |
| P2 | Port full action/thunk scheduler from Electron TS to Rust core |
| P3 | Absorb `packages/middleware/` into `core::middleware` |
| P4 | Release Tauri v2.0 on unified core |
| P5 | NAPI-RS bindings + `@zubridge/node-native` |
| P6 | Electron 3.1 main process migrates to NAPI core |
| P7 | Synchronized Electron 3.1 + Tauri 2.x stable release |

P7 unlocks the framework integrations below.

---

## 4. Post-refactor framework integrations

Three active integration paths (a fourth — Path D, WASM — is deferred pending research; see §5).

| Path | Mechanism | Frameworks |
|------|-----------|-----------|
| **A** | NAPI-RS reuse — consume `@zubridge/node-native` from a Node-compatible runtime | Electrobun; Neutralino (via Node extension) |
| **B** | Direct Rust — consume `zubridge_core` crate directly | Dioxus (Desktop + Mobile) |
| **C** | UniFFI mobile bindings — generate Kotlin / Swift + framework plugin (Flutter uses its own bindgen on the same core) | Flutter, React Native, Ionic / Capacitor |

One-line summaries (full evaluations in [docs/evaluations/](./docs/evaluations/)):

- **Electrobun** — Path A; verdict MEDIUM–HIGH; gated on the Bun NAPI audit (part of the Electrobun spike). [Detail](./docs/evaluations/electrobun.md).
- **Neutralino** — Path A via Node-extension shim or upstream Rust extension; verdict MEDIUM. [Detail](./docs/evaluations/neutralino.md).
- **Dioxus** — Path B for desktop + mobile; verdict HIGH. **Dioxus Web is deferred** (see §5). [Detail](./docs/evaluations/dioxus.md).
- **Flutter** — Path C anchor via flutter_rust_bridge; verdict HIGH. [Detail](./docs/evaluations/flutter.md).
- **React Native** — Path C via UniFFI + TurboModule/JSI; verdict HIGH. [Detail](./docs/evaluations/react-native.md).
- **Ionic / Capacitor** — Path C via UniFFI + Capacitor Plugin; verdict HIGH. [Detail](./docs/evaluations/ionic-capacitor.md).

Compatibility constraints for each path (Electron / Bun / N-API / UniFFI versions) are in [SUPPORT.md §3](./SUPPORT.md#3-compatibility-matrix).

---

## 5. Deferred pending research

These targets are blocked on the **WASM value-proposition research** scheduled during P5 of the refactor (see [docs/decisions/wasm-value-research.md](./docs/decisions/wasm-value-research.md)). The research investigates whether browser-target frameworks have a real cross-tab / cross-process value need that justifies the WASM target's ongoing engineering tax, before Zubridge commits to Path D.

| Target | Why deferred |
|--------|--------------|
| **Blazor (WebAssembly)** | Single-tab web app — Zubridge's multi-process value-add doesn't strongly apply. The more compelling Blazor variant (Hybrid/MAUI) uses a native shell, not WASM, and would be a Path C integration if pursued. [Evaluation](./docs/evaluations/blazor.md). |
| **Dioxus Web** | Single-tab web app. Dioxus Desktop + Mobile (Path B) covers the 90% case for Dioxus users and is in §4 above. |
| **Future browser-only targets** | Speculative; research will identify whether any have real demand for multi-tab state sync. |

Outcome of the P5 research determines whether these promote back into §4 (with a WASM scaffolding task added post-P7) or stay deferred indefinitely.

If the research returns "go," the same spike discipline applied to other integrations (§7.3) extends here:

- **Blazor spike** — separate hands-on validation (see [docs/decisions/blazor-spike.md](./docs/decisions/blazor-spike.md))
- **Dioxus Web spike** — Phase 2 extension of the existing Dioxus spike (see [docs/decisions/dioxus-spike.md](./docs/decisions/dioxus-spike.md) §"Conditional Phase 2")

---

## 6. Considered but not prioritized

These frameworks were evaluated and are not on the current roadmap. Most could be supported via existing paths if community demand emerges.

| Framework | Why not now |
|-----------|-------------|
| Wails | Go-based main process. Path A doesn't apply; needs Go-Rust FFI. Niche audience. |
| NW.js | Could reuse Path A. Aging ecosystem; declining adoption. |
| Slint | Rust-native UI; Path B-applicable. Ship Dioxus first; revisit if demand follows. |
| iced | Rust-native Elm-architecture UI; Path B-applicable. Same logic as Slint. |
| egui | Immediate-mode Rust GUI. Architecturally awkward fit for retained state model. |
| Avalonia (C#) | XAML-based cross-platform C#. Native bindings would be parallel investment to Blazor. |
| MAUI (native) | Same calculus as Avalonia. |
| Qt (PyQt / qmlrs) | Niche audience; Rust-Qt bindings immature. |
| GTK (gtk-rs / relm) | Niche audience; Linux-focused. |
| Sciter | Embeddable HTML engine; small audience, complex integration. |
| Photino | .NET webview wrapper. Same as Avalonia/MAUI. |
| Server-side meta-frameworks (Next.js, Nuxt, SvelteKit) | Different domain — not cross-process state managers. |
| Vanilla browser apps (Solid / Svelte / Vue / Angular alone) | Value proposition (multi-process state sync) doesn't apply to single-tab web apps. |

---

## 7. Sequencing and dependencies

**Scope acknowledgment:** the six framework integrations below represent ~10+ months of serial focused work. This is **preference order, not capacity commitment**. Realistic delivery depends on contributor availability and demonstrated demand. Some integrations may end up Blessed (community-maintained) even if listed as Core-proposed.

### 7.1 Recommended order

1. **Electrobun** (Path A proof point — subject to Bun audit). If audit fails, fall back to Neutralino with increased effort.
2. **Dioxus desktop + mobile** (Path B proof point). Can run in parallel with #1. Web target deferred (§5).
3. **Flutter** (Path C anchor). Decide flutter_rust_bridge codegen direction before starting.
4. **React Native** (Path C reuse). TurboModule + JSI on UniFFI bindings from #3.
5. **Ionic / Capacitor** (Path C reuse). Capacitor Plugin on the same UniFFI bindings. Can ship in parallel with #4.
6. **Neutralino** (Path A coda, if not done at #1). Lower priority unless community demand emerges.

Path D (Blazor + Dioxus Web) is **not** in this sequence — it's deferred pending the P5 WASM value-proposition research (§5). If that research returns "go", Path D scaffolding and the Blazor + Dioxus Web integrations are added to this list post-P7.

### 7.2 Cross-path dependency graph

```
   P7 (refactor complete)
        │
        ├─── Electrobun (Path A) ── proof point for Path A
        │                              │
        │                              └─── Neutralino (Path A*) — extension-shim variant
        │
        ├─── Dioxus desktop + mobile (Path B) ── proof point for Path B
        │
        ├─── Flutter (Path C anchor) ──┐
        │                              │
        │              ┌───────────────┤
        │              ▼               ▼
        │       React Native      Ionic/Capacitor  (Path C reuse)
        │
        └─── (Path D deferred — see §5)
```

### 7.3 Decision gates and feasibility spikes

Each integration has a **feasibility spike** — a 3–10 day hands-on validation in [`spikes/{framework}/`](./spikes/) — that runs before committing to the full integration. Spike scope, success criteria, and timing live in `docs/decisions/`. Existing narrower decision gates remain for technical sub-questions that the spikes resolve evidence-driven.

**Feasibility spikes (one per post-refactor integration):**

| Spike | When | Detail |
|-------|------|--------|
| Electrobun (incorporates Bun NAPI audit) | During P5 | [docs/decisions/electrobun-spike.md](./docs/decisions/electrobun-spike.md) |
| Dioxus (Desktop + Mobile) | Early post-P7 | [docs/decisions/dioxus-spike.md](./docs/decisions/dioxus-spike.md) |
| Flutter | Pre-Flutter integration | [docs/decisions/flutter-spike.md](./docs/decisions/flutter-spike.md) |
| React Native | After Flutter spike | [docs/decisions/react-native-spike.md](./docs/decisions/react-native-spike.md) |
| Ionic / Capacitor | After Flutter spike | [docs/decisions/capacitor-spike.md](./docs/decisions/capacitor-spike.md) |
| Neutralino | Only if prioritized | [docs/decisions/neutralino-spike.md](./docs/decisions/neutralino-spike.md) |
| Blazor | Blocked on WASM value research | [docs/decisions/blazor-spike.md](./docs/decisions/blazor-spike.md) |
| Dioxus Web (Phase 2 of Dioxus spike) | Blocked on WASM value research + Dioxus Phase 1 | [docs/decisions/dioxus-spike.md](./docs/decisions/dioxus-spike.md) §Conditional Phase 2 |

**Other decision gates:**

| Gate | When | Detail |
|------|------|--------|
| WASM value-proposition research | During P5 | [docs/decisions/wasm-value-research.md](./docs/decisions/wasm-value-research.md) |
| flutter_rust_bridge codegen direction | Resolved by Flutter spike | [docs/decisions/frb-codegen-direction.md](./docs/decisions/frb-codegen-direction.md) |
| JSI vs TurboModule async dispatch | Resolved by RN spike | [docs/decisions/jsi-vs-turbomodule.md](./docs/decisions/jsi-vs-turbomodule.md) |
| WASM bundle size budget | Blocked — only active if WASM research returns "go" | [docs/decisions/wasm-bundle-budget.md](./docs/decisions/wasm-bundle-budget.md) |
| Neutralino approach (shim vs upstream) | Resolved by Neutralino spike | [docs/decisions/neutralino-approach.md](./docs/decisions/neutralino-approach.md) |

---

## 8. Long-term initiatives

Areas of work that open up after two or more framework integrations have shipped on the unified core.

- **Performance measurement and analysis** — cross-platform benchmarking suite, baseline + regression detection, bottleneck identification.
- **Performance optimization** — improvements driven by measurement data. Cross-boundary call batching enhancements, backpressure detection, per-platform tuning.
- **Security review** — external audit of the unified core (action validation, wire protocol, middleware sandboxing, NAPI memory safety, telemetry hardening).
- **Observability — user-facing story** — opt-in feature flags with default-off, built-in middleware presets, Sentry integration, Redux DevTools bridge. Wire format specified separately.
- **Documentation site** — single docs site replacing the GitHub-only scatter; triggered by RN/Capacitor audiences who expect it.
- **Reference apps** — cross-platform reference app concept beyond the `apps/minimal-*` pattern demos; used as performance fixtures and marketing surface.
- **Developer experience and integrations** — Redux DevTools, Sentry middleware, official middleware API docs, custom DevTools extension, time-travel debugging, community middleware.

---

## 9. Effort scale

- **XS:** 1 day
- **S:** 2–3 days
- **M:** 1 week
- **L:** 2 weeks
- **XL:** 3+ weeks

---

## 10. References

- Tracking issue: [#104 — Create UniFFI Multi-Target Core Package](https://github.com/goosewobbler/zubridge/issues/104)
- Refactor plan: [UNIFFI_REFACTOR_PLAN.md](./UNIFFI_REFACTOR_PLAN.md)
- Support and lifecycle policy: [SUPPORT.md](./SUPPORT.md)
- Framework feasibility detail: [docs/evaluations/](./docs/evaluations/)
- Decision gates: [docs/decisions/](./docs/decisions/)
- Product positioning: [docs/product.md](./docs/product.md)
