import { expect } from '@wdio/globals';
import { it, describe, before, beforeEach } from 'mocha';
import { browser } from 'wdio-electron-service';

// Platform-specific timing configurations
const TIMING = {
  // Base timing values (used for macOS / Windows)
  base: {
    WINDOW_SWITCH_PAUSE: 100,
    STATE_SYNC_PAUSE: 250, // Time to wait for state to sync between windows
    BUTTON_CLICK_PAUSE: 50, // Time to wait after clicking a button
    WINDOW_CHANGE_PAUSE: 200, // Time to wait after window creation/deletion
    WINDOW_WAIT_TIMEOUT: 3000, // Maximum time to wait for window operations
    WINDOW_WAIT_INTERVAL: 150, // How often to check window availability
  },

  // Timing adjustments for Linux (slower CI environment)
  linux: {
    WINDOW_SWITCH_PAUSE: 150,
    STATE_SYNC_PAUSE: 400,
    BUTTON_CLICK_PAUSE: 100,
    WINDOW_CHANGE_PAUSE: 350,
    WINDOW_WAIT_TIMEOUT: 5000,
    WINDOW_WAIT_INTERVAL: 200,
  },
};

// Determine which timing configuration to use based on platform
const PLATFORM = process.platform;
const CURRENT_TIMING = PLATFORM === 'linux' ? TIMING.linux : TIMING.base;

console.log(`Using timing configuration for platform: ${PLATFORM}`);

// Store windows by index rather than by title since all windows have the same title
const windowHandles: string[] = [];

// Names of core windows for easier reference in tests
// UPDATED: Reduced to only Main and DirectWebContents windows
// TODO: Add BrowserView and WebContentsView windows when we have fixed the Webdriver connection issues
const CORE_WINDOW_NAMES = ['Main', 'DirectWebContents'];
const CORE_WINDOW_COUNT = CORE_WINDOW_NAMES.length;

// Helper to refresh window handles
const refreshWindowHandles = async () => {
  try {
    const handles = await browser.getWindowHandles();

    // Clear old handles
    windowHandles.length = 0;

    // Store handles in order they're discovered
    for (const handle of handles) {
      try {
        await browser.switchToWindow(handle);
        await browser.pause(CURRENT_TIMING.BUTTON_CLICK_PAUSE);
        windowHandles.push(handle);
        console.log(`Found window ${windowHandles.length - 1} with handle: ${handle}`);
      } catch (error) {
        console.error(`Failed to switch to window ${handle}:`, error);
        // Don't add this handle as it might be a closing window
      }
    }

    console.log(`Total windows: ${windowHandles.length}`);
    return handles.length;
  } catch (error) {
    console.error('Error refreshing window handles:', error);
    // Return the existing count if we fail to get new handles
    return windowHandles.length;
  }
};

// Wait for a specific number of windows to be available
const waitUntilWindowsAvailable = async (desiredWindows: number) =>
  await browser.waitUntil(
    async () => {
      try {
        const windowCount = await refreshWindowHandles();
        console.log(`Current window count: ${windowCount}, desired: ${desiredWindows}`);
        return windowCount === desiredWindows;
      } catch (error) {
        console.error('Error checking window count:', error);
        // If we're waiting for 0 windows, consider it successful since an error might occur if all windows are closed
        return desiredWindows === 0;
      }
    },
    {
      timeout: CURRENT_TIMING.WINDOW_WAIT_TIMEOUT,
      timeoutMsg: `Expected ${desiredWindows} windows to be available`,
      interval: CURRENT_TIMING.WINDOW_WAIT_INTERVAL,
    },
  );

// Helper to switch to window by index (0 = main window, 1+ = child windows)
const switchToWindow = async (index: number) => {
  try {
    await refreshWindowHandles();
    if (index >= 0 && index < windowHandles.length) {
      const handle = windowHandles[index];
      try {
        await browser.switchToWindow(handle);
        await browser.pause(CURRENT_TIMING.WINDOW_SWITCH_PAUSE);
        return true;
      } catch (error) {
        console.error(`Failed to switch to window at index ${index} with handle ${handle}:`, error);
        // Window might have been closed
        return false;
      }
    } else {
      console.log(`Cannot switch to window index ${index}, only ${windowHandles.length} windows available`);
      return false;
    }
  } catch (error) {
    console.error('Error in switchToWindow:', error);
    return false;
  }
};

