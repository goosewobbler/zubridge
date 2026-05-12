import { browser, expect } from '@wdio/globals';
import { before, beforeEach, describe, it } from 'mocha';
import { TIMING } from '../utils/constants.js';
import { getCounterValue, resetCounter } from '../utils/counter.js';
import { setupTestEnvironment, switchToWindow } from '../utils/window.js';

describe('Tauri App Basic Synchronization', () => {
  before(async () => {
    await setupTestEnvironment();
  });

  beforeEach(async () => {
    await setupTestEnvironment();
    await resetCounter();
  });

  describe('counter operations', () => {
    it('should increment the counter', async () => {
      const btn = await browser.$('[aria-label="Increment counter"]');

      await btn.click();
      await browser.pause(TIMING.BUTTON_CLICK_PAUSE);
      expect(await getCounterValue()).toBe(1);

      await btn.click();
      await browser.pause(TIMING.BUTTON_CLICK_PAUSE);
      expect(await getCounterValue()).toBe(2);

      await btn.click();
      await browser.pause(TIMING.BUTTON_CLICK_PAUSE);
      expect(await getCounterValue()).toBe(3);
    });

    it('should decrement the counter', async () => {
      const inc = await browser.$('[aria-label="Increment counter"]');
      await inc.click();
      await inc.click();
      await inc.click();
      await browser.pause(TIMING.BUTTON_CLICK_PAUSE);
      expect(await getCounterValue()).toBe(3);

      const dec = await browser.$('[aria-label="Decrement counter"]');
      await dec.click();
      await browser.pause(TIMING.BUTTON_CLICK_PAUSE);
      expect(await getCounterValue()).toBe(2);

      await dec.click();
      await browser.pause(TIMING.BUTTON_CLICK_PAUSE);
      expect(await getCounterValue()).toBe(1);

      await dec.click();
      await browser.pause(TIMING.BUTTON_CLICK_PAUSE);
      expect(await getCounterValue()).toBe(0);
    });
  });

  describe('window synchronization', () => {
    it('should sync counter changes from main to secondary window', async () => {
      await switchToWindow('main');

      const inc = await browser.$('[aria-label="Increment counter"]');
      await inc.click();
      await browser.pause(TIMING.BUTTON_CLICK_PAUSE);
      expect(await getCounterValue()).toBe(1);

      await switchToWindow('secondary');
      await browser.pause(TIMING.STATE_SYNC_PAUSE);
      expect(await getCounterValue()).toBe(1);
    });

    it('should sync counter changes from secondary to main window', async () => {
      await switchToWindow('secondary');

      const inc = await browser.$('[aria-label="Increment counter"]');
      await inc.click();
      await browser.pause(TIMING.BUTTON_CLICK_PAUSE);
      expect(await getCounterValue()).toBe(1);

      await switchToWindow('main');
      await browser.pause(TIMING.STATE_SYNC_PAUSE);
      expect(await getCounterValue()).toBe(1);
    });
  });
});
