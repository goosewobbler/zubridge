// Shared utilities for the performance bench suite (`bench-performance.spec.ts`).
//
// Results from each mode-specific WDIO run are written to
// `<repo-root>/benches/raw/<mode>.json`. The aggregator script
// `scripts/bench-aggregate.ts` combines those per-mode files into a single
// `benches/baseline.json` published as the v3.0 (TS core) baseline.

import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

export interface LatencySummary {
  samples: number;
  mean: number;
  p50: number;
  p95: number;
  p99: number;
  min: number;
  max: number;
}

export interface ThroughputResult {
  actions: number;
  elapsedMs: number;
  actionsPerSec: number;
}

export interface MemoryResult {
  heapBeforeBytes: number;
  heapAfterBytes: number;
  heapDeltaBytes: number;
  /** Reminder that this only captures the Node heap; native allocations are not measured. */
  note: string;
}

export interface ModeBenchResult {
  mode: string;
  capturedAt: string;
  platform: NodeJS.Platform;
  dispatchRoundTrip?: LatencySummary;
  throughput?: ThroughputResult;
  multiWindowPropagation?: LatencySummary;
  memory?: MemoryResult;
}

export function summarize(latencies: number[]): LatencySummary {
  if (latencies.length === 0) {
    return { samples: 0, mean: 0, p50: 0, p95: 0, p99: 0, min: 0, max: 0 };
  }
  const sorted = [...latencies].sort((a, b) => a - b);
  const mean = latencies.reduce((acc, n) => acc + n, 0) / latencies.length;
  const percentile = (p: number) =>
    sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)];
  return {
    samples: latencies.length,
    mean: roundTo(mean, 3),
    p50: roundTo(percentile(0.5), 3),
    p95: roundTo(percentile(0.95), 3),
    p99: roundTo(percentile(0.99), 3),
    min: roundTo(sorted[0], 3),
    max: roundTo(sorted[sorted.length - 1], 3),
  };
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const RAW_DIR = path.join(REPO_ROOT, 'benches', 'raw');

export function writeModeResult(result: ModeBenchResult): string {
  fs.mkdirSync(RAW_DIR, { recursive: true });
  const file = path.join(RAW_DIR, `${result.mode}.json`);
  fs.writeFileSync(file, `${JSON.stringify(result, null, 2)}\n`);
  return file;
}

export function getMode(): string {
  return process.env.MODE ?? 'unknown';
}
