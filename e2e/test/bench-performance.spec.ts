// Performance bench. Excluded from the regular E2E run (see wdio.conf.ts
// `exclude`) and invoked via the `test:bench:*` scripts. Each run produces
// `benches/raw/<MODE>.json`; `scripts/bench-aggregate.ts` combines those into
// `benches/baseline.json` for the v3.0 (TS core) baseline.
//
// Measurement is renderer-side using `performance.now()` around `dispatch()`,
// which resolves on `DISPATCH_ACK` (full IPC round-trip). The bench does not
// rely on internal instrumentation — same methodology will run unchanged
// against 3.2 (Rust core via NAPI) to produce the comparison story.

import { after, before, describe, it } from 'mocha';
import { browser } from 'wdio-electron-service';
import { getMode, type ModeBenchResult, summarize, writeModeResult } from '../utils/bench.js';
import {
  refreshWindowHandles,
  setupTestEnvironment,
  switchToWindow,
  waitUntilWindowsAvailable,
  windowHandles,
} from '../utils/window.js';

const CORE_WINDOW_COUNT = 2;

// Sample sizes — small enough to keep each WDIO run under a minute, large
// enough to give stable percentiles. Adjust upward if variance is too high.
const LATENCY_SAMPLES = 500;
const LATENCY_WARMUP = 50;
const THROUGHPUT_ACTIONS = 5000;
const PROPAGATION_SAMPLES = 100;
const MEMORY_LOAD_ACTIONS = 10000;

// `window.zubridge` is already typed via @zubridge/types' internal augmentation
// (ZubridgeInternalWindow). We add only the bench-scratch properties.
//
// `ts` here is `Date.now()` (wall-clock ms since epoch), NOT `performance.now()`.
// The multi-window propagation test compares timestamps captured in different
// renderer processes; each renderer has its own `performance.timeOrigin`, so
// `performance.now()` values are not comparable across contexts. `Date.now()` is
// the same absolute clock everywhere.
interface BenchWindow {
  __benchUpdates: Array<{ ts: number; counter: number }>;
  __benchUnsub: () => void;
}

