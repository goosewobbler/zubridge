import { browser } from '@wdio/globals';

export const switchToWindow = async (label: string): Promise<void> => {
  // @ts-expect-error — tauri is added by @wdio/tauri-service
  await browser.tauri.switchWindow(label);
};

export const setupTestEnvironment = async (): Promise<void> => {
  await switchToWindow('main');
};
