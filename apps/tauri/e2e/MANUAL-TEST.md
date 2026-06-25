# Tauri v2 — Manual Test Checklist

> Pre-release validation for `@zubridge/tauri` v2 (UniFFI refactor P4). Focuses on the
> newly-ported **scheduler / thunk / batching / subscription** paths, which currently have
> only Rust unit tests + one smoke E2E spec (`test/specs/basic-sync.spec.ts`). Findings here
> drive the automated-suite expansion (Phase 4).

## Setup

```bash
# From repo root. First run compiles the Rust plugin (slow); subsequent runs are fast.
cd apps/tauri/e2e
cross-env DEBUG=zubridge:* pnpm dev:zustand-basic   # swap mode per the matrix below
```

- Open the **webview devtools console** (renderer logs) *and* watch the **terminal** (Rust
  plugin logs) — `DEBUG=zubridge:*` traces IPC / batch / thunk lifecycle on both sides.
- Controls live in the counter panel: increment/decrement, the various "Double counter
  using …" buttons (action / main-process thunk / renderer thunk / getState-override / slow
  variants), "Apply distinctive pattern" (×3, +2, −1 → `3N+1`), subscribe/unsubscribe, and
  create/close window.
- When something looks wrong, **run the same step in the equivalent Electron minimal app** to
  decide: Tauri-specific regression vs. expected behaviour.

## Mode matrix

Run the **P0 + P1** sections in each mode; P2 once is enough. Prioritise `custom` and the
sync-handler modes — they take different code paths.

| Mode | Why it matters |
|---|---|
| `zustand-basic` | Baseline happy path |
| `zustand-handlers` | Handler-based dispatch |
| `zustand-reducers` | **Sync handlers** (different thunk variant) |
| `redux` | **Sync handlers** + Redux semantics |
| `custom` | Custom state manager — highest parity risk |

---

## P0 — Highest value (scheduler / thunk / concurrency; untested via E2E)

**Thunk correctness**

- [ ] **Main-process thunk** ("Double counter using main process thunk"): from a known value,
      counter doubles; value propagates to all open windows.
- [ ] **Renderer thunk** ("…using renderer thunk"): doubles correctly.
- [ ] **getState-override thunk** ("…with getState override"): result reflects the *overridden*
      state, not the live counter (verifies the override path).
- [ ] **Distinctive pattern** (×3, +2, −1): from value N, final == `3N+1` (e.g. 5 → 16). With
      DEBUG on, the three steps apply as one clean sequence.

**Thunk atomicity under concurrency (the key test)**

- [ ] Start a **slow** thunk (e.g. "slow main process thunk" or "distinctive pattern slowly").
      *While it runs*, rapidly click **Increment** in the **same** window. Expected (Electron
      parity): non-immediate actions queue and apply *after* the thunk; final value is
      consistent and steps don't interleave mid-pattern.
- [ ] Same, but fire the increments from a **second window** while the slow thunk runs in the
      first. Final state must be identical in both windows.
- [ ] Fire **two slow thunks** back-to-back. Verify they don't corrupt each other (sequential,
      correct final value) — parent/child + root-thunk handling.

**Action scheduling / batching**

- [ ] Rapid-fire **Increment** ~25× as fast as possible → every click lands (no dropped
      actions), final value exact. DEBUG should show batched dispatches, not 25 individual
      round-trips.
- [ ] Rapid alternating Increment/Decrement → final value matches net clicks; ordering preserved.

---

## P1 — Important (multi-window, subscriptions, errors)

**Multi-window sync**

- [ ] Open a **secondary window** (create window); both show the same counter; changes propagate
      **bidirectionally**.
- [ ] Increment to a non-zero value, *then* open a **new** window → it hydrates to the **current**
      state (not 0).
- [ ] Open **3+ windows** → all stay in sync under mixed activity.
- [ ] **Close** a window mid-activity → no errors in the others; remaining windows keep syncing
      (subscription cleanup).

**Subscriptions**

- [ ] Subscribe a window to **only `counter`** → change **theme** elsewhere → that window does
      **not** receive theme updates; counter changes still arrive.
- [ ] **Unsubscribe** → updates stop. **Re-subscribe** → updates resume.
- [ ] `getWindowSubscriptions` / the displayed subscription state reflects reality after each
      change.
- [ ] Two windows with **different** subscriptions behave independently.

**Error handling**

- [ ] Trigger **main-process error** (`ERROR:TRIGGER_MAIN_PROCESS_ERROR`) → error surfaces
      (rejected dispatch / logged), **app does not crash**, state stays consistent, and
      **subsequent actions still work**.
- [ ] Window-create error path behaves gracefully.

---

## P2 — Coverage (other state, lifecycle)

- [ ] **Theme toggle/set** propagates to all windows.
- [ ] **STATE:RESET** returns to initial state everywhere.
- [ ] **COUNTER:SET / HALVE / DOUBLE** (direct actions, non-thunk) behave correctly.
- [ ] **Reload** a window (devtools reload) → re-syncs to current state, no duplicate
      subscriptions / leaks.
- [ ] Leave the app idle a minute, then act → no stale state / no missed updates.

---

## Recording findings

For anything that fails or looks off, capture: **mode**, **steps**, **expected vs actual**,
**DEBUG log snippet** (renderer + Rust), and **whether Electron does the same**. That format
drops straight into a Phase 4 E2E spec or a bug issue.
