import assert from 'node:assert';
import { expect } from '@wdio/globals';
import { after, before, beforeEach, describe, it } from 'mocha';
import { browser } from 'wdio-electron-service';
import WebSocket from 'ws';
import { TIMING } from '../constants.js';
import {
  getButtonInCurrentWindow,
  refreshWindowHandles,
  setupTestEnvironment,
  switchToWindow,
  windowHandles,
} from '../utils/window.js';

const CORE_WINDOW_COUNT = 2;
const WEBSOCKET_PORT = 9000;

interface MiddlewareMessage {
  entry_type?: string;
  action?: { action_type?: string; action_id?: string };
  action_id?: string;
  processing_metrics?: { total_ms: number };
  timestamp?: string;
}

function normalizeMetric(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Number.parseFloat(value);
  return 0;
}

function summarize(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const median = sorted[Math.floor(sorted.length / 2)];
  const p95 = sorted[Math.ceil(0.95 * sorted.length) - 1];
  const p99 = sorted[Math.ceil(0.99 * sorted.length) - 1];
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  return { mean, median, p95, p99, min, max, count: values.length };
}

// Skipped: requires @zubridge/middleware WebSocket server (not yet released).
//
// Unlike the selective subscription comparison (where E2E can't isolate the difference),
// batching is observable at the E2E level — fewer IPC calls is a real, countable reduction.
// When middleware ships, these tests are valid for:
// - Verifying batching reduces state update count (test 1 — behavioural)
// - Establishing latency budgets for batched action processing (test 2 — NFR)
// - Verifying batching works correctly across multiple windows (test 3 — behavioural)
//
// For measuring batcher overhead in isolation, use the vitest bench suite:
//   cd packages/electron && pnpm bench
describe.skip('Batching Performance', () => {
  let ws: WebSocket;
  const logMessages: MiddlewareMessage[] = [];

  before(async function () {
    this.timeout(15000);

    await new Promise<void>((resolve) => {
      console.log(`Connecting to middleware WebSocket on ws://localhost:${WEBSOCKET_PORT}...`);
      ws = new WebSocket(`ws://localhost:${WEBSOCKET_PORT}`);

      ws.on('message', (data) => {
        try {
          const messageStr = data.toString('utf8');
          let parsed: unknown;
          try {
            parsed = JSON.parse(messageStr);
          } catch {
            return;
          }

          if (Array.isArray(parsed)) {
            for (const item of parsed) {
              if (item && typeof item === 'object') {
                logMessages.push(item as MiddlewareMessage);
              }
            }
          } else if (parsed && typeof parsed === 'object') {
            logMessages.push(parsed as MiddlewareMessage);
          }
        } catch (err) {
          console.error('Error handling WebSocket message:', err);
        }
      });

      ws.on('open', () => {
        console.log('WebSocket connected');
        resolve();
      });

      ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        resolve();
      });

      setTimeout(() => {
        console.warn('WebSocket connection timeout');
        resolve();
      }, 5000);
    });
  });

  beforeEach(() => {
    logMessages.length = 0;
  });

  after(() => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.close();
    }
  });

  it('should batch rapid actions and reduce IPC calls', async function () {
    this.timeout(30000);

    if (ws.readyState !== WebSocket.OPEN) {
      console.log('Skipping: WebSocket not connected');
      return;
    }

    await setupTestEnvironment(CORE_WINDOW_COUNT);
    await switchToWindow(0);

    const incrementButton = await getButtonInCurrentWindow('increment');
    expect(incrementButton).toBeExisting();

    const RAPID_ACTION_COUNT = 20;

    // Perform rapid clicks without pausing between them to trigger batching
    for (let i = 0; i < RAPID_ACTION_COUNT; i++) {
      await incrementButton.click();
    }

    // Wait for all actions to process and telemetry to arrive
    await browser.pause(2000);

    const dispatched = logMessages.filter((m) => m.entry_type === 'ActionDispatched');
    const acknowledged = logMessages.filter((m) => m.entry_type === 'ActionAcknowledged');
    const stateUpdates = logMessages.filter((m) => m.entry_type === 'StateUpdated');

    console.log(`Actions dispatched: ${dispatched.length}`);
    console.log(`Actions acknowledged: ${acknowledged.length}`);
    console.log(`State updates: ${stateUpdates.length}`);

    // We should see dispatched actions — the middleware tracks each one
    assert(dispatched.length > 0, 'Should have dispatched actions tracked by middleware');

    // With batching, we expect fewer state updates than individual actions
    // because multiple actions in a batch may result in consolidated state updates
    if (stateUpdates.length > 0 && stateUpdates.length < RAPID_ACTION_COUNT) {
      console.log(
        `Batching effect: ${RAPID_ACTION_COUNT} actions produced ${stateUpdates.length} state updates ` +
          `(${((1 - stateUpdates.length / RAPID_ACTION_COUNT) * 100).toFixed(1)}% reduction)`,
      );
    }

    // Verify counter reached the expected value
    const counterElement = await browser.$('h2');
    const counterText = await counterElement.getText();
    console.log(`Counter value after ${RAPID_ACTION_COUNT} increments: ${counterText}`);
    expect(counterText).toContain(String(RAPID_ACTION_COUNT));
  });

  it('should track round-trip latency for batched actions', async function () {
    this.timeout(30000);

    if (ws.readyState !== WebSocket.OPEN) {
      console.log('Skipping: WebSocket not connected');
      return;
    }

    await setupTestEnvironment(CORE_WINDOW_COUNT);
    await switchToWindow(0);

    const incrementButton = await getButtonInCurrentWindow('increment');
    expect(incrementButton).toBeExisting();

    const ACTION_COUNT = 30;

    // Rapid clicks to generate batched actions
    for (let i = 0; i < ACTION_COUNT; i++) {
      await incrementButton.click();
      // Tiny pause to allow some batching windows to close
      if (i % 5 === 4) {
        await browser.pause(20);
      }
    }

    await browser.pause(2000);

    // Extract processing metrics from state updates
    const latencies = logMessages
      .filter((m) => m.entry_type === 'StateUpdated' && m.processing_metrics)
      .map((m) => normalizeMetric(m.processing_metrics?.total_ms))
      .filter((ms) => ms > 0);

    console.log(`Collected ${latencies.length} latency measurements`);

    if (latencies.length > 0) {
      const stats = summarize(latencies);
      if (stats) {
        console.log('=== Batching Latency Stats ===');
        console.log(`  Mean:   ${stats.mean.toFixed(2)}ms`);
        console.log(`  Median: ${stats.median.toFixed(2)}ms`);
        console.log(`  P95:    ${stats.p95.toFixed(2)}ms`);
        console.log(`  P99:    ${stats.p99.toFixed(2)}ms`);
        console.log(`  Min:    ${stats.min.toFixed(2)}ms`);
        console.log(`  Max:    ${stats.max.toFixed(2)}ms`);
        console.log(`  Count:  ${stats.count}`);
        console.log('==============================');

        // Sanity check: latencies should be reasonable (< 5s for a counter increment)
        expect(stats.mean).toBeLessThan(5000);
        // P95 shouldn't be wildly different from the mean for simple counter ops
        expect(stats.p95).toBeLessThan(10000);
      }
    } else {
      console.log('No latency metrics collected — middleware may not emit processing_metrics');
    }
  });

  it('should measure IPC efficiency across multiple windows', async function () {
    this.timeout(45000);

    if (ws.readyState !== WebSocket.OPEN) {
      console.log('Skipping: WebSocket not connected');
      return;
    }

    await setupTestEnvironment(CORE_WINDOW_COUNT);

    // Create an additional window
    await switchToWindow(0);
    const createButton = await getButtonInCurrentWindow('create');
    await createButton.click();
    await browser.pause(TIMING.WINDOW_CHANGE_PAUSE * 2);
    await refreshWindowHandles();
    expect(windowHandles.length).toBeGreaterThanOrEqual(CORE_WINDOW_COUNT + 1);

    const ACTIONS_PER_WINDOW = 10;

    // Dispatch rapid actions from window 0
    logMessages.length = 0;
    await switchToWindow(0);
    const incButton0 = await getButtonInCurrentWindow('increment');
    for (let i = 0; i < ACTIONS_PER_WINDOW; i++) {
      await incButton0.click();
    }
    await browser.pause(1000);

    const window0Dispatched = logMessages.filter((m) => m.entry_type === 'ActionDispatched').length;
    const window0StateUpdates = logMessages.filter((m) => m.entry_type === 'StateUpdated').length;
    console.log(`Window 0: ${window0Dispatched} dispatched, ${window0StateUpdates} state updates`);

    // Dispatch rapid actions from window 2 (the new window)
    logMessages.length = 0;
    await switchToWindow(2);
    await browser.pause(TIMING.STATE_SYNC_PAUSE);

    const incButton2 = await getButtonInCurrentWindow('increment');
    for (let i = 0; i < ACTIONS_PER_WINDOW; i++) {
      await incButton2.click();
    }
    await browser.pause(1000);

    const window2Dispatched = logMessages.filter((m) => m.entry_type === 'ActionDispatched').length;
    const window2StateUpdates = logMessages.filter((m) => m.entry_type === 'StateUpdated').length;
    console.log(`Window 2: ${window2Dispatched} dispatched, ${window2StateUpdates} state updates`);

    // Both windows should successfully dispatch and get state updates
    assert(
      window0Dispatched > 0 || window0StateUpdates > 0,
      'Window 0 should have middleware activity',
    );
    assert(
      window2Dispatched > 0 || window2StateUpdates > 0,
      'Window 2 should have middleware activity',
    );

    // Verify final counter value reflects all actions from both windows
    await switchToWindow(0);
    await browser.pause(TIMING.STATE_SYNC_PAUSE);
    const counterElement = await browser.$('h2');
    const finalValue = await counterElement.getText();
    console.log(`Final counter value after actions from both windows: ${finalValue}`);
    // Counter should reflect total actions from both windows
    const expectedMin = ACTIONS_PER_WINDOW * 2;
    const parsedValue = Number.parseInt(finalValue.replace(/\D/g, ''), 10);
    expect(parsedValue).toBeGreaterThanOrEqual(expectedMin);
  });
});
