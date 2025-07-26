// Example React client for an Electron app using @zubridge/electron with middleware
// This file would be part of your React frontend

import React, { useEffect, useState } from 'react';
import { useElectronZubridgeStore, useElectronZubridgeDispatch } from '@zubridge/electron';

// Define our app state interfaces
interface ThemeState {
  isDark: boolean;
}

interface AppState {
  counter: number;
  theme?: ThemeState;
  lastActionProcessingTime?: number;
  __bridge_status?: 'initializing' | 'connected' | 'error';
}

// Define our action types
type CounterActions =
  | { type: 'COUNTER:INCREMENT'; payload?: number }
  | { type: 'COUNTER:DECREMENT'; payload?: number }
  | { type: 'COUNTER:SET'; payload: number }
  | { type: 'COUNTER:INCREMENT_SLOW' }
  | { type: 'THEME:TOGGLE' };

// Example component that demonstrates state management with Zubridge
export function App(): JSX.Element {
  // Get state from Zubridge store with proper typing
  const counter = useElectronZubridgeStore<number>((state: AppState) => state.counter ?? 0);
  const isDarkTheme = useElectronZubridgeStore<boolean>((state: AppState) => state.theme?.isDark ?? false);
  const lastProcessingTime = useElectronZubridgeStore<number | undefined>(
    (state: AppState) => state.lastActionProcessingTime,
  );

  // Get dispatch function with typed actions
  const dispatch = useElectronZubridgeDispatch<AppState, CounterActions>();

  // Track bridge connection status
  const bridgeStatus = useElectronZubridgeStore<string>((state: AppState) => state.__bridge_status ?? 'initializing');

  // Debug state to show middleware connection
  const [middlewareConnected, setMiddlewareConnected] = useState<boolean>(false);
  // Store performance metrics from WebSocket
  const [performanceMetrics, setPerformanceMetrics] = useState<any[]>([]);

  // Connect to middleware WebSocket for direct communication (optional)
  useEffect(() => {
    // This is completely optional - the middleware works without this connection
    // This just demonstrates how you could connect directly to the WebSocket for debugging
    const socket = new WebSocket('ws://localhost:9000');

    socket.onopen = (): void => {
      console.log('Connected to middleware WebSocket');
      setMiddlewareConnected(true);
    };

    socket.onclose = (): void => {
      console.log('Disconnected from middleware WebSocket');
      setMiddlewareConnected(false);
    };

    socket.onmessage = (event: MessageEvent): void => {
      try {
        // Parse the message as JSON
        const data = JSON.parse(event.data);

        // Check if this is a performance-related entry
        if (data.processing_metrics) {
          // Add it to our metrics history (limited to last 5 entries)
          setPerformanceMetrics((prev) => {
            const newMetrics = [...prev, data];
            return newMetrics.slice(-5); // Keep only the last 5 entries
          });
        }
      } catch (error) {
        console.error('Error parsing middleware message:', error);
      }
    };

    return () => {
      socket.close();
    };
  }, []);

  // Apply theme based on state
  useEffect(() => {
    document.body.className = isDarkTheme ? 'dark-theme' : 'light-theme';
  }, [isDarkTheme]);

  // Action handlers with typed dispatch
  const handleIncrement = (): void => {
    dispatch({ type: 'COUNTER:INCREMENT', payload: 1 });
  };

  const handleDecrement = (): void => {
    dispatch({ type: 'COUNTER:DECREMENT', payload: 1 });
  };

  const handleSlowIncrement = (): void => {
    dispatch({ type: 'COUNTER:INCREMENT_SLOW' });
  };

  const handleReset = (): void => {
    dispatch({ type: 'COUNTER:SET', payload: 0 });
  };

  const handleToggleTheme = (): void => {
    dispatch({ type: 'THEME:TOGGLE' });
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>Zubridge + Middleware Example</h1>
        <div className={`status ${bridgeStatus === 'connected' ? 'status-ready' : 'status-error'}`}>
          Bridge: {bridgeStatus}
        </div>
        <div className={`status ${middlewareConnected ? 'status-ready' : 'status-error'}`}>
          Middleware: {middlewareConnected ? 'Connected' : 'Disconnected'}
        </div>
      </header>

      <main>
        <div className="counter-container">
          <h2>Counter: {counter}</h2>
          <div className="button-group">
            <button onClick={handleDecrement}>Decrement</button>
            <button onClick={handleReset}>Reset</button>
            <button onClick={handleIncrement}>Increment</button>
            <button onClick={handleSlowIncrement}>Slow Increment</button>
          </div>
        </div>

        <div className="theme-container">
          <h2>Theme: {isDarkTheme ? 'Dark' : 'Light'}</h2>
          <button onClick={handleToggleTheme}>Toggle Theme</button>
        </div>

        {/* Performance metrics display */}
        <div className="metrics-container">
          <h2>Performance Metrics</h2>
          {lastProcessingTime && (
            <div className="metrics-panel">
              <h3>Last Action Processing Time</h3>
              <div className="metric-value">{lastProcessingTime.toFixed(2)} ms</div>
            </div>
          )}

          {performanceMetrics.length > 0 && (
            <div className="metrics-history">
              <h3>Recent Actions</h3>
              <table>
                <thead>
                  <tr>
                    <th>Action</th>
                    <th>Total Time</th>
                    <th>Processing</th>
                    <th>IPC</th>
                  </tr>
                </thead>
                <tbody>
                  {performanceMetrics.map((metric, index) => {
                    const actionType = metric.action?.action_type || 'Unknown';
                    const totalTime = metric.processing_metrics?.total_ms || 0;
                    const processingTime = metric.processing_metrics?.action_processing_ms || 0;
                    const ipcTime = totalTime - processingTime || 0;

                    return (
                      <tr key={index}>
                        <td>{actionType}</td>
                        <td>{totalTime.toFixed(2)} ms</td>
                        <td>{processingTime.toFixed(2)} ms</td>
                        <td>{ipcTime.toFixed(2)} ms</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="info-panel">
          <h3>How It Works</h3>
          <p>This app demonstrates Zubridge with middleware integration:</p>
          <ul>
            <li>Actions are dispatched from the frontend using useElectronZubridgeDispatch</li>
            <li>The Electron main process processes these actions through the middleware</li>
            <li>Performance metrics are collected at each step of the IPC flow</li>
            <li>State updates are synced back to the frontend automatically</li>
            <li>The WebSocket server allows external debugging of the state flow</li>
          </ul>
          <p>Try the "Slow Increment" button to see the difference in performance metrics!</p>
        </div>
      </main>
    </div>
  );
}

export default App;
