import { browser } from 'wdio-electron-service';
import { TIMING } from './constants.js';

/**
 * Get the current theme from the document body class
 */
export const getCurrentTheme = async (): Promise<'dark' | 'light'> => {
  // Check the body element for theme classes
  const hasClass = await browser.execute(() => {
    const body = document.body;
    return {
      isDark: body.classList.contains('dark-theme'),
      isLight: body.classList.contains('light-theme'),
    };
  });

  if (hasClass.isDark) {
    console.log('Current theme: dark');
    return 'dark';
  } else if (hasClass.isLight) {
    console.log('Current theme: light');
    return 'light';
  } else {
    // Default assumption
    console.log('No theme class found, assuming dark theme');
    return 'dark';
  }
};

/**
 * Wait for the theme to change to a specific value
 */
export const waitForTheme = async (expectedTheme: 'dark' | 'light', timeoutMs = 10000): Promise<void> => {
  console.log(`Waiting for theme to change to: ${expectedTheme}`);

  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    try {
      const currentTheme = await getCurrentTheme();
      if (currentTheme === expectedTheme) {
        console.log(`Theme changed to expected value: ${expectedTheme}`);
        return;
      }
      console.log(`Theme is ${currentTheme}, waiting for ${expectedTheme}...`);
    } catch (error) {
      console.log(`Error getting theme: ${error}`);
    }

    await browser.pause(200);
  }

  throw new Error(`Timeout waiting for theme ${expectedTheme} after ${timeoutMs}ms`);
};

/**
 * Toggle the theme by clicking the theme toggle button
 */
export const toggleTheme = async (): Promise<void> => {
  console.log('Toggling theme...');

  // Look for the theme toggle button - it might have "Switch" text or similar
  const themeButton = await browser.$('button*=Switch');
  await themeButton.waitForExist({ timeout: 5000 });

  await themeButton.click();
  await browser.pause(TIMING.BUTTON_CLICK_PAUSE);

  console.log('Theme toggle clicked');
};
