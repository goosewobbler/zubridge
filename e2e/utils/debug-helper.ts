/// <reference types="@wdio/globals/types" />

/**
 * Non-intrusive debugging helper that captures window corruption
 * without interfering with WebDriver session stability
 */
export class DebugHelper {
  /**
   * Log window corruption events without heavy WebDriver calls
   */
  static logWindowCorruption(context: string, windowIndex?: number) {
    if (process.platform !== 'linux') {
      return;
    }

    const timestamp = new Date().toISOString();
    console.log(
      `[WINDOW_CORRUPTION] ${timestamp} - ${context} ${windowIndex !== undefined ? `(Window ${windowIndex})` : ''}`,
    );
  }

  /**
   * Lightweight window state check - only gets title to detect corruption
   */
  static async checkWindowCorruption(context: string): Promise<boolean> {
    if (process.platform !== 'linux') {
      return false;
    }

    try {
      const { browser } = await import('@wdio/globals');

      // Only check the most basic corruption indicator - empty title
      const title = await browser.getTitle();
      const isEmpty = !title || title.trim() === '';

      if (isEmpty) {
        console.log(`[CORRUPTION_DETECTED] ${context}: Window title is empty`);
        DebugHelper.logWindowCorruption('Empty window title detected');
        return true;
      }

      return false;
    } catch (err) {
      console.log(`[CORRUPTION_CHECK] ${context}: Failed to check - ${(err as Error).message}`);
      DebugHelper.logWindowCorruption('Cannot check window state');
      return true; // Assume corruption if we can't even check
    }
  }

  /**
   * Log environment info once at startup
   */
  static logEnvironment() {
    if (process.platform !== 'linux') {
      return;
    }

    console.log('[ENV_DEBUG] === Linux Environment Info ===');
    console.log(`[ENV_DEBUG] DISPLAY: ${process.env.DISPLAY || 'NOT_SET'}`);
    console.log(`[ENV_DEBUG] Node: ${process.version}`);
    console.log(`[ENV_DEBUG] PID: ${process.pid}`);

    try {
      const { execSync } = require('child_process');

      // Quick non-blocking checks
      const xvfb = execSync('pgrep -f xvfb >/dev/null 2>&1 && echo "RUNNING" || echo "NOT_RUNNING"', {
        encoding: 'utf8',
      }).trim();
      console.log(`[ENV_DEBUG] XVFB: ${xvfb}`);
    } catch (err) {
      console.log(`[ENV_DEBUG] Environment check minimal failure`);
    }

    console.log('[ENV_DEBUG] === End Environment Info ===');
  }

  /**
   * Simple test failure logging without WebDriver interference
   */
  static logTestFailure(testName: string, error: Error) {
    if (process.platform !== 'linux') {
      return;
    }

    console.log(`[TEST_FAILURE] ${testName}`);
    console.log(`[TEST_FAILURE] Error: ${error.message}`);

    // Classify the error type without making WebDriver calls
    const errorMsg = error.message.toLowerCase();

    if (errorMsg.includes('element') && errorMsg.includes('not existing')) {
      DebugHelper.logWindowCorruption('Element not found - likely window corruption');
    } else if (errorMsg.includes('sessionid') || errorMsg.includes('und_err_closed')) {
      DebugHelper.logWindowCorruption('WebDriver session corruption');
    } else if (errorMsg.includes('timeout')) {
      DebugHelper.logWindowCorruption('Test timeout - possible infinite wait');
    }
  }

  /**
   * Pre-test window health check - lightweight
   */
  static async preTestCheck(testName: string) {
    if (process.platform !== 'linux') {
      return;
    }

    console.log(`[PRE_TEST] Starting: ${testName}`);

    const isCorrupt = await DebugHelper.checkWindowCorruption('pre-test');
    if (isCorrupt) {
      console.log(`[PRE_TEST] WARNING: Window corruption detected before test start`);
    }
  }

  /**
   * Post-test window health check - lightweight
   */
  static async postTestCheck(testName: string, passed: boolean) {
    if (process.platform !== 'linux') {
      return;
    }

    console.log(`[POST_TEST] Finished: ${testName} - ${passed ? 'PASSED' : 'FAILED'}`);

    if (!passed) {
      const isCorrupt = await DebugHelper.checkWindowCorruption('post-test-failure');
      if (isCorrupt) {
        console.log(`[POST_TEST] Window corruption confirmed after test failure`);
      }
    }
  }
}
