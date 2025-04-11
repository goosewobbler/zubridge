import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
// import { getCurrent } from '@tauri-apps/api/window'; // Removed incorrect import
import { WebviewWindow } from '@tauri-apps/api/webviewWindow'; // Import WebviewWindow
import type { UnlistenFn } from '@tauri-apps/api/event'; // Import UnlistenFn type
import './styles/main-window.css';
import { MainApp } from './App.main'; // Assuming .tsx extension resolution
import { RuntimeApp } from './App.runtime'; // Assuming .tsx extension resolution
// Import bridge functions
import { initializeState, setupStateListener, dispatchAction } from './bridge';

// Log the whole env object
console.log('import.meta.env:', import.meta.env);

// Read mode using the VITE_ prefix
const appMode = import.meta.env.VITE_APP_MODE || 'basic';
console.log('Detected App Mode:', appMode); // Log detected mode

// App wrapper component to handle async loading
function AppWrapper() {
  const [isReady, setIsReady] = useState(false);
  const [windowLabel, setWindowLabel] = useState('main'); // Default to 'main'
  const [isRuntime, setIsRuntime] = useState(false); // Track window type

  // Effect for setting up bridge and window info
  useEffect(() => {
    let unlistenState: UnlistenFn | null = null;

    const setupApp = async () => {
      try {
        // Initialize bridge state
        await initializeState();
        // Setup listener
        unlistenState = await setupStateListener();

        // Fetch window info
        const currentWindow = WebviewWindow.getCurrent();
        const label = currentWindow.label;
        setWindowLabel(label);

        // Assume windows not labeled 'main' are runtime windows
        if (label !== 'main') {
          setIsRuntime(true);
        }
      } catch (error) {
        console.error('Error setting up app:', error);
        setWindowLabel('error-label');
      } finally {
        setIsReady(true);
      }
    };

    setupApp();

    // Cleanup listener on unmount
    return () => {
      if (unlistenState) {
        console.log('Cleaning up state listener...');
        unlistenState();
      }
    };
  }, []); // Run setup once on mount

  // Show loading screen while getting info
  if (!isReady) {
    return <div>Loading Window Info...</div>;
  }

  // Pass windowLabel, appMode, and dispatch function
  const handleDispatch = (action: any) => dispatchAction(action, appMode);

  return isRuntime ? (
    <RuntimeApp windowLabel={windowLabel} appMode={appMode} dispatch={handleDispatch} />
  ) : (
    <MainApp windowLabel={windowLabel} appMode={appMode} dispatch={handleDispatch} />
  );
}

// Get the DOM container element
const container = document.getElementById('root');

// Create React root and render the app
const root = createRoot(container!);
root.render(
  <React.StrictMode>
    <AppWrapper />
  </React.StrictMode>,
);
