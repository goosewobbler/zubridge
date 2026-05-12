import { browser } from '@wdio/globals';
import { beforeEach, describe, it } from 'mocha';
import { resetCounter, waitForCounterValue } from '../utils/counter.js';
import { setupTestEnvironment, switchToWindow } from '../utils/window.js';

describe('Tauri App Basic Synchronization', () => {
  beforeEach(async () => {
    await setupTestEnvironment();
    await resetCounter();
  });

  describe('counter operations', () => {
    it('should increment the counter', async () => {
      const btn = await browser.$('[aria-label="Increment counter"]');

      await btn.click();
      await waitForCounterValue(1);

      await btn.click();
      await waitForCounterValue(2);

      await btn.click();
      await waitForCounterValue(3);
    });

    it('should decrement the counter', async () => {
      const inc = await browser.$('[aria-label="Increment counter"]');
      await inc.click();
      await inc.click();
      await inc.click();
      await waitForCounterValue(3);

      const dec = await browser.$('[aria-label="Decrement counter"]');
      await dec.click();
      await waitForCounterValue(2);

      await dec.click();
      await waitForCounterValue(1);

      await dec.click();
      await waitForCounterValue(0);
    });
  });

  describe('window synchronization', () => {
    it('should sync counter changes from main to secondary window', async () => {
      await switchToWindow('main');

      const inc = await browser.$('[aria-label="Increment counter"]');
      await inc.click();
      await waitForCounterValue(1);

      await switchToWindow('secondary');
      await waitForCounterValue(1);
    });

    it('should sync counter changes from secondary to main window', async () => {
      await switchToWindow('secondary');

      const inc = await browser.$('[aria-label="Increment counter"]');
      await inc.click();
      await waitForCounterValue(1);

      await switchToWindow('main');
      await waitForCounterValue(1);
    });
  });
});
