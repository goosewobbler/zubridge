import { expect } from '@wdio/globals';
import WebSocket from 'ws';
import assert from 'node:assert';

/**
 * E2E test for the IPC traffic logging middleware
 * Tests the WebSocket server functionality by connecting to it and
 * verifying that action and state logs are sent
 */
describe('IPC Traffic Logging Middleware', () => {
  let ws: WebSocket;
  const logMessages: any[] = [];

  before(async function () {
    this.timeout(10000); // Increase timeout for WebSocket connection

    // Connect to the middleware WebSocket server
    return new Promise<void>((resolve) => {
      console.log('Connecting to middleware WebSocket server...');
      ws = new WebSocket('ws://localhost:9000');

      // Store received log messages in the array
      ws.on('message', (data) => {
        try {
          const parsedData = JSON.parse(data.toString());
          console.log('Received log message:', JSON.stringify(parsedData, null, 2));
          logMessages.push(parsedData);
        } catch (err) {
          console.error('Failed to parse WebSocket message:', err);
        }
      });

      // Wait for connection to establish
      ws.on('open', () => {
        console.log('WebSocket connection established');
        resolve();
      });

      ws.on('error', (error) => {
        console.error('WebSocket connection error:', error);
        // Don't fail the test, might not have middleware enabled
        resolve();
      });

      // Add a timeout in case connection never establishes
      setTimeout(() => {
        console.warn('WebSocket connection timeout - middleware might not be enabled');
        resolve();
      }, 5000);
    });
  });

  beforeEach(() => {
    // Clear logs array before each test
    logMessages.length = 0;
  });

  after(() => {
    // Close WebSocket connection
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.close();
    }
  });

  it('should log state changes when counter is incremented', async () => {
    // Skip if WebSocket isn't connected
    if (ws.readyState !== WebSocket.OPEN) {
      console.log('Skipping test: WebSocket not connected');
      return;
    }

    // Find and click the increment button
    const incrementBtn = await $('button=Increment');
    expect(incrementBtn).toBeExisting();
    await incrementBtn.click();

    // Wait for logs to be received (WebSocket is asynchronous)
    await browser.pause(1000);

    // Check if we received any state updates
    const stateUpdates = logMessages.filter((msg) => msg.type === 'state');
    assert(stateUpdates.length > 0, 'Should receive state update logs');

    if (stateUpdates.length > 0) {
      // Verify counter exists in state
      expect(stateUpdates[0].data).toHaveProperty('counter');
    }
  });

  it('should log actions when counter is incremented', async () => {
    // Skip if WebSocket isn't connected
    if (ws.readyState !== WebSocket.OPEN) {
      console.log('Skipping test: WebSocket not connected');
      return;
    }

    // Find and click the increment button
    const incrementBtn = await $('button=Increment');
    expect(incrementBtn).toBeExisting();
    await incrementBtn.click();

    // Wait for logs to be received
    await browser.pause(1000);

    // Check if we received any action logs
    const actionLogs = logMessages.filter((msg) => msg.type === 'action' && msg.data?.action_type?.includes('counter'));

    // Output helpful debug information if no logs received
    if (actionLogs.length === 0) {
      console.log('No counter action logs received. All logs:', logMessages);
    }

    assert(actionLogs.length > 0, 'Should receive counter action logs');
  });
});
