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

// Batching is a renderer→main transport optimization: N actions dispatched within the
// batch window (default 16ms) are sent as 1 IPC call instead of N. However, the main
// process still dispatches each action individually, so middleware sees N ActionDispatched
// and N StateUpdated events regardless of batching. The IPC reduction is not directly
// observable via middleware telemetry.
//
// These tests validate:
// - Correctness under rapid synchronous dispatch (test 1 — exercises batch transport path)
// - Establishing latency budgets for action processing (test 2 — NFR)
// - Cross-window dispatch and state sync correctness (test 3 — behavioural)
//
// For measuring IPC call reduction and batcher overhead in isolation, use the vitest bench suite:
//   cd packages/electron && pnpm bench
//
// Note: requires @zubridge/middleware WebSocket server on port 9000.
// Tests gracefully skip middleware-dependent assertions when middleware is unavailable.
describe('Batching Performance', () => {
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

  it('should process rapid synchronous dispatches correctly via batch transport', async function () {
    this.timeout(30000);

    await setupTestEnvironment(CORE_WINDOW_COUNT);
    await switchToWindow(0);

    const RAPID_ACTION_COUNT = 20;

    // Dispatch actions synchronously from within the renderer to exercise the batch
    // transport path. All dispatches happen within a single JS task (well within the
    // 16ms batch window), so the ActionBatcher groups them into a single IPC call.
    // The main process still processes each action individually, so state updates = N.
    await browser.execute((count) => {
      const zubridge = (window as { zubridge?: { dispatch: (action: string) => void } }).zubridge;
      if (!zubridge) throw new Error('zubridge handlers not found on window');
      for (let i = 0; i < count; i++) {
        zubridge.dispatch('COUNTER:INCREMENT');
      }
    }, RAPID_ACTION_COUNT);

    // Wait for all actions to process
    await browser.pause(3000);

    // Primary assertion: all actions were processed correctly through the batch transport
    const counterElement = await browser.$('h2');
    const counterText = await counterElement.getText();
    console.log(`Counter value after ${RAPID_ACTION_COUNT} synchronous dispatches: ${counterText}`);
    const counterValue = Number.parseInt(counterText.replace(/\D/g, ''), 10);
    expect(counterValue).toBeGreaterThanOrEqual(RAPID_ACTION_COUNT);

    // Secondary: verify middleware tracked all dispatches (when available)
    if (ws?.readyState === WebSocket.OPEN) {
      const dispatched = logMessages.filter((m) => m.entry_type === 'ActionDispatched');
      const stateUpdates = logMessages.filter((m) => m.entry_type === 'StateUpdated');
      console.log(
        `Middleware: ${dispatched.length} dispatched, ${stateUpdates.length} state updates`,
      );

      if (dispatched.length > 0) {
        // All N actions should be tracked — batching is transport-level only
        expect(dispatched.length).toBeGreaterThanOrEqual(RAPID_ACTION_COUNT);
      }
    }
  });

  it('should track round-trip latency for actions', async function () {
    this.timeout(30000);

    if (ws.readyState !== WebSocket.OPEN) {
      console.log('Skipping: WebSocket not connected');
      return;
    }

    await setupTestEnvironment(CORE_WINDOW_COUNT);
    await switchToWindow(0);

    const ACTION_COUNT = 30;

    // Use click-based dispatches for latency measurement since each action
    // completes its full round-trip before the next one starts
    const incrementButton = await getButtonInCurrentWindow('increment');
    expect(incrementButton).toBeExisting();

    for (let i = 0; i < ACTION_COUNT; i++) {
      await incrementButton.click();
    }

    await browser.pause(2000);

    // Extract processing metrics from state updates (if middleware emits them)
    const latencies = logMessages
      .filter((m) => m.entry_type === 'StateUpdated' && m.processing_metrics)
      .map((m) => normalizeMetric(m.processing_metrics?.total_ms))
      .filter((ms) => ms > 0);

    console.log(`Collected ${latencies.length} latency measurements`);

    if (latencies.length > 0) {
      const stats = summarize(latencies);
      if (stats) {
        console.log('=== Action Latency Stats ===');
        console.log(`  Mean:   ${stats.mean.toFixed(2)}ms`);
        console.log(`  Median: ${stats.median.toFixed(2)}ms`);
        console.log(`  P95:    ${stats.p95.toFixed(2)}ms`);
        console.log(`  P99:    ${stats.p99.toFixed(2)}ms`);
        console.log(`  Min:    ${stats.min.toFixed(2)}ms`);
        console.log(`  Max:    ${stats.max.toFixed(2)}ms`);
        console.log(`  Count:  ${stats.count}`);
        console.log('============================');

        // NFR: action processing should be under 100ms for simple counter increments
        expect(stats.mean).toBeLessThan(100);
        expect(stats.p95).toBeLessThan(500);
      }
    } else {
      // processing_metrics not available — log state update count as a basic health check
      const stateUpdates = logMessages.filter((m) => m.entry_type === 'StateUpdated');
      console.log(
        `No processing_metrics in middleware output. State updates received: ${stateUpdates.length}`,
      );
      // Still verify we got state updates as a baseline assertion
      expect(stateUpdates.length).toBeGreaterThan(0);
    }
  });

  it('should dispatch and sync state correctly across multiple windows', async function () {
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
    const parsedValue = Number.parseInt(finalValue.replace(/\D/g, ''), 10);
    expect(parsedValue).toBeGreaterThanOrEqual(ACTIONS_PER_WINDOW * 2);
  });
});
