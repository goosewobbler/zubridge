// @ts-ignore: React is used for JSX
import React from 'react';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
// Import the Zustand store hook
import { useStore } from './store';
import type { AppAction } from './bridge'; // Import action type
import './styles/runtime-window.css';

interface RuntimeAppProps {
  windowLabel: string;
  appMode: string;
  dispatch: (action: AppAction) => void; // Add dispatch prop
}

export function RuntimeApp({ windowLabel, appMode, dispatch }: RuntimeAppProps) {
  // Get counter from Zustand store
  const count = useStore((state) => state.counter); // Use 'count' for consistency

  const incrementCounter = () => {
    dispatch({ type: 'INCREMENT' });
  };

  const decrementCounter = () => {
    dispatch({ type: 'DECREMENT' });
  };

  // Use Tauri API for window creation
  const createWindow = () => {
    const uniqueLabel = `runtime_${Date.now()}`;
    const webview = new WebviewWindow(uniqueLabel, {
      url: '/',
      title: `Runtime Window (${uniqueLabel})`,
      width: 600,
      height: 400,
    });
    webview.once('tauri://created', () => console.log(`Window ${uniqueLabel} created`));
    webview.once('tauri://error', (e) => console.error(`Failed to create window ${uniqueLabel}:`, e));
  };

  const closeWindow = async () => {
    try {
      const currentWindow = WebviewWindow.getCurrent();
      await currentWindow.close();
    } catch (error) {
      console.error('Error closing window:', error);
    }
  };

  return (
    <div className="app-container runtime-window">
      <div className="fixed-header">
        Window: <span className="window-id">{windowLabel}</span> | Mode: {appMode}
      </div>
      <div className="content">
        <div className="counter-section">
          <h2>Counter: {count}</h2>
          <div className="button-group">
            <button onClick={decrementCounter}>-</button>
            <button onClick={incrementCounter}>+</button>
          </div>
        </div>
        {/* ... window section unchanged ... */}
      </div>
    </div>
  );
}
