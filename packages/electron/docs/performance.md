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

High-priority actions (`__bypassThunkLock`, priority 100) trigger an immediate flush. The overhead of immediate flush vs normal queued dispatch is negligible.

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

## Running Benchmarks

```bash
cd packages/electron
pnpm bench
```

This runs all benchmark files in `benchmarks/` using vitest's built-in bench runner, which reports ops/sec, p75, p99, and statistical variance.
