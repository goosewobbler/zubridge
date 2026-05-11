# Spikes

This directory holds hands-on feasibility spike apps for post-refactor framework integrations. Each spike is scoped at 3–10 days and produces a working "hello world" + state-sync demo for a candidate framework, validating that:

1. The integration is technically feasible (compiles, runs, no fundamental blockers)
2. The developer ergonomics match `@zubridge/electron` / `@zubridge/tauri` quality
3. Zubridge's value proposition (cross-process / cross-window state sync) lands for that framework's audience

Each spike has a corresponding decision document in [`docs/decisions/`](../docs/decisions/) defining scope, success criteria, owner, and timing. When a spike completes:

- **Go** — the spike code seeds the full integration in `packages/{framework}/`
- **No-go** — the spike code is archived; rationale captured in the decision doc; ROADMAP updated

## Active spikes

| Framework | Spike doc | When | Status |
|-----------|-----------|------|--------|
| Electrobun | [electrobun-spike.md](../docs/decisions/electrobun-spike.md) | During P5 (with Bun audit) | Not started |
| Dioxus (Desktop + Mobile) | [dioxus-spike.md](../docs/decisions/dioxus-spike.md) | Early post-P7 | Not started |
| Flutter | [flutter-spike.md](../docs/decisions/flutter-spike.md) | Pre-Flutter integration | Not started |
| React Native | [react-native-spike.md](../docs/decisions/react-native-spike.md) | After Flutter spike | Not started |
| Ionic / Capacitor | [capacitor-spike.md](../docs/decisions/capacitor-spike.md) | After Flutter spike | Not started |
| Neutralino | [neutralino-spike.md](../docs/decisions/neutralino-spike.md) | Only if prioritized | Not scheduled |

## Conditional spikes — blocked on WASM value research

These spikes are only scheduled if [`wasm-value-research.md`](../docs/decisions/wasm-value-research.md) returns "go." If "no-go," they are archived.

| Framework | Spike doc | Trigger |
|-----------|-----------|---------|
| Blazor | [blazor-spike.md](../docs/decisions/blazor-spike.md) | WASM research = "go" + Path D scaffolding landed |
| Dioxus Web (Phase 2 of Dioxus spike) | [dioxus-spike.md §"Conditional Phase 2"](../docs/decisions/dioxus-spike.md) | WASM research = "go" + Path D scaffolding landed + Dioxus spike Phase 1 passed |

## Spike code conventions

- Each spike lives in `spikes/{framework}/` — flat directory, no nested packages
- Keep it minimal: one app, one wrapper, no production polish
- Pin dependency versions explicitly in the spike's manifest
- A spike is **complete** when its decision doc is updated with findings and a go/no-go conclusion

## Relationship to other directories

- [`apps/`](../apps/) — full-featured example apps for shipped integrations (Electron, Tauri)
- [`packages/`](../packages/) — production integration code
- [`examples/`](../examples/) — reference examples for users
- [`spikes/`](.) — experimental, time-boxed feasibility validation

When a spike's integration ships, its code typically moves out of `spikes/` and into one of the other directories. `spikes/` should only hold in-progress or recently-completed work awaiting cleanup.