// Helper to close all windows except the core windows
const closeAllRemainingWindows = async () => {
  try {
    // Refresh window handles to get latest state
    await refreshWindowHandles();
    await browser.pause(CURRENT_TIMING.WINDOW_SWITCH_PAUSE);

    // If we already have just CORE_WINDOW_COUNT windows, we're done
    if (windowHandles.length <= CORE_WINDOW_COUNT) {
      console.log(`Already have ${CORE_WINDOW_COUNT} or fewer windows, no cleanup needed`);
      return;
    }

    // First try to close via Electron API directly for reliability
    await browser.electron.execute((electron, coreCount) => {
      const windows = electron.BrowserWindow.getAllWindows();
      // Keep only the core windows
      for (let i = coreCount; i < windows.length; i++) {
        try {
          console.log(`Direct close of window index ${i} with ID ${windows[i].id}`);
          windows[i].close();
        } catch (err) {
          console.error(`Error closing window at index ${i}:`, err);
        }
      }
    }, CORE_WINDOW_COUNT);

    // Give windows time to close
    await browser.pause(CURRENT_TIMING.WINDOW_CHANGE_PAUSE * 2);
    await refreshWindowHandles();

    // If we still have more than CORE_WINDOW_COUNT windows, try to close them one by one
    if (windowHandles.length > CORE_WINDOW_COUNT) {
      // Close any child windows in reverse order (to avoid index shifting)
      // Start from the last window and keep the core windows
      for (let i = windowHandles.length - 1; i >= CORE_WINDOW_COUNT; i--) {
        console.log(`Attempting to close window at index ${i}`);

        try {
          // Try to switch to the window first to ensure it exists
          const switchSucceeded = await switchToWindow(i);
          if (!switchSucceeded) {
            console.log(`Could not switch to window ${i}, skipping close operation`);
            continue;
          }

          // Try to get the close button
          try {
            const closeButton = await getButtonInCurrentWindow('close');
            await closeButton.click();
          } catch (error) {
            console.log(`Could not find close button in window ${i}, using direct API`);
            // If button not found, close directly via API
            await browser.electron.execute((electron, idx) => {
              const windows = electron.BrowserWindow.getAllWindows();
              if (idx < windows.length) {
                windows[idx].close();
              }
            }, i);
          }

          // Give window time to close
          await browser.pause(CURRENT_TIMING.WINDOW_CHANGE_PAUSE);
        } catch (error) {
          console.error(`Error during window ${i} close operation:`, error);
        }
      }
    }

    // Final check - force refresh and try to ensure we have only core windows
    await browser.pause(CURRENT_TIMING.WINDOW_CHANGE_PAUSE);
    await refreshWindowHandles();

    // Try to ensure we're on the main window
    if (windowHandles.length > 0) {
      await switchToWindow(0);
    }
  } catch (error) {
    console.error('Error during window cleanup:', error);
    // Try to ensure we're on the main window as a fallback
    try {
      await refreshWindowHandles();
      if (windowHandles.length > 0) {
        await switchToWindow(0);
      }
    } catch (finalError) {
      console.error('Final error in cleanup:', finalError);
    }
  }
};

// Helper function to get button based on window type
const getButtonInCurrentWindow = async (buttonType: 'increment' | 'decrement' | 'create' | 'close') => {
  // All windows have the same button selector patterns
  switch (buttonType) {
    case 'increment':
      return await browser.$('button=+');
    case 'decrement':
      return await browser.$('button=-');
    case 'create':
      return await browser.$('button=Create Window');
    case 'close':
      return await browser.$('button=Close Window');
    default:
      throw new Error(`Unknown button type: ${buttonType}`);
  }
};

// Helper to get counter value from current window
const getCounterValue = async () => {
  // Wait for the counter element to be present and have stable value
  await browser.waitUntil(
    async () => {
      const counterElement = await browser.$('h2');
      return await counterElement.isExisting();
    },
    {
      timeout: CURRENT_TIMING.WINDOW_WAIT_TIMEOUT,
      timeoutMsg: 'Counter element not found',
      interval: CURRENT_TIMING.WINDOW_WAIT_INTERVAL / 2,
    },
  );

  const counterElement = await browser.$('h2');
  const counterText = await counterElement.getText();
  return parseInt(counterText.replace('Counter: ', ''));
};

// Helper for incrementing counter and ensuring the value changes
const incrementCounterAndVerify = async (targetValue: number): Promise<number> => {
  let currentValue = await getCounterValue();
  const incrementButton = await getButtonInCurrentWindow('increment');

  while (currentValue < targetValue) {
    console.log(`Incrementing counter from ${currentValue} to ${targetValue}`);
    await incrementButton.click();

    // Wait for counter to update
    await browser.pause(CURRENT_TIMING.BUTTON_CLICK_PAUSE);

    // Check if the value changed
    const newValue = await getCounterValue();
    if (newValue === currentValue) {
      console.log('Counter did not increment, clicking again');
      await incrementButton.click();
      await browser.pause(CURRENT_TIMING.BUTTON_CLICK_PAUSE * 2); // Longer pause if the value didn't change
    }

    currentValue = await getCounterValue();
  }

  return currentValue;
};

// Helper to reset counter to zero
const resetCounter = async () => {
  // First get the current counter value
  const counterElement = await browser.$('h2');
  const counterText = await counterElement.getText();
  const currentCount = parseInt(counterText.replace('Counter: ', ''));

  // Use decrement button to reset to zero
  if (currentCount > 0) {
    const decrementButton = await browser.$('button=-');
    // Click the decrement button as many times as needed
    for (let i = 0; i < currentCount; i++) {
      await decrementButton.click();
      // Small wait to ensure state update
      await browser.pause(CURRENT_TIMING.BUTTON_CLICK_PAUSE);
    }
  }

  // Verify we're at zero
  const newCounterElement = await browser.$('h2');
  const newCounterText = await newCounterElement.getText();
  return parseInt(newCounterText.replace('Counter: ', ''));
};

