/// <reference types="@wdio/globals/types" />

/**
 * Non-intrusive debugging helper that captures window corruption
 * without interfering with WebDriver session stability
 */

/**
 * Log window corruption events without heavy WebDriver calls
 */
export function logWindowCorruption(context: string, windowIndex?: number) {
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
export async function checkWindowCorruption(context: string): Promise<boolean> {
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
      logWindowCorruption('Empty window title detected');
      return true;
    }

    return false;
  } catch (err) {
    console.log(`[CORRUPTION_CHECK] ${context}: Failed to check - ${(err as Error).message}`);
    logWindowCorruption('Cannot check window state');
    return true; // Assume corruption if we can't even check
  }
}

/**
 * Quick health check without any WebDriver calls - just logs timing
 */
export function logHealthCheckpoint(checkpoint: string, additionalInfo?: string) {
  if (process.platform !== 'linux') {
    return;
  }

  const timestamp = new Date().toISOString();
  const info = additionalInfo ? ` - ${additionalInfo}` : '';
  console.log(`[HEALTH_CHECKPOINT] ${timestamp} - ${checkpoint}${info}`);
}

/**
 * Track window operation sequences to identify corruption patterns
 */
export function logWindowOperation(
  operation: string,
  windowIndex?: number,
  result?: 'SUCCESS' | 'FAILED',
) {
  if (process.platform !== 'linux') {
    return;
  }

  const timestamp = new Date().toISOString();
  const window = windowIndex !== undefined ? ` window=${windowIndex}` : '';
  const status = result ? ` result=${result}` : '';
  console.log(`[WINDOW_OP] ${timestamp} - ${operation}${window}${status}`);
}

/**
 * Non-intrusive corruption pattern detection
 */
export async function trackWindowHealth(operation: string, windowIndex?: number): Promise<boolean> {
  if (process.platform !== 'linux') {
    return false;
  }

  const timestamp = new Date().toISOString();

  try {
    const { browser } = await import('@wdio/globals');

    // Minimal check - just get handles count and current title
    const handles = await browser.getWindowHandles();
    const title = await browser.getTitle();
    const isEmpty = !title || title.trim() === '';

    console.log(
      `[WINDOW_HEALTH] ${timestamp} - ${operation}: handles=${handles.length}, title="${title}", corrupt=${isEmpty}${
        windowIndex !== undefined ? `, targetWindow=${windowIndex}` : ''
      }`,
    );

    if (isEmpty) {
      logWindowCorruption(`Corruption during ${operation}`, windowIndex);
      return true;
    }

    return false;
  } catch (err) {
    console.log(
      `[WINDOW_HEALTH] ${timestamp} - ${operation}: FAILED to check - ${(err as Error).message}`,
    );
    logWindowCorruption(`Health check failed during ${operation}`, windowIndex);
    return true;
  }
}

/**
 * Log environment info once at startup
 */
export function logEnvironment() {
  if (process.platform !== 'linux') {
    return;
  }

  console.log('[ENV_DEBUG] === Linux Environment Info ===');
  console.log(`[ENV_DEBUG] DISPLAY: ${process.env.DISPLAY || 'NOT_SET'}`);
  console.log(`[ENV_DEBUG] Node: ${process.version}`);
  console.log(`[ENV_DEBUG] PID: ${process.pid}`);

  try {
    const { execSync } = require('node:child_process');

    // Quick non-blocking checks
    const xvfb = execSync('pgrep -f xvfb >/dev/null 2>&1 && echo "RUNNING" || echo "NOT_RUNNING"', {
      encoding: 'utf8',
    }).trim();
    console.log(`[ENV_DEBUG] XVFB: ${xvfb}`);
  } catch (_err) {
    console.log('[ENV_DEBUG] Environment check minimal failure');
  }

  console.log('[ENV_DEBUG] === End Environment Info ===');
}

/**
 * Simple test failure logging without WebDriver interference
 */
export function logTestFailure(testName: string, error: Error) {
  if (process.platform !== 'linux') {
    return;
  }

  console.log(`[TEST_FAILURE] ${testName}`);
  console.log(`[TEST_FAILURE] Error: ${error.message}`);

  // Classify the error type without making WebDriver calls
  const errorMsg = error.message.toLowerCase();

  if (errorMsg.includes('element') && errorMsg.includes('not existing')) {
    logWindowCorruption('Element not found - likely window corruption');
  } else if (errorMsg.includes('sessionid') || errorMsg.includes('und_err_closed')) {
    logWindowCorruption('WebDriver session corruption');
  } else if (errorMsg.includes('timeout')) {
    logWindowCorruption('Test timeout - possible infinite wait');
  }
}

/**
 * Pre-test window health check - lightweight
 */
export async function preTestCheck(testName: string) {
  if (process.platform !== 'linux') {
    return;
  }

  console.log(`[PRE_TEST] Starting: ${testName}`);

  const isCorrupt = await checkWindowCorruption('pre-test');
  if (isCorrupt) {
    console.log('[PRE_TEST] WARNING: Window corruption detected before test start');
  }
}

/**
 * Post-test window health check - lightweight
 */
export async function postTestCheck(testName: string, passed: boolean) {
  if (process.platform !== 'linux') {
    return;
  }

  console.log(`[POST_TEST] Finished: ${testName} - ${passed ? 'PASSED' : 'FAILED'}`);

  if (!passed) {
    const isCorrupt = await checkWindowCorruption('post-test-failure');
    if (isCorrupt) {
      console.log('[POST_TEST] Window corruption confirmed after test failure');
    }
  }
}
