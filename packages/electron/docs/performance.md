# Performance

This document summarizes the performance characteristics of `@zubridge/electron`, based on vitest bench measurements. Run `pnpm bench` in the electron package to reproduce these benchmarks on your system.

## Action Batching

The `ActionBatcher` groups renderer-side actions dispatched within a configurable time window (default 16ms) into a single IPC call. The benchmarks measure batcher overhead using mock send functions — real IPC latency depends on Electron's process communication and is not captured here.

### IPC Call Reduction

Batching is deterministic: N actions enqueued within one batch window produce 1 `sendBatch` call instead of N individual calls.

### Batcher Throughput

The enqueue-and-flush cycle adds minimal overhead per action. Typical results:

| Scenario | Throughput |
|----------|------------|
| 10 actions enqueue + flush | ~100K+ ops/sec |
| 100 actions enqueue + flush | ~10K+ ops/sec |

### Priority Flush

High-priority actions (`immediate`, priority 100) trigger an immediate flush. The overhead of immediate flush vs normal queued dispatch is negligible.

## Selective Subscriptions vs Full State

Selective subscriptions allow windows to subscribe to specific state keys instead of the full state tree. The performance impact depends on which stage of the notification pipeline you measure.

### Pipeline Stages

When state changes, the notification pipeline executes these stages in order:

1. **`hasRelevantChange`** — Checks whether subscribed keys changed (uses `dequal` deep comparison for selective; returns `true` immediately for full-state subscriptions)
2. **`getPartialState`** — Extracts the subscribed subset of state (shallow spread for full-state; `deepGet` + `setDeep` per key for selective)
3. **`sanitizeState`** — Recursively walks the state object to strip functions and non-serializable values before IPC
4. **Electron IPC** — `webContents.send()` performs structured clone serialization (not measured in unit benchmarks)

### Stage-by-Stage Results

**`getPartialState`**: Full state is slightly faster (~10-28%) because `{ ...state }` is a single shallow spread, while selective keys require `deepGet` + `setDeep` per key. This stage does not benefit from selective subscriptions.

**`sanitizeState`**: This is where selective subscriptions have the largest impact, because it recursively walks the entire object tree:

| State Size | Full State | Partial State | Speedup |
|-----------|-----------|--------------|---------|
| Small (3 keys) | ~1.8M ops/sec | ~4.2M ops/sec | ~2x |
| Medium (~100 items) | ~15K ops/sec | ~1.3M ops/sec | ~87x |
| Large (1000 nested objects) | ~1K ops/sec | ~1.8M ops/sec | ~1,600x |

**Full notify + sanitize pipeline** (realistic end-to-end within JS, excluding Electron IPC):

| Scenario | Full State | Selective (1 key) | Speedup |
|----------|-----------|-------------------|---------|
| Medium state, 1 subscriber | ~7.4K ops/sec | ~14K ops/sec | ~1.9x |
| Large state, 1 subscriber | ~560 ops/sec | ~1.2K ops/sec | ~2.2x |
| Large state, 5 subscribers | ~137 ops/sec | ~417 ops/sec | ~3x |

### Real-World Impact

The vitest benchmarks measure JS-level overhead in isolation. In a real Electron app, each state update also passes through Electron's IPC layer (`webContents.send()`), which performs structured clone serialization on the sanitized output. This adds a fixed cost per update that is independent of whether the state was selectively filtered.

**Why E2E measurements don't show a difference**: We attempted to measure the selective-vs-full difference using E2E tests with middleware telemetry (`processing_metrics.total_ms`). The results showed no statistically significant difference between subscription patterns, even with XL state (1000 increments, multiple subscription patterns). This is because the middleware measures wall-clock time for the entire action→state-update cycle, which includes Electron IPC overhead that dwarfs the JS-level savings.

**Where the savings go**: The `sanitizeState` speedup (up to 1,600x for large state) translates to reduced main-process CPU time per notify cycle. For a concrete example with large state and 5 subscriber windows:

