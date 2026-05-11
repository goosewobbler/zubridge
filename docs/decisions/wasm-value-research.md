# Decision: WASM Value-Proposition Research

> Gate for Path D (Blazor + Dioxus Web). Linked from [UNIFFI_REFACTOR_PLAN.md §1](../../UNIFFI_REFACTOR_PLAN.md) and [ROADMAP.md](../../ROADMAP.md).

## Context

Path D in the roadmap (WASM target) was originally planned to serve **Blazor WebAssembly** and **Dioxus Web**. On critical review, both are single-tab web apps where Zubridge's core value proposition (cross-process / cross-window state sync) does not strongly apply:

- **Blazor WebAssembly** is single-tab. The more compelling C# variant — **Blazor Hybrid (MAUI)** — runs C# in a native shell and does not use WASM (it would use a UniFFI path instead).
- **Blazor Server** uses SignalR for state; irrelevant to a state-management library.
- **Dioxus Web** is single-tab. Dioxus Desktop and Dioxus Mobile (Path B) are the 90% case for Dioxus.

Committing the refactor to a WASM target imposes ongoing engineering tax (avoid `std::time::Instant`, gate `tokio`, ensure no `Send + Sync`-assuming patterns, CI builds, etc.) for a hypothetical user. The decision is to **defer the WASM target until a concrete value proposition is established**, then revisit Path D.

## Decision needed

Should Zubridge invest in a WASM target — i.e., is there a real user/use-case for it?

## Owner

Core team (1 dev, ~1–2 days). Same person doing the [Electrobun spike](./electrobun-spike.md) (which incorporates the Bun NAPI audit) is the natural fit — both are "investigate-and-document" deliverables.

## When

**During P5 of the refactor**, concurrent with the Bun audit. P5 is the natural window because: (a) other "research" deliverables already land there; (b) results are available before post-refactor framework integration sequencing locks in.

## Research questions

1. **Blazor adoption and value alignment.**
   - What's the 2026 adoption trajectory for Blazor WebAssembly vs Server vs Hybrid?
   - Does Blazor Hybrid use a path that aligns with Zubridge — i.e., a native shell (UniFFI/Path C) rather than WASM?
   - If Hybrid is the compelling Blazor variant, Path D may not be the right path for Blazor at all.

2. **Dioxus Web demand.**
   - What's the split of Dioxus users between Desktop, Mobile, and Web targets?
   - Are Dioxus Web users running multi-tab apps where Zubridge's value applies?
   - Or is Dioxus Web mostly single-page demos where multi-process state sync is moot?

3. **Browser-only multi-tab state sync.**
   - Is there a real demand for cross-tab state synchronization in browser-only apps?
   - Existing solutions: SharedWorker, BroadcastChannel, IndexedDB. Does Zubridge's API add value over these?
   - Survey users of Zustand and similar libraries — do they want cross-tab sync?

4. **Other browser-resident frameworks.**
   - Solid, Svelte, Vue, Angular — do any of their user bases ask for cross-tab state management at a level that justifies a WASM-based core?
   - Pure-JS solutions (e.g., a TS-only `@zubridge/web` package) might be a better fit than WASM for these audiences.

## Acceptance criterion

A short report (under 1500 words) addressing the four research areas with concrete evidence (issue counts, community discussions, framework usage stats, etc.). Concludes with a clear **go / no-go** recommendation for Path D and rationale.

## Outcomes

**Go.** Adds Path D back to ROADMAP §4; Blazor + Dioxus Web re-promoted from "Deferred pending research" to the post-refactor integration plan; `wasm` feature scaffolded in `zubridge-core` as a separate post-P7 task (not part of the refactor itself); [`docs/decisions/wasm-bundle-budget.md`](./wasm-bundle-budget.md) unblocked. Dioxus integration scope expands to include the Web target.

**No-go.** Blazor + Dioxus Web stay in "Deferred pending research" with the rationale captured here. ROADMAP updated to reflect that Dioxus integration scope is permanently desktop + mobile only. Path D is deprecated unless a future research run reverses the conclusion. Hygiene practices (use `instant::Instant` etc.) stay in `CONTRIBUTING.md` since they have value on their own (clean Path A consumer builds).

## Risks of the research itself

- Confirmation bias: research can lean toward "go" because Path D was originally planned. Counter-bias by quantifying actual user demand (not just framework popularity).
- Underestimating retrofit cost if "no-go" is reversed later: probably ~2–4 days of focused work to add WASM scaffolding to a then-stable `zubridge-core`. Acceptable.
