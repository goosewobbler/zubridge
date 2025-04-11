// @ts-ignore: React is used for JSX transformation
import React from 'react';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow'; // Corrected: For creating windows
import { invoke } from '@tauri-apps/api/core'; // Corrected: For calling Rust commands
// import { exit } from '@tauri-apps/api/app'; // Removed incorrect import
// Assuming zustand store setup remains similar, import the hook
// import { useStore } from './hooks/useStore';
import './styles/main-window.css';
// Removed import for ./types if it was Electron specific
// Removed import for @zubridge/electron hook
// Import the event listener API
import { listen } from '@tauri-apps/api/event';
// Import the Zustand store hook
import { useStore } from './store';
import type { AppAction } from './bridge'; // Import action type

interface MainAppProps {
  windowLabel: string;
  appMode: string;
  dispatch: (action: AppAction) => void; // Add dispatch prop
}

export function MainApp({ windowLabel, appMode, dispatch }: MainAppProps) {
  // Get counter from Zustand store
  const counter = useStore((state) => state.counter);
  // Determine if main window based on label (no local state needed)
  const isMainWindow = windowLabel === 'main';

  const handleIncrement = () => {
    dispatch({ type: 'INCREMENT' });
  };

  const handleDecrement = () => {
    dispatch({ type: 'DECREMENT' });
  };

  const handleCreateWindow = () => {
    // Create a new window with a unique label
    const uniqueLabel = `runtime_${Date.now()}`;
    const webview = new WebviewWindow(uniqueLabel, {
      url: '/', // Load the same index.html
      title: `Runtime Window (${uniqueLabel})`,
      width: 600,
      height: 400,
    });

    webview.once('tauri://created', function () {
      console.log(`Window ${uniqueLabel} created`);
    });
    webview.once('tauri://error', function (e) {
      console.error(`Failed to create window ${uniqueLabel}:`, e);
    });
  };

  // Updated to use invoke for the backend command
  const handleQuitApp = async () => {
    try {
      await invoke('quit_app');
    } catch (error) {
      console.error('Error invoking quit_app:', error);
    }
  };

  return (
    <div className="app-container">
      <div className="fixed-header">
        {/* Display window label and mode */}
        Window: <span className="window-id">{windowLabel}</span> {isMainWindow ? '(Main)' : ''} | Mode: {appMode}
      </div>

      <div className="content">
        <div className="counter-section">
          <h2>Counter: {counter}</h2>
          <div className="button-group">
            <button onClick={handleDecrement}>-</button>
            <button onClick={handleIncrement}>+</button>
          </div>
        </div>

        <div className="window-section">
          <div className="button-group window-button-group">
            <button onClick={handleCreateWindow}>Create Window</button>
            {/* Quit button only makes sense in the main window */}
            {isMainWindow && (
              <button onClick={handleQuitApp} className="close-button">
                Quit App
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
