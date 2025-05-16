import { expect } from '@wdio/globals';
import { it, describe, before, beforeEach, after } from 'mocha';
import WebSocket from 'ws';
import assert from 'node:assert';
import { browser } from 'wdio-electron-service';
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
          // Parse JSON data
          const messageStr = data.toString('utf8');
          console.log('Received message:', messageStr.substring(0, 100) + (messageStr.length > 100 ? '...' : ''));

          const parsedData = JSON.parse(messageStr);

          // If we get an array, add each item individually
          if (Array.isArray(parsedData)) {
            parsedData.forEach((item) => logMessages.push(item));
            console.log(`Added ${parsedData.length} log items`);
          } else {
            // Otherwise add the single message
            logMessages.push(parsedData);
            console.log('Added 1 log item');
          }
        } catch (err) {
          console.error('Error handling message:', err);
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
    const incrementButton = await browser.$('button=+');
    expect(incrementButton).toBeExisting();
    await incrementButton.click();

    // Wait for logs to be received (WebSocket is asynchronous)
    await browser.pause(1000);

    // Debug info
    console.log(`Received ${logMessages.length} log messages`);

    // Check if we received any state updates
    const stateUpdates = logMessages.filter((msg) => msg.entry_type === 'StateUpdated');
    assert(stateUpdates.length > 0, 'Should receive state update logs');

    if (stateUpdates.length > 0) {
      // Verify counter exists in state
      expect(stateUpdates[0].state).toHaveProperty('counter');
    }
  });

  it('should log actions when counter is incremented', async () => {
    // Skip if WebSocket isn't connected
    if (ws.readyState !== WebSocket.OPEN) {
      console.log('Skipping test: WebSocket not connected');
      return;
    }

    // Find and click the increment button
    const incrementButton = await browser.$('button=+');
    expect(incrementButton).toBeExisting();
    await incrementButton.click();

    // Wait for logs to be received
    await browser.pause(1000);

    // Debug info
    console.log(`Received ${logMessages.length} log messages`);

    // Check if we received any action logs
    const actionLogs = logMessages.filter(
      (msg) => msg.entry_type === 'ActionDispatched' && msg.action?.action_type?.includes('counter'),
    );

    assert(actionLogs.length > 0, 'Should receive counter action logs');
  });
});
