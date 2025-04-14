// @ts-ignore: React is used for JSX transformation
import React from 'react';
// Use v1 API paths
import { WebviewWindow } from '@tauri-apps/api/window';
// Import invoke specific to v1
import { invoke } from '@tauri-apps/api/tauri';
import './styles/main-window.css';
// Import Zubridge hooks
import { useZubridgeStore, useZubridgeDispatch } from '@zubridge/tauri';
import type { AnyState } from '@zubridge/tauri';

interface MainAppProps {
  windowLabel: string;
}

interface AppState extends AnyState {
  counter?: number;
}

export function MainApp({ windowLabel }: MainAppProps) {
  console.log('[App.main] Renderer process loaded.');

  const dispatch = useZubridgeDispatch();
  const counter = useZubridgeStore<number>((state: AppState) => state.counter ?? 0);
  const bridgeStatus = useZubridgeStore((state) => state.__zubridge_status);
  const isMainWindow = windowLabel === 'main';

  const handleIncrement = () => {
    const action = { type: 'INCREMENT_COUNTER' };
    console.log(`[App.main] Dispatching:`, action);
    dispatch(action);
  };

  const handleDecrement = () => {
    const action = { type: 'DECREMENT_COUNTER' };
    console.log(`[App.main] Dispatching:`, action);
    dispatch(action);
  };

  const handleCreateWindow = () => {
    const uniqueLabel = `runtime_${Date.now()}`;
    const webview = new WebviewWindow(uniqueLabel, {
      url: window.location.pathname,
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
        Window: <span className="window-id">{windowLabel}</span>
        {/* Display bridge status (optional) */}
        <span style={{ marginLeft: '10px', fontSize: '0.8em', color: 'grey' }}>(Bridge: {bridgeStatus})</span>
      </div>

      <div className="content">
        <div className="counter-section">
          {/* Show loading indicator while initializing */}
          <h2>Counter: {bridgeStatus === 'initializing' ? '...' : counter}</h2>
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