| Subscription | JS time per notify | At 60 dispatches/sec |
|-------------|-------------------|---------------------|
| Full state (all windows) | ~7.3ms | ~438ms/sec of main-thread time |
| Selective (1 key per window) | ~2.7ms | ~162ms/sec of main-thread time |
| Mixed (3 full + 2 selective) | ~6.0ms | ~360ms/sec of main-thread time |

This matters when:
- State is large (hundreds of nested objects or more)
- Dispatch frequency is high (e.g., real-time data, animations, frequent user input)
- Multiple windows are subscribed simultaneously
- Main-process responsiveness is critical (the main process also handles window management, menus, system tray, etc.)

For small-to-medium state (the common case for most Electron apps), both paths complete in microseconds and the difference is imperceptible.

### Recommendation

Use selective subscriptions for **separation of concerns** — restricting renderer access to only the state it needs. This is the primary benefit. Performance gains are a bonus that only becomes meaningful with large state trees and high update frequencies.

## E2E Performance Testing

The E2E test suite (`e2e/test/middleware-logging.spec.ts`) includes a middleware-based performance measurement that collects `processing_metrics.total_ms` via WebSocket. This measures wall-clock time for the full action→state-update cycle in the main process.

This approach is **not suitable** for comparing selective subscriptions vs full state — the JS-level difference is too small relative to the IPC overhead and measurement noise. However, it is valid for:

- **Regression detection**: Establishing a baseline for main-process action processing time and alerting when a code change causes it to degrade beyond a threshold
- **Latency budgets**: Verifying that the full round-trip stays within an acceptable bound (e.g., "a counter increment with XL state should process in < Nms")
- **Scaling behaviour**: Measuring how processing time changes as state size or subscriber count increases, to catch non-linear degradation

These tests depend on the `@zubridge/middleware` package (not yet released) and are currently skipped.

## Action Priority System

Zubridge uses a unified priority system across both the renderer process (ActionBatcher) and main process (ActionScheduler) to ensure actions are processed in the correct order while respecting concurrency constraints.

### Priority Levels

The system defines four priority levels in `PRIORITY_LEVELS` (from `@zubridge/electron/batching/types`):

| Priority | Value | Description | Example |
|----------|-------|-------------|---------|
| `BYPASS_THUNK_LOCK` | 100 | Actions with `__bypassThunkLock` flag that skip all queuing | Critical system actions, UI updates during long operations |
| `ROOT_THUNK_ACTION` | 70 | Actions dispatched by the currently active root thunk | Actions within a running thunk's execution context |
| `NORMAL_THUNK_ACTION` | 50 | Actions dispatched by thunks (general case) | Most thunk-dispatched actions |
| `NORMAL_ACTION` | 0 | Regular actions without special flags | Standard user actions, simple state updates |

### How Priority Works in ActionBatcher (Renderer)

The `ActionBatcher` in the renderer process uses priorities to:

1. **Determine immediate flush**: Actions with priority ≥ `priorityFlushThreshold` (default: 80) trigger an immediate batch send
2. **Queue ordering**: Higher priority actions are processed first within a batch window

```typescript
// In renderer process
import { calculatePriority } from '@zubridge/electron/batching';

const action = { type: 'UPDATE', __bypassThunkLock: true };
const priority = calculatePriority(action); // Returns 100

batcher.enqueue(action, resolve, reject, priority);
// This immediately flushes due to high priority
```

### How Priority Works in ActionScheduler (Main)

The `ActionScheduler` in the main process uses priorities to:

1. **Queue management during thunk execution**: When a thunk is running, lower-priority actions are queued
2. **Overflow handling**: If the queue fills up, actions with priority < 50 are dropped first
3. **Execution ordering**: Queued actions are sorted by priority (highest first), then by arrival time

The main process priority calculation is **context-aware**:

```typescript
// ActionScheduler checks if a thunk action belongs to the ACTIVE root thunk
const rootThunkId = this.thunkManager.getRootThunkId();
if (rootThunkId && action.__thunkParentId === rootThunkId) {
  return PRIORITY_LEVELS.ROOT_THUNK_ACTION; // 70
}
```

