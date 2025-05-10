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
  __bridge_status?: 'initializing' | 'connected' | 'error';
}

// Define our action types
type CounterActions =
  | { type: 'COUNTER:INCREMENT'; payload?: number }
  | { type: 'COUNTER:DECREMENT'; payload?: number }
  | { type: 'COUNTER:SET'; payload: number }
  | { type: 'THEME:TOGGLE' };

// Example component that demonstrates state management with Zubridge
export function App(): JSX.Element {
  // Get state from Zubridge store with proper typing
  const counter = useElectronZubridgeStore<number>((state: AppState) => state.counter ?? 0);
  const isDarkTheme = useElectronZubridgeStore<boolean>((state: AppState) => state.theme?.isDark ?? false);

  // Get dispatch function with typed actions
  const dispatch = useElectronZubridgeDispatch<AppState, CounterActions>();

  // Track bridge connection status
  const bridgeStatus = useElectronZubridgeStore<string>((state: AppState) => state.__bridge_status ?? 'initializing');

  // Debug state to show middleware connection
  const [middlewareConnected, setMiddlewareConnected] = useState<boolean>(false);

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
      // Messages from middleware are MessagePack encoded
      // Would need MessagePack library to decode in real app
      console.log('Received message from middleware');
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
          </div>
        </div>

        <div className="theme-container">
          <h2>Theme: {isDarkTheme ? 'Dark' : 'Light'}</h2>
          <button onClick={handleToggleTheme}>Toggle Theme</button>
        </div>

        <div className="info-panel">
          <h3>How It Works</h3>
          <p>This app demonstrates Zubridge with middleware integration:</p>
          <ul>
            <li>Actions are dispatched from the frontend using useElectronZubridgeDispatch</li>
            <li>The Electron main process processes these actions through the middleware</li>
            <li>State updates are synced back to the frontend automatically</li>
            <li>The WebSocket server allows external debugging of the state flow</li>
          </ul>
          <p>Open the browser console and a WebSocket client to see the full middleware communication.</p>
        </div>
      </main>
    </div>
  );
}

export default App;
