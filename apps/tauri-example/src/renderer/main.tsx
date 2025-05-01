import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { initializeBridge, cleanupZubridge } from '@zubridge/tauri';
// Import UI package styles before local styles
import '@zubridge/ui/styles.css';
import './styles/index.css';
import { MainApp } from './App.main';
import { RuntimeApp } from './App.runtime';

function AppWrapper() {
  const [isReady, setIsReady] = useState(false);
  const [windowLabel, setWindowLabel] = useState('main');
  const [windowType, setWindowType] = useState<'main' | 'secondary' | 'runtime'>('main');
  const [bridgeInitialized, setBridgeInitialized] = useState(false);

  useEffect(() => {
    const setupApp = async () => {
      try {
        // Fetch window info first
        const currentWindow = WebviewWindow.getCurrent();
        const label = currentWindow.label;
        console.log(`[main.tsx] Current window label: ${label}`);
        setWindowLabel(label);
        setIsReady(true);

        // Determine window type based on label
        if (label.startsWith('runtime_')) {
          setWindowType('runtime');
        } else if (label === 'main') {
          setWindowType('main');
        } else {
          setWindowType('secondary');
        }

        // Initialize Zubridge immediately
        try {
          console.log('[main.tsx] Initializing Zubridge bridge immediately...');
          await initializeBridge({
            invoke,
            // Cast listen type as needed by initializeBridge
            listen: listen as <E = unknown>(event: string, handler: (event: E) => void) => Promise<UnlistenFn>,
          });
          console.log('[main.tsx] Zubridge bridge initialized successfully');
          setBridgeInitialized(true); // Bridge is initialized
        } catch (bridgeError) {
          console.error('[main.tsx] Error initializing Zubridge:', bridgeError);
          // Handle bridge initialization error if needed
        }
      } catch (error) {
        console.error('[main.tsx] Error setting up app (before bridge init):', error);
        setWindowLabel('error-label');
        // Still set isReady true even on error to potentially show an error state
        setIsReady(true);
      }
    };

    setupApp();

    // Cleanup function
    return () => {
      console.log('[main.tsx] Cleaning up Zubridge...');
      cleanupZubridge();
    };
  }, []);

  if (!isReady) {
    return <div>Loading Window Info...</div>;
  }

  if (!bridgeInitialized) {
    return <div>Initializing Bridge...</div>;
  }

  return windowType === 'runtime' ? <RuntimeApp windowLabel={windowLabel} /> : <MainApp windowLabel={windowLabel} />;
}

const container = document.getElementById('root');
const root = createRoot(container!);
root.render(
  <React.StrictMode>
    <AppWrapper />
  </React.StrictMode>,
);