describe(`Performance bench (${getMode()})`, () => {
  const result: ModeBenchResult = {
    mode: getMode(),
    capturedAt: new Date().toISOString(),
    platform: process.platform,
  };

  before(async function () {
    this.timeout(60000);
    await waitUntilWindowsAvailable(CORE_WINDOW_COUNT);
  });

  after(() => {
    // Guard against writing a partial result if every `it` block aborted (timeout,
    // crash). bench-aggregate.ts would otherwise silently accept the half-empty file
    // and stamp a baseline that treats the missing metrics as 0.
    const hasAnyMetric =
      result.dispatchRoundTrip !== undefined ||
      result.throughput !== undefined ||
      result.multiWindowPropagation !== undefined ||
      result.memory !== undefined;
    if (!hasAnyMetric) {
      console.log('\nSkipping bench result write — no metrics were captured.');
      return;
    }
    const file = writeModeResult(result);
    console.log(`\nWrote bench result to ${file}`);
    console.log(JSON.stringify(result, null, 2));
  });

  it('measures dispatch round-trip latency', async function () {
    this.timeout(120000);
    await setupTestEnvironment(CORE_WINDOW_COUNT);
    await switchToWindow(0);

    const latencies = await browser.execute(
      async (samples: number, warmup: number) => {
        const z = window.zubridge;
        if (!z) throw new Error('window.zubridge not available');
        for (let i = 0; i < warmup; i++) {
          await z.dispatch('COUNTER:INCREMENT');
        }
        const out: number[] = [];
        for (let i = 0; i < samples; i++) {
          const t0 = performance.now();
          await z.dispatch('COUNTER:INCREMENT');
          out.push(performance.now() - t0);
        }
        return out;
      },
      LATENCY_SAMPLES,
      LATENCY_WARMUP,
    );

    result.dispatchRoundTrip = summarize(latencies);
    console.log('dispatchRoundTrip:', result.dispatchRoundTrip);
  });

  it('measures sustained throughput', async function () {
    this.timeout(120000);
    await setupTestEnvironment(CORE_WINDOW_COUNT);
    await switchToWindow(0);

    const measurement = await browser.execute(async (count: number) => {
      const z = window.zubridge;
      if (!z) throw new Error('window.zubridge not available');
      const t0 = performance.now();
      const promises: Promise<unknown>[] = [];
      for (let i = 0; i < count; i++) {
        promises.push(z.dispatch('COUNTER:INCREMENT'));
      }
      await Promise.all(promises);
      const elapsedMs = performance.now() - t0;
      return { count, elapsedMs };
    }, THROUGHPUT_ACTIONS);

    result.throughput = {
      actions: measurement.count,
      elapsedMs: Math.round(measurement.elapsedMs * 1000) / 1000,
      actionsPerSec: Math.round((measurement.count / measurement.elapsedMs) * 1000),
    };
    console.log('throughput:', result.throughput);
  });

  it('measures multi-window state propagation latency', async function () {
    this.timeout(180000);
    await setupTestEnvironment(CORE_WINDOW_COUNT);
    await refreshWindowHandles();
    if (windowHandles.length < CORE_WINDOW_COUNT) {
      throw new Error(`expected >= ${CORE_WINDOW_COUNT} windows, found ${windowHandles.length}`);
    }

    // Subscribe in window 1, recording timestamp + counter on every update.
    // Use Date.now() (shared absolute clock) — performance.now() is per-context.
    await switchToWindow(1);
    await browser.execute(() => {
      const w = window as unknown as BenchWindow & typeof window;
      const z = window.zubridge;
      if (!z) throw new Error('window.zubridge not available');
      w.__benchUpdates = [];
      w.__benchUnsub = z.subscribe((state: { counter?: number }) => {
        if (typeof state.counter === 'number') {
          w.__benchUpdates.push({ ts: Date.now(), counter: state.counter });
        }
      });
    });

    // Read starting counter so we can match dispatches to receipts by target value.
    const startState = await browser.execute(() => {
      const z = window.zubridge;
      if (!z) throw new Error('window.zubridge not available');
      return z.getState();
    });
    const startCounter =
      typeof (startState as { counter?: number }).counter === 'number'
        ? (startState as { counter: number }).counter
        : 0;

    // Dispatch one action at a time from window 0, recording the renderer-side
    // dispatch timestamp. Date.now() (not performance.now()) so the timestamp is
    // comparable to the window-1 receipt timestamps. Small pause between dispatches
    // keeps each one out of the batcher's 16ms window so we measure propagation
    // per-action.
    await switchToWindow(0);
    const dispatches = await browser.execute(
      async (samples: number, base: number) => {
        const z = window.zubridge;
        if (!z) throw new Error('window.zubridge not available');
        const out: Array<{ ts: number; target: number }> = [];
        for (let i = 0; i < samples; i++) {
          const target = base + i + 1;
          const t0 = Date.now();
          await z.dispatch('COUNTER:INCREMENT');
          out.push({ ts: t0, target });
          await new Promise((r) => setTimeout(r, 25));
        }
        return out;
      },
      PROPAGATION_SAMPLES,
      startCounter,
    );

    // Wait for the last update to land, then collect window-1 receipt timestamps.
    await browser.pause(1000);
    await switchToWindow(1);
    const receipts = await browser.execute(() => {
      const w = window as unknown as BenchWindow & typeof window;
      w.__benchUnsub?.();
      const updates = w.__benchUpdates ?? [];
      w.__benchUpdates = [];
      return updates;
    });

    // Match dispatches to the first window-1 receipt for the same target counter.
    const propagationLatencies: number[] = [];
    for (const d of dispatches) {
      const r = receipts.find((u) => u.counter === d.target);
      if (r) {
        propagationLatencies.push(r.ts - d.ts);
      }
    }

    if (propagationLatencies.length === 0) {
      throw new Error(
        `propagation bench: 0/${dispatches.length} dispatches matched a receipt — ` +
          'state may not be propagating to window 1, or counter values did not match. ' +
          'Check that window 1 subscribe is active and the counter starts from the expected value.',
      );
    }

    result.multiWindowPropagation = summarize(propagationLatencies);
    console.log(
      `multiWindowPropagation (matched ${propagationLatencies.length}/${dispatches.length}):`,
      result.multiWindowPropagation,
    );
  });

  it('measures heap growth under sustained load', async function () {
    this.timeout(120000);
    await setupTestEnvironment(CORE_WINDOW_COUNT);
    await switchToWindow(0);

    // Heap from the Electron main process — most representative for backend cost.
    // Note: this only captures the Node heap; native allocations (V8 internals,
    // C++ structures held by Electron, Rust core in 3.2+) are not measured.
    //
    // --expose-gc must be set at Electron startup to make global.gc available;
    // app.commandLine.appendSwitch after app.ready is a silent no-op. The current
    // bench builds do not pass it, so global.gc is undefined and we skip the GC —
    // heap numbers will include allocations from prior tests in the same process.
    // This is acceptable because we report the delta (after − before), not absolute,
    // and the 10k-action load swamps any pre-existing residue.
    const heapBeforeBytes = await browser.electron.execute(() => {
      if (typeof global.gc === 'function') {
        global.gc();
      }
      return process.memoryUsage().heapUsed;
    });

    await browser.execute(async (count: number) => {
      const z = window.zubridge;
      if (!z) throw new Error('window.zubridge not available');
      const promises: Promise<unknown>[] = [];
      for (let i = 0; i < count; i++) {
        promises.push(z.dispatch('COUNTER:INCREMENT'));
      }
      await Promise.all(promises);
    }, MEMORY_LOAD_ACTIONS);

    const heapAfterBytes = await browser.electron.execute((_electron) => {
      if (typeof global.gc === 'function') {
        global.gc();
      }
      return process.memoryUsage().heapUsed;
    });

    result.memory = {
      heapBeforeBytes,
      heapAfterBytes,
      heapDeltaBytes: heapAfterBytes - heapBeforeBytes,
      note: 'Electron main-process Node heap only; native allocations not measured. Becomes more important at 3.2 when the Rust core lands — track delta direction, not absolute size.',
    };
    console.log('memory:', result.memory);
  });
});
