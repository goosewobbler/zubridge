import { browser } from '@wdio/globals';
import { beforeEach, describe, it } from 'mocha';
import { getCounterValue, resetCounter, waitForCounterValue } from '../utils/counter.js';
import { setupTestEnvironment, switchToWindow } from '../utils/window.js';

// Exercises the Rust *backend* thunk (execute_main_thunk / _slow): a thunk
// authored in Rust, registered + driven through the core scheduler, dispatching
// DOUBLE/DOUBLE/HALVE (net x2) with updates propagating to every webview.
describe('Tauri Backend (Main) Thunk', () => {
  beforeEach(async () => {
    await setupTestEnvironment();
    await resetCounter();
  });

  const seedTo = async (value: number) => {
    const inc = await browser.$('[aria-label="Increment counter"]');
    for (let i = 0; i < value; i++) {
      await inc.click();
    }
    await waitForCounterValue(value);
  };

  it('doubles the counter via the backend thunk and propagates to the secondary window', async () => {
    await switchToWindow('main');
    await seedTo(5);

    const btn = await browser.$('[aria-label="Double counter using main process thunk"]');
    await btn.click();
    // 5 -> 10 -> 20 -> 10. The final value (10) also appears after the first
    // DOUBLE, so wait for it then let the thunk settle (it must not still be
    // running when the next test's resetCounter runs).
    await waitForCounterValue(10);
    await browser.pause(600);
    const settled = await getCounterValue();
    if (settled !== 10) {
      throw new Error(`expected backend thunk to settle the counter at 10, got ${settled}`);
    }

    await switchToWindow('secondary');
    await waitForCounterValue(10);
  });

  it('blocks concurrent actions while a slow backend thunk runs, then drains them', async () => {
    await switchToWindow('main');
    await seedTo(5);

    // Kick off the slow backend thunk (registers a thunk -> active root).
    const slowBtn = await browser.$('[aria-label="Double counter using slow main process thunk"]');
    await slowBtn.click();

    // While it runs, fire two increments from the other window. With the
    // scheduler wired they queue behind the thunk and drain only after it
    // completes, so the deterministic result is double(5)=10 then +2 = 12.
    // Without blocking the increments would interleave with the DOUBLE/HALVE
    // steps and the settled value would vary.
    await switchToWindow('secondary');
    const inc = await browser.$('[aria-label="Increment counter"]');
    await inc.click();
    await inc.click();

    // Wait for the thunk + drained increments to settle, then assert it stays
    // put (guards against a transient pass-through of 12).
    await switchToWindow('main');
    await waitForCounterValue(12, 15000);
    await browser.pause(500);
    const settled = await getCounterValue();
    if (settled !== 12) {
      throw new Error(`expected counter to settle at 12, got ${settled}`);
    }

    await switchToWindow('secondary');
    await waitForCounterValue(12);
  });
});