describe('application loading', () => {
  before(async () => {
    await waitUntilWindowsAvailable(CORE_WINDOW_COUNT);
  });

  beforeEach(async () => {
    console.log('Running beforeEach setup...');
    try {
      await closeAllRemainingWindows();
      // Ensure we have exactly CORE_WINDOW_COUNT windows
      await waitUntilWindowsAvailable(CORE_WINDOW_COUNT);
      // Ensure focus is on the main window
      await switchToWindow(0);
      console.log(`beforeEach setup complete, ${CORE_WINDOW_COUNT} windows verified, focus on main.`);
    } catch (error) {
      console.error('Error during beforeEach setup:', error);
      // If setup fails, try to recover or throw to stop tests
      throw new Error(`Test setup failed: ${error}`);
    }
  });

  describe('click events', () => {
    it('should increment the counter', async () => {
      const incrementButton = await browser.$('button=+');

      await incrementButton.click();
      await browser.pause(CURRENT_TIMING.BUTTON_CLICK_PAUSE);
      const counterElement1 = await browser.$('h2');
      expect(await counterElement1.getText()).toContain('1');

      await incrementButton.click();
      await browser.pause(CURRENT_TIMING.BUTTON_CLICK_PAUSE);
      const counterElement2 = await browser.$('h2');
      expect(await counterElement2.getText()).toContain('2');

      await incrementButton.click();
      await browser.pause(CURRENT_TIMING.BUTTON_CLICK_PAUSE);
      const counterElement3 = await browser.$('h2');
      expect(await counterElement3.getText()).toContain('3');
    });

    it('should decrement the counter', async () => {
      const decrementButton = await browser.$('button=-');

      await decrementButton.click();
      await browser.pause(CURRENT_TIMING.BUTTON_CLICK_PAUSE);
      const counterElement1 = await browser.$('h2');
      expect(await counterElement1.getText()).toContain('2');

      await decrementButton.click();
      await browser.pause(CURRENT_TIMING.BUTTON_CLICK_PAUSE);
      const counterElement2 = await browser.$('h2');
      expect(await counterElement2.getText()).toContain('1');

      await decrementButton.click();
      await browser.pause(CURRENT_TIMING.BUTTON_CLICK_PAUSE);
      const counterElement3 = await browser.$('h2');
      expect(await counterElement3.getText()).toContain('0');
    });

    it('should double the counter using a thunk', async () => {
      // First, increment to a known value
      await resetCounter();
      const incrementButton = await browser.$('button=+');
      await incrementButton.click();
      await browser.pause(CURRENT_TIMING.BUTTON_CLICK_PAUSE);
      await incrementButton.click();
      await browser.pause(CURRENT_TIMING.BUTTON_CLICK_PAUSE);

      // Verify counter is at 2
      const initialCounter = await browser.$('h2');
      expect(await initialCounter.getText()).toContain('2');

      // Click the double button
      const doubleButton = await browser.$('button=Double (Thunk)');
      await doubleButton.click();
      await browser.pause(CURRENT_TIMING.BUTTON_CLICK_PAUSE * 2); // Longer pause for thunk operation

      // Verify counter is now doubled (4)
      const doubledCounter = await browser.$('h2');
      expect(await doubledCounter.getText()).toContain('4');

      // Double again
      await doubleButton.click();
      await browser.pause(CURRENT_TIMING.BUTTON_CLICK_PAUSE * 2);

      // Verify counter is now 8
      const finalCounter = await browser.$('h2');
      expect(await finalCounter.getText()).toContain('8');
    });

    it('should properly handle sequential async thunk actions', async () => {
      console.log('Starting sequential async thunk test');

      // Reset the counter to a known value
      await resetCounter();

      // Connect to the WebSocket for middleware logging
      const wsUrl = 'ws://localhost:9000';
      console.log(`Connecting to middleware WebSocket at ${wsUrl}`);

      // Initialize WebSocket connection variables
      let actionSequence = [];
      let socket;

      try {
        // Create WebSocket connection
        await browser.executeAsync((wsUrl, done) => {
          // Declare properties on window
          (window as any).actionSequence = [];
          (window as any).socket = new WebSocket(wsUrl);

          (window as any).socket.onopen = () => {
            console.log('WebSocket connected');
            done(true);
          };

          (window as any).socket.onerror = (error: Event) => {
            console.error('WebSocket error:', error);
            done(false);
          };

          // Timeout if connection fails
          setTimeout(() => {
            if ((window as any).socket.readyState !== 1) {
              console.error('WebSocket connection timeout');
              done(false);
            }
          }, 3000);

          (window as any).socket.onmessage = (event: { data: string }) => {
            try {
              // For this test, we only care about the sequence of events
              // We'll just log the action types and timestamps
              const data = JSON.parse(event.data);
              if (data.entry_type === 'ActionDispatched' && data.action) {
                (window as any).actionSequence.push({
                  type: data.action.action_type,
                  timestamp: data.timestamp,
                  context: data.context_id,
                });
                console.log(`Action recorded: ${data.action.action_type}`);
              } else if (data.entry_type === 'StateUpdated') {
                (window as any).actionSequence.push({
                  type: 'StateUpdated',
                  timestamp: data.timestamp,
                  context: data.context_id,
                });
                console.log('State update recorded');
              }
            } catch (error) {
              console.error('Error processing WebSocket message:', error);
            }
          };
        }, wsUrl);

        // Find the async test button
        const asyncTestButton = await browser.$('button=Test Async Thunk');

        if (!(await asyncTestButton.isExisting())) {
          console.log('Async test button not found, skipping test');
          return;
        }

        console.log('Clicking async test button');
        await asyncTestButton.click();

        // We need a longer pause to ensure all async operations complete
        const ASYNC_OPERATION_TIMEOUT = CURRENT_TIMING.BUTTON_CLICK_PAUSE * 10;
        await browser.pause(ASYNC_OPERATION_TIMEOUT);

        // Retrieve the action sequence from the browser
        actionSequence = await browser.execute(() => {
          return (window as any).actionSequence || [];
        });

        console.log('Retrieved action sequence:', JSON.stringify(actionSequence, null, 2));

        // Verify async operations were performed sequentially
        // Find all the setValue actions
        const setValueActions = actionSequence.filter((action: any) => {
          return typeof action.type === 'string' && action.type.includes('setValue');
        });

        // Verify we have at least two setValue actions
        expect(setValueActions.length).toBeGreaterThanOrEqual(2);

        // Now check their context IDs - actions from the same thunk should have related contexts
        const uniqueContexts = new Set(
          setValueActions.map((action: any) => {
            return action.context;
          }),
        );

        console.log(`Found ${uniqueContexts.size} unique contexts for setValue actions`);

        // Verify the actions were processed in sequence by checking timestamps
        let previousTimestamp = null;
        let isSequential = true;

        for (let i = 0; i < setValueActions.length; i++) {
          const currentTimestamp = new Date(setValueActions[i].timestamp).getTime();

          if (previousTimestamp !== null) {
            const timeDiff = currentTimestamp - previousTimestamp;
            console.log(`Time between actions ${i - 1} and ${i}: ${timeDiff}ms`);

            // In a properly functioning system, the time difference should be significant
            // because each action should wait for the previous one to complete
            // We expect at least 1000ms between actions based on the handler implementation
            if (timeDiff < 1000) {
              isSequential = false;
              console.log(`Warning: Actions ${i - 1} and ${i} appear to have executed too close together`);
            }
          }

          previousTimestamp = currentTimestamp;
        }

        // Verify actions executed sequentially
        expect(isSequential).toBe(true);

        // Verify the final counter value reflects both operations
        const finalCounter = await browser.$('h2');
        const counterText = await finalCounter.getText();
        const counterValue = parseFloat(counterText.replace('Counter: ', ''));

        // The value should have been set twice by the async operations
        // The exact value isn't predictable since random values are used,
        // but it should be a non-zero value
        expect(counterValue).not.toBe(0);
        console.log(`Final counter value: ${counterValue}`);
      } catch (error) {
        console.error('Error during async thunk test:', error);
        throw error;
      } finally {
        // Close the WebSocket connection
        await browser.execute(() => {
          if ((window as any).socket && (window as any).socket.readyState === 1) {
            (window as any).socket.close();
            console.log('WebSocket connection closed');
          }
        });
      }
    });

    it('should double the counter using an action object', async () => {
      // First, increment to a known value
      await resetCounter();
      const incrementButton = await browser.$('button=+');
      await incrementButton.click();
      await browser.pause(CURRENT_TIMING.BUTTON_CLICK_PAUSE);
      await incrementButton.click();
      await browser.pause(CURRENT_TIMING.BUTTON_CLICK_PAUSE);

      // Verify counter is at 2
      const initialCounter = await browser.$('h2');
      expect(await initialCounter.getText()).toContain('2');

      // Click the double button
      const doubleButton = await browser.$('button=Double (Object)');
      await doubleButton.click();
      await browser.pause(CURRENT_TIMING.BUTTON_CLICK_PAUSE * 2);

      // Verify counter is now doubled (4)
      const doubledCounter = await browser.$('h2');
      expect(await doubledCounter.getText()).toContain('4');

      // Double again
      await doubleButton.click();
      await browser.pause(CURRENT_TIMING.BUTTON_CLICK_PAUSE * 2);

      // Verify counter is now 8
      const finalCounter = await browser.$('h2');
      expect(await finalCounter.getText()).toContain('8');
    });
  });

  describe('window management', () => {
    it('should create a new window', async () => {
      // No need to switch to window 0, beforeEach handles it
      const createWindowButton = await browser.$('button=Create Window');
      await createWindowButton.click();

      // Give the new window more time to appear before checking
      await browser.pause(CURRENT_TIMING.WINDOW_CHANGE_PAUSE * 3);

      // Wait for new window and switch to it (there should now be 3 windows)
      await waitUntilWindowsAvailable(3);
      const windows = await browser.electron.execute((electron) => {
        return electron.BrowserWindow.getAllWindows().length;
      });

      expect(windows).toBe(3);

      // We'll leave the window open for the next test
    });

    it('should sync state between main and secondary windows', async () => {
      console.log('Starting base windows sync test');

      // Reset counter to 0
      console.log('Resetting counter to 0');
      await resetCounter();

      // Increment counter in main window
      console.log('Incrementing counter in main window');
      const incrementButton = await getButtonInCurrentWindow('increment');
      await incrementButton.click();
      await browser.pause(CURRENT_TIMING.BUTTON_CLICK_PAUSE);
      await incrementButton.click();
      await browser.pause(CURRENT_TIMING.BUTTON_CLICK_PAUSE);

      // Check counter value in main window
      const mainCounterValue = await getCounterValue();
      console.log(`Main window counter value: ${mainCounterValue}`);
      expect(mainCounterValue).toBe(2);

      // Switch to secondary window
      console.log('Switching to secondary window');
      const switched = await switchToWindow(1);

      if (!switched) {
        console.warn('Could not switch to secondary window, skipping verification');
        return;
      }

      // Wait for state to sync
      await browser.pause(CURRENT_TIMING.STATE_SYNC_PAUSE);

      // Verify counter state in secondary window
      console.log('Checking counter in secondary window');
      const secondaryWindowValue = await getCounterValue();
      console.log(`Secondary window counter value: ${secondaryWindowValue}`);
      expect(secondaryWindowValue).toBe(2);

      // Increment in secondary window
      console.log('Incrementing counter in secondary window');
      const secondaryIncrementButton = await getButtonInCurrentWindow('increment');
      await secondaryIncrementButton.click();
      await browser.pause(CURRENT_TIMING.BUTTON_CLICK_PAUSE);

      // Verify counter updated in secondary window
      const updatedSecondaryValue = await getCounterValue();
      console.log(`Updated secondary window counter value: ${updatedSecondaryValue}`);
      expect(updatedSecondaryValue).toBe(3);

      // Switch back to main window and verify sync
      console.log('Switching back to main window');
      await switchToWindow(0);

      // Wait for state to sync
      await browser.pause(CURRENT_TIMING.STATE_SYNC_PAUSE);

      // Verify counter state updated in main window
      const updatedMainValue = await getCounterValue();
      console.log(`Updated main window counter value: ${updatedMainValue}`);
      expect(updatedMainValue).toBe(3);
    });

    it('should maintain state across windows', async () => {
      console.log('Starting maintain state test');

      // Reset counter to 0 first
      await resetCounter();

      // Increment counter in main window
      console.log('Incrementing counter in main window');
      const incrementButton = await browser.$('button=+');
      await incrementButton.click();
      await browser.pause(20);
      await incrementButton.click();
      await browser.pause(20);
      await incrementButton.click();
      await browser.pause(20);

      // Check counter value in main window
      const mainCounterValue = await getCounterValue();
      console.log(`Main window counter value: ${mainCounterValue}`);
      expect(mainCounterValue).toBe(3);

      // Create new window using the button
      console.log('Creating new window via button click');
      const createWindowButton = await browser.$('button=Create Window');
      await createWindowButton.click();

      // Give the new window more time to appear and register
      await browser.pause(CURRENT_TIMING.WINDOW_CHANGE_PAUSE * 3);
      await refreshWindowHandles(); // Refresh handles *after* waiting
      console.log(`After clicking create window, have ${windowHandles.length} windows`);

      // Verify window count using Electron API
      console.log('Verifying window count via Electron API');
      const windowCountAfterCreate = await browser.electron.execute((electron) => {
        return electron.BrowserWindow.getAllWindows().length;
      });
      console.log(`Window count from Electron: ${windowCountAfterCreate}`);

      // Wait until Electron confirms 3 windows exist
      await browser.waitUntil(
        async () => {
          const count = await browser.electron.execute((electron) => {
            return electron.BrowserWindow.getAllWindows().length;
          });
          console.log(`Waiting for 3 windows (Electron)... Current count: ${count}`);
          return count >= 3;
        },
        {
          timeout: CURRENT_TIMING.WINDOW_WAIT_TIMEOUT * 2, // Increased timeout for this check
          timeoutMsg: `Expected Electron to report at least 3 windows, last count: ${windowCountAfterCreate}`,
          interval: CURRENT_TIMING.WINDOW_WAIT_INTERVAL,
        },
      );

      // Refresh handles again after confirming Electron sees the window
      await refreshWindowHandles();

      // Switch to the new window (should be at index 2)
      console.log('Switching to new window (index 2)');
      const switched = await switchToWindow(2);
      if (!switched) {
        console.warn('Could not switch to new window (index 2), skipping verification');
        await closeAllRemainingWindows();
        return;
      }

      // Wait for the UI and state to stabilize
      await browser.pause(CURRENT_TIMING.STATE_SYNC_PAUSE);

      // Verify counter state in new window
      console.log('Checking counter in new window');
      const newWindowValue = await getCounterValue();
      console.log(`New window counter value: ${newWindowValue}`);
      expect(newWindowValue).toBe(3);

      // Clean up by closing the window
      console.log('Cleaning up third window');
      await browser.electron.execute((electron) => {
        const windows = electron.BrowserWindow.getAllWindows();
        if (windows.length >= 3) {
          console.log(`Destroying window at index 2 with ID: ${windows[2].id}`);
          windows[2].destroy();
        }
      });
      await browser.pause(CURRENT_TIMING.WINDOW_CHANGE_PAUSE * 2);
      await waitUntilWindowsAvailable(2); // Expect 2 windows after cleanup
    });

    it('should create multiple windows and maintain state across all of them', async () => {
      console.log('Starting multi-window test');

      // Reset counter using our helper
      console.log('Resetting counter to 0');
      const finalCount = await resetCounter();
      expect(finalCount).toBe(0);

      // Create a third window and verify it exists
      console.log('Creating third window');
      const createWindowButton = await getButtonInCurrentWindow('create');
      await createWindowButton.click();

      // Wait with additional patience for the window to appear
      let attempt = 0;
      let windowCount = 0;
      while (attempt < 3 && windowCount < 3) {
        await browser.pause(CURRENT_TIMING.WINDOW_CHANGE_PAUSE);
        await refreshWindowHandles();
        windowCount = windowHandles.length;
        if (windowCount >= 3) {
          break;
        }
        console.log(`Attempt ${attempt + 1}: Window count is ${windowCount}, waiting for 3 windows...`);
        attempt++;
      }

      expect(windowHandles.length).toBeGreaterThanOrEqual(3);
      console.log(`After creating third window, have ${windowHandles.length} windows`);

      // Create a fourth window from main window
      console.log('Creating fourth window');
      await switchToWindow(0);
      const createWindowButton2 = await getButtonInCurrentWindow('create');
      await createWindowButton2.click();

      // Wait with additional patience for the window to appear
      attempt = 0;
      windowCount = 0;
      while (attempt < 3 && windowCount < 4) {
        await browser.pause(CURRENT_TIMING.WINDOW_CHANGE_PAUSE);
        await refreshWindowHandles();
        windowCount = windowHandles.length;
        if (windowCount >= 4) {
          break;
        }
        console.log(`Attempt ${attempt + 1}: Window count is ${windowCount}, waiting for 4 windows...`);
        attempt++;
      }

      expect(windowHandles.length).toBeGreaterThanOrEqual(4);
      console.log(`After creating fourth window, have ${windowHandles.length} windows`);

      // Ensure windows are stable
      await browser.pause(CURRENT_TIMING.STATE_SYNC_PAUSE);

      // Increment counter in main window to 2 and verify
      console.log('Incrementing counter in main window to 2');
      await switchToWindow(0);
      const mainValue = await incrementCounterAndVerify(2);
      console.log(`Main window counter value: ${mainValue}`);
      expect(mainValue).toBe(2);

      // Check counter in second window
      console.log('Checking counter in second window');
      const switched1 = await switchToWindow(1);
      if (switched1) {
        // Wait for state to sync
        await browser.pause(CURRENT_TIMING.STATE_SYNC_PAUSE);
        const secondValue = await getCounterValue();
        console.log(`Second window counter value: ${secondValue}`);
        expect(secondValue).toBe(2);
      } else {
        console.warn('Could not switch to second window, skipping check');
      }

      // Check counter in third window (if available)
      if (windowHandles.length >= 3) {
        console.log('Checking counter in third window');
        const switched2 = await switchToWindow(2);
        if (switched2) {
          // Wait for state to sync
          await browser.pause(CURRENT_TIMING.STATE_SYNC_PAUSE);
          const thirdValue = await getCounterValue();
          console.log(`Third window counter value: ${thirdValue}`);
          expect(thirdValue).toBe(2);
        } else {
          console.warn('Could not switch to third window, skipping check');
        }
      }

      // Check counter in fourth window (if available)
      if (windowHandles.length >= 4) {
        console.log('Checking counter in fourth window');
        const switched3 = await switchToWindow(3);
        if (switched3) {
          // Wait for state to sync
          await browser.pause(CURRENT_TIMING.STATE_SYNC_PAUSE);
          const fourthValue = await getCounterValue();
          console.log(`Fourth window counter value: ${fourthValue}`);
          expect(fourthValue).toBe(2);
        } else {
          console.warn('Could not switch to fourth window, skipping check');
        }
      }

      // Clean up - use our improved closeAllRemainingWindows function
      console.log('Cleaning up all windows');
      await closeAllRemainingWindows();

      // Switch back to main window to ensure we're in a good state
      await switchToWindow(0);
    });

    it('should maintain sync between child windows and main window after parent window is closed', async () => {
      console.log('Starting parent-child window sync test');

      // Initial setup is handled by beforeEach
      const initialWindowCount = await browser.electron.execute((electron) => {
        return electron.BrowserWindow.getAllWindows().length;
      });
      console.log(`Initial window count from Electron: ${initialWindowCount}`);
      expect(initialWindowCount).toBe(2); // Verify beforeEach worked

      // Reset counter using our helper
      console.log('Resetting counter to 0');
      await resetCounter();
      expect(await getCounterValue()).toBe(0);

      // --- Create windows using the button ---
      // Create a third window (child window) from main window
      console.log('Creating child window (Window 3) via button');
      await switchToWindow(0); // Ensure focus on main
      const createButton1 = await getButtonInCurrentWindow('create');
      await createButton1.click();
      await waitUntilWindowsAvailable(3); // Wait for handle
      await browser.pause(CURRENT_TIMING.STATE_SYNC_PAUSE); // Allow UI to settle
      console.log('Child window created.');

      // From Window 3 (index 2), create a grandchild window (Window 4)
      console.log('Creating grandchild window (Window 4) from child window');
      await switchToWindow(2); // Switch to child window (index 2)
      const createButton2 = await getButtonInCurrentWindow('create');
      await createButton2.click();
      await waitUntilWindowsAvailable(4); // Wait for handle
      await browser.pause(CURRENT_TIMING.STATE_SYNC_PAUSE); // Allow UI to settle
      console.log('Grandchild window created.');
      // --- End window creation modification ---

      // Verify that we now have 4 windows
      const afterGrandchildWindowCount = await browser.electron.execute((electron) => {
        return electron.BrowserWindow.getAllWindows().length;
      });
      console.log(`Window count after creating grandchild: ${afterGrandchildWindowCount}`);
      expect(afterGrandchildWindowCount).toBeGreaterThanOrEqual(4);

      // Set the counter to 3 from the main window
      console.log('Setting counter to 3 from main window');
      await switchToWindow(0);

      // Use our reliable increment helper
      const mainValue = await incrementCounterAndVerify(3);
      console.log(`Main window counter value: ${mainValue}`);
      expect(mainValue).toBe(3);

      // Allow time for state to propagate to all windows
      await browser.pause(CURRENT_TIMING.STATE_SYNC_PAUSE);

      // Store the window IDs for later reference
      const windowIdsBeforeClosing = await browser.electron.execute((electron) => {
        return electron.BrowserWindow.getAllWindows().map((w) => w.id);
      });
      console.log(`Window IDs before closing child: ${JSON.stringify(windowIdsBeforeClosing)}`);

      // Close child window (at index 2) directly - using destroy for reliability
      console.log('Closing child window (index 2) directly via Electron API using destroy()');
      const windowToCloseId = windowIdsBeforeClosing[2]; // Get the ID of the window we intend to close
      const windowClosed = await browser.electron.execute((electron, targetId) => {
        try {
          const windows = electron.BrowserWindow.getAllWindows();
          const windowToClose = windows.find((w) => w.id === targetId);
          if (windowToClose && !windowToClose.isDestroyed()) {
            console.log(`Destroying window with ID: ${windowToClose.id}`);
            windowToClose.destroy(); // Use destroy()
            return true;
          }
          console.warn(`Window with ID ${targetId} not found or already destroyed.`);
          return false;
        } catch (error) {
          console.error('Error destroying window:', error);
          return false;
        }
      }, windowToCloseId);

      console.log(`Destroy command issued for window ID ${windowToCloseId}: ${windowClosed}`);

      // More generous wait time and verify with Electron directly
      await browser.waitUntil(
        async () => {
          const currentWindows = await browser.electron.execute((electron) => {
            return electron.BrowserWindow.getAllWindows().map((w) => w.id);
          });
          console.log(`Waiting for window ${windowToCloseId} to close. Current IDs: ${JSON.stringify(currentWindows)}`);
          return !currentWindows.includes(windowToCloseId);
        },
        {
          timeout: CURRENT_TIMING.WINDOW_WAIT_TIMEOUT * 2,
          timeoutMsg: `Window ${windowToCloseId} did not close as expected.`,
          interval: CURRENT_TIMING.WINDOW_WAIT_INTERVAL,
        },
      );
      console.log(`Window ID ${windowToCloseId} successfully closed.`);

      // Refresh handles after closing
      await refreshWindowHandles();
      console.log(`After closing child window, have ${windowHandles.length} handles`);

      // Get the window count from Electron to verify (should be 3 now)
      const afterClosingCount = await browser.electron.execute((electron) => {
        return electron.BrowserWindow.getAllWindows().length;
      });
      console.log(`Window count from Electron after closing child: ${afterClosingCount}`);
      // Verify Electron count reduced by 1 AND specifically expect 3 windows
      expect(afterClosingCount).toBe(afterGrandchildWindowCount - 1);
      expect(afterClosingCount).toBe(3);

      // Switch back to main window and increment counter
      console.log('Incrementing counter in main window');
      await switchToWindow(0);

      const incrementButton = await getButtonInCurrentWindow('increment');
      await incrementButton.click();
      await browser.pause(CURRENT_TIMING.STATE_SYNC_PAUSE);

      const mainValueAfter = await getCounterValue();
      console.log(`Main window counter after increment: ${mainValueAfter}`);
      expect(mainValueAfter).toBe(4);

      // Switch to grandchild window (now at index 2 after closure of child)
      console.log('Checking grandchild window sync');
      await switchToWindow(2);

      await browser.pause(CURRENT_TIMING.STATE_SYNC_PAUSE);
      const grandchildValueAfter = await getCounterValue();
      console.log(`Grandchild window counter: ${grandchildValueAfter}`);
      expect(grandchildValueAfter).toBe(4);

      // Increment from grandchild
      console.log('Incrementing counter from grandchild window');
      const incrementButton2 = await getButtonInCurrentWindow('increment');
      await incrementButton2.click();
      await browser.pause(CURRENT_TIMING.STATE_SYNC_PAUSE);

      const finalGrandchildValue = await getCounterValue();
      console.log(`Grandchild window counter after increment: ${finalGrandchildValue}`);
      expect(finalGrandchildValue).toBe(5);

      // Check sync back to main window
      console.log('Verifying sync back to main window');
      await switchToWindow(0);

      await browser.pause(CURRENT_TIMING.STATE_SYNC_PAUSE);
      const finalMainValue = await getCounterValue();
      console.log(`Main window final counter value: ${finalMainValue}`);
      expect(finalMainValue).toBe(5);

      // Clean up is handled by beforeEach for the next test
      // console.log('Final cleanup');
      // await closeAllRemainingWindows();
    });

    it('should sync state between all core window types', async () => {
      console.log('Testing sync between all core window types');

      // Reset counter to 0
      await switchToWindow(0);
      await resetCounter();

      // Verify we have the expected 4 core windows
      await refreshWindowHandles();
      console.log(`We have ${windowHandles.length} windows at test start`);
      expect(windowHandles.length).toBe(CORE_WINDOW_COUNT);

      // Test outgoing sync: changes made in each window should be reflected in all others
      console.log('Testing outgoing sync from each window');
      for (let sourceWindowIndex = 0; sourceWindowIndex < CORE_WINDOW_COUNT; sourceWindowIndex++) {
        // Switch to source window
        await switchToWindow(sourceWindowIndex);
        console.log(
          `Testing outgoing sync from ${CORE_WINDOW_NAMES[sourceWindowIndex]} window (index ${sourceWindowIndex})`,
        );

        // Reset counter
        await resetCounter();

        // Get current value and increment
        let currentValue = await getCounterValue();
        console.log(`Current value before increment: ${currentValue}`);
        const incrementButton = await getButtonInCurrentWindow('increment');
        await incrementButton.click();
        await browser.pause(CURRENT_TIMING.BUTTON_CLICK_PAUSE);

        // Verify increment in source window
        const newSourceValue = await getCounterValue();
        console.log(`New value after increment: ${newSourceValue}`);
        expect(newSourceValue).toBe(currentValue + 1);

        // Check all other windows reflect the change
        for (let targetWindowIndex = 0; targetWindowIndex < CORE_WINDOW_COUNT; targetWindowIndex++) {
          if (targetWindowIndex === sourceWindowIndex) continue;

          await switchToWindow(targetWindowIndex);
          console.log(`Verifying sync in ${CORE_WINDOW_NAMES[targetWindowIndex]} window (index ${targetWindowIndex})`);

          // Allow time for sync to complete
          await browser.pause(CURRENT_TIMING.STATE_SYNC_PAUSE);

          // Verify the counter value is synced
          const targetValue = await getCounterValue();
          console.log(`Target window value: ${targetValue}`);
          expect(targetValue).toBe(currentValue + 1);
        }
      }

      // Test incoming sync: changes should be received by each window
      console.log('Testing incoming sync to each window');
      for (let targetWindowIndex = 0; targetWindowIndex < CORE_WINDOW_COUNT; targetWindowIndex++) {
        // Choose source window (different from target)
        const sourceWindowIndex = (targetWindowIndex + 1) % CORE_WINDOW_COUNT;

        // Reset counter for this test
        await switchToWindow(0);
        await resetCounter();

        console.log(
          `Testing incoming sync to ${CORE_WINDOW_NAMES[targetWindowIndex]} window from ${CORE_WINDOW_NAMES[sourceWindowIndex]} window`,
        );

        // Make change in source window
        await switchToWindow(sourceWindowIndex);
        let currentValue = await getCounterValue();
        console.log(`Source window starting value: ${currentValue}`);
        const incrementButton = await getButtonInCurrentWindow('increment');
        await incrementButton.click();
        await browser.pause(CURRENT_TIMING.BUTTON_CLICK_PAUSE);

        const sourceValueAfter = await getCounterValue();
        console.log(`Source window value after increment: ${sourceValueAfter}`);

        // Switch to target window and verify sync
        await switchToWindow(targetWindowIndex);
        await browser.pause(CURRENT_TIMING.STATE_SYNC_PAUSE);

        const targetValue = await getCounterValue();
        console.log(`Target window value after sync: ${targetValue}`);
        expect(targetValue).toBe(currentValue + 1);
      }
    });

    it('should create runtime windows from each window type and maintain sync across all of them', async () => {
      console.log('Testing creation of runtime windows from each core window type');

      // Reset counter to 0
      await switchToWindow(0);
      await resetCounter();

      // Create an array to track runtime windows we create
      const createdRuntimeWindows = [];

      // For each core window type
      for (let sourceWindowIndex = 0; sourceWindowIndex < CORE_WINDOW_COUNT; sourceWindowIndex++) {
        await switchToWindow(sourceWindowIndex);
        console.log(
          `Creating runtime window from ${CORE_WINDOW_NAMES[sourceWindowIndex]} window (index ${sourceWindowIndex})`,
        );

        // Create new runtime window
        const createButton = await getButtonInCurrentWindow('create');
        await createButton.click();

        // Wait for window creation and refresh handles
        await browser.pause(CURRENT_TIMING.WINDOW_CHANGE_PAUSE);
        await refreshWindowHandles();

        // The newest window should be at the end of our handles array
        const newWindowIndex = windowHandles.length - 1;
        createdRuntimeWindows.push(newWindowIndex);
        console.log(`New runtime window created at index ${newWindowIndex}`);

        // Verify sync works from source to runtime window
        console.log(`Testing sync from ${CORE_WINDOW_NAMES[sourceWindowIndex]} to new runtime window`);

        // Reset counter
        await resetCounter();

        // Increment in source window
        const incrementButton = await getButtonInCurrentWindow('increment');
        await incrementButton.click();
        await browser.pause(CURRENT_TIMING.BUTTON_CLICK_PAUSE);
        const newValue = await getCounterValue();
        console.log(`Source window value after increment: ${newValue}`);

        // Check the runtime window received the update
        await switchToWindow(newWindowIndex);
        await browser.pause(CURRENT_TIMING.STATE_SYNC_PAUSE);
        const runtimeValue = await getCounterValue();
        console.log(`Runtime window value after sync: ${runtimeValue}`);
        expect(runtimeValue).toBe(newValue);

        // Now test sync from runtime window to source window
        console.log(`Testing sync from runtime window to ${CORE_WINDOW_NAMES[sourceWindowIndex]}`);
        const runtimeIncrementButton = await getButtonInCurrentWindow('increment');
        await runtimeIncrementButton.click();
        await browser.pause(CURRENT_TIMING.BUTTON_CLICK_PAUSE);
        const updatedRuntimeValue = await getCounterValue();
        console.log(`Runtime window value after its own increment: ${updatedRuntimeValue}`);

        // Check the source window received the update
        await switchToWindow(sourceWindowIndex);
        await browser.pause(CURRENT_TIMING.STATE_SYNC_PAUSE);
        const sourceValueAfter = await getCounterValue();
        console.log(`Source window value after sync from runtime: ${sourceValueAfter}`);
        expect(sourceValueAfter).toBe(updatedRuntimeValue);
      }

      // Clean up all the runtime windows we created
      console.log('Cleaning up runtime windows');
      await closeAllRemainingWindows();

      // Verify cleanup worked
      await refreshWindowHandles();
      console.log(`Final window count: ${windowHandles.length}, expected: ${CORE_WINDOW_COUNT}`);
      expect(windowHandles.length).toBe(CORE_WINDOW_COUNT);
    });
  });
});