This means:
- Actions from the **active** root thunk get priority 70
- Actions from **other** thunks (queued for later) get priority 50
- The renderer's `calculatePriority` returns 70 for **all** thunk actions since it doesn't know which thunk is active

### Priority System Example

Consider this scenario with Window A running a thunk while Window B tries to dispatch actions:

```typescript
// Window A - runs a thunk
dispatch(async (getState, dispatch) => {
  dispatch({ type: 'STEP_1' }); // Priority: 70 (active root thunk)
  await delay(1000);
  dispatch({ type: 'STEP_2' }); // Priority: 70 (active root thunk)
});

// Window B - during the thunk above
dispatch({ type: 'NORMAL_UPDATE' });
// Priority: 0 → queued behind Window A's thunk

dispatch({ type: 'URGENT' }, { bypassThunkLock: true });
// Priority: 100 → executes immediately, bypassing queue
```

**Execution order:**
1. Window A: `STEP_1` (70) - executes immediately (belongs to active thunk)
2. Window B: `URGENT` (100) - executes immediately (bypass flag)
3. Window A: `STEP_2` (70) - executes when thunk resumes
4. Window B: `NORMAL_UPDATE` (0) - executes after Window A's thunk completes

### Priority in Queue Overflow

When the ActionScheduler queue reaches capacity (default: 1000 actions), the overflow handler drops low-priority actions first:

- **Droppable**: Actions with priority < 50 (NORMAL_ACTION)
- **Protected**: Actions with priority ≥ 50 (thunk actions, bypass actions)

```typescript
// Queue at capacity (1000 actions)
dispatch({ type: 'LOW_PRIORITY' }); // Priority 0 - may be dropped
dispatch({ type: 'THUNK_ACTION', __thunkParentId: 'x' }); // Priority 50+ - protected
```

### When to Use Priority Flags

**Use `bypassThunkLock: true` when:**
- An action must execute immediately regardless of running thunks
- Example: Critical UI updates, cancellation signals, error recovery

```typescript
dispatch({ type: 'CANCEL_OPERATION' }, { bypassThunkLock: true });
```

**Avoid using bypass flags for:**
- Regular state updates that can wait
- Actions that depend on thunk completion
- Bulk operations that should be queued

### Priority and Batching Interaction

When batching is enabled, priorities work across both systems:

1. **Renderer**: `ActionBatcher` groups actions by batch window, but high-priority actions trigger immediate flush
2. **IPC**: The batch is sent to the main process with per-action priority metadata
3. **Main**: `ActionScheduler` respects the priority when deciding whether to execute or queue the batch

```typescript
// In a thunk with batching enabled
void dispatch.batch({ type: 'UPDATE_1' }); // Priority 70, batched
void dispatch.batch({ type: 'UPDATE_2' }); // Priority 70, batched
void dispatch.batch({ type: 'URGENT', __bypassThunkLock: true }); // Priority 100, flushes immediately

// The flush sends a batch with mixed priorities, and ActionScheduler processes each action by priority
```

### Implementation Details

The priority system is implemented in:

- **Types**: `packages/electron/src/batching/types.ts` - `PRIORITY_LEVELS` constants
- **Renderer**: `packages/electron/src/batching/ActionBatcher.ts` - `calculatePriority()` function
- **Main**: `packages/electron/src/action/ActionScheduler.ts` - `getPriorityForAction()` method

Both implementations use the same constants for consistency, but the main process has additional context about the active thunk hierarchy.

## Running Benchmarks

```bash
cd packages/electron
pnpm bench
```

This runs all benchmark files in `benchmarks/` using vitest's built-in bench runner, which reports ops/sec, p75, p99, and statistical variance.

## Related Documentation

- [Validation](./validation.md) - Action validation rules, limits, and security
- [Thunks](./thunks.md) - Async action handling and priority
- [Security Review](./SECURITY_PERFORMANCE_REVIEW.md) - Security and performance analysis
