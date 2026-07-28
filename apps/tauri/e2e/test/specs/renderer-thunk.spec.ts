import { browser } from '@wdio/globals';
import { beforeEach, describe, it } from 'mocha';
import { resetCounter, waitForCounterValue } from '../utils/counter.js';
import { setupTestEnvironment, switchToWindow } from '../utils/window.js';

// Exercises a renderer thunk end-to-end through the wired action scheduler:
// register_thunk -> the thunk's own actions execute immediately (they belong to
// the active root) -> complete_thunk drains the queue and unblocks. Guards
// against the scheduler wiring regressing the renderer-thunk path (basic-sync
// only covers plain dispatch).
describe('Tauri Renderer Thunk (through scheduler)', () => {
  beforeEach(async () => {
    await setupTestEnvironment();
    await resetCounter();
  });

  it('doubles the counter via a renderer thunk, propagates, and unblocks after', async () => {
    await switchToWindow('main');

    const inc = await browser.$('[aria-label="Increment counter"]');
    for (let i = 0; i < 5; i++) {
      await inc.click();
    }
    await waitForCounterValue(5);

    // doubleCounter thunk: getState -> DOUBLE -> DOUBLE -> HALVE (net x2). 5 -> 10.
    const thunkBtn = await browser.$('[aria-label="Double counter using renderer thunk"]');
    await thunkBtn.click();
    await waitForCounterValue(10);

    // The doubled value reached the other window.
    await switchToWindow('secondary');
    await waitForCounterValue(10);

    // A plain action after the thunk still applies — confirms the scheduler
    // unblocked when the thunk completed (otherwise it would queue forever).
    await switchToWindow('main');
    const incAfter = await browser.$('[aria-label="Increment counter"]');
    await incAfter.click();
    await waitForCounterValue(11);
  });
});
