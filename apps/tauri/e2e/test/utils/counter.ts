import { browser } from '@wdio/globals';

export const getCounterValue = async (): Promise<number> => {
  const el = await browser.$('h2');
  await el.waitForExist({ timeout: 5000 });
  const text = await el.getText();
  const match = text.match(/Counter:\s*(-?\d+)/);
  if (!match) throw new Error(`Could not parse counter from: "${text}"`);
  return Number.parseInt(match[1], 10);
};

export const waitForCounterValue = async (expected: number, timeoutMs = 10000): Promise<void> => {
  const start = Date.now();
  let actual: number | undefined;
  while (Date.now() - start < timeoutMs) {
    actual = await getCounterValue();
    if (actual === expected) return;
    await browser.pause(200);
  }
  throw new Error(`Timeout waiting for counter ${expected} (last seen: ${actual})`);
};

export const resetCounter = async (): Promise<void> => {
  let value = await getCounterValue();
  while (value > 0) {
    await (await browser.$('[aria-label="Decrement counter"]')).click();
    await waitForCounterValue(value - 1);
    value -= 1;
  }
  while (value < 0) {
    await (await browser.$('[aria-label="Increment counter"]')).click();
    await waitForCounterValue(value + 1);
    value += 1;
  }
};
