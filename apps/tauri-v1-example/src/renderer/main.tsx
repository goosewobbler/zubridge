import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
// Import v1 APIs
import { getCurrent } from '@tauri-apps/api/window';
import { invoke } from '@tauri-apps/api/tauri';
import { listen } from '@tauri-apps/api/event';
import { initializeBridge, cleanupZubridge } from '@zubridge/tauri';
import '@zubridge/ui/styles.css';
import './styles/index.css';
import { MainApp } from './App.main.js';
import { RuntimeApp } from './App.runtime.js';

// App wrapper component to handle async loading
function AppWrapper() {
  const [isReady, setIsReady] = useState(false);
  const [windowLabel, setWindowLabel] = useState('main'); // Default to 'main'
  const [isRuntime, setIsRuntime] = useState(false); // Track window type
  const [bridgeInitialized, setBridgeInitialized] = useState(false);

  // Effect for setting up bridge and window info
  useEffect(() => {
    // Helper to wait for Tauri v1 globals
    const waitForTauri = async () => {
      // Use type assertion for checking specific properties
      while (
        !(window as any).__TAURI__ ||
        typeof (window as any).__TAURI__.invoke !== 'function' ||
        typeof (window as any).__TAURI__.event?.listen !== 'function'
      ) {
        console.log('[main.tsx v1] Waiting for window.__TAURI__ globals...');
        await new Promise((resolve) => setTimeout(resolve, 50)); // Wait 50ms
      }
      console.log('[main.tsx v1] window.__TAURI__ globals found.');
    };

    const setupApp = async () => {
      try {
        await waitForTauri(); // Wait for Tauri v1 globals

        // Initialize Zubridge with direct command names
        console.log('[main.tsx v1] Initializing Zubridge bridge with window.__TAURI__...');
        await initializeBridge({
          invoke,
          listen: listen as unknown as <E = unknown>(event: string, handler: (event: E) => void) => Promise<() => void>,
          commands: {
            getInitialState: 'get_initial_state',
            dispatchAction: 'dispatch_action',
            stateUpdateEvent: 'zubridge://state-update',
          },
        });
        console.log('[main.tsx v1] Zubridge bridge initialized.');
        setBridgeInitialized(true);

        // Fetch window info using v1 API
        const currentWindow = getCurrent();
        const label = currentWindow.label;
        setWindowLabel(label);

        // Identify runtime windows
        if (label.startsWith('runtime_')) {
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

    // Add cleanup
    return () => {
      console.log('[main.tsx v1] Cleaning up Zubridge...');
      cleanupZubridge();
    };
  }, []); // Run setup once on mount

  // Show loading screen while getting info & initializing bridge
  if (!isReady || !bridgeInitialized) {
    return <div>Loading Window Info & Initializing Bridge...</div>;
  }

  return isRuntime ? <RuntimeApp windowLabel={windowLabel} /> : <MainApp windowLabel={windowLabel} />;
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
