import { browser } from '@wdio/globals';
import { TIMING } from './constants.js';

export const switchToWindow = async (label: string): Promise<void> => {
  // @ts-expect-error — tauri is added by @wdio/tauri-service
  await browser.tauri.switchWindow(label);
  await browser.pause(TIMING.WINDOW_CHANGE_PAUSE);
};

export const setupTestEnvironment = async (): Promise<void> => {
  await switchToWindow('main');
};
