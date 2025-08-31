import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { cleanupZubridge, initializeBridge } from '@zubridge/tauri';
import { withTauri } from '@zubridge/ui/tauri';
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '@zubridge/ui/styles.css';
import './styles/index.css';

// Create the Tauri app component
const TauriApp = withTauri();

type WindowType = 'main' | 'secondary' | 'runtime';

function AppWrapper() {
  const [windowType, setWindowType] = useState<WindowType>('main');
  const [windowLabel, setWindowLabel] = useState('main');
  const [bridgeInitialized, setBridgeInitialized] = useState(false);

  useEffect(() => {
    const setupApp = async () => {
      try {
        // Fetch window info first
        const currentWindow = WebviewWindow.getCurrent();
        const label = currentWindow.label;
        setWindowLabel(label);
        if (label.startsWith('runtime_')) {
          setWindowType('runtime');
        } else if (label === 'main') {
          setWindowType('main');
        } else {
          setWindowType('secondary');
        }
        // Initialize Zubridge bridge
        await initializeBridge({
          invoke,
          listen: listen as <E = unknown>(
            event: string,
            handler: (event: E) => void,
          ) => Promise<UnlistenFn>,
        });
        setBridgeInitialized(true);
      } catch (_error) {
        setWindowLabel('error-label');
        setBridgeInitialized(false);
      }
    };
    setupApp();
    return () => {
      cleanupZubridge();
    };
  }, []);

  if (!bridgeInitialized) {
    return <div>Initializing Bridge...</div>;
  }

  // Placeholder/noop handlers for Tauri
  // const actionHandlers = {
  //   createWindow: async () => ({ success: false, error: 'Not implemented' }),
  //   closeWindow: async () => ({ success: false, error: 'Not implemented' }),
  //   quitApp: async () => ({ success: false, error: 'Not implemented' }),
  //   doubleCounter: (_counter: number) => undefined,
  //   doubleCounterSlow: (_counter: number) => undefined,
  //   distinctiveCounter: (_counter: number) => undefined,
  //   distinctiveCounterSlow: (_counter: number) => undefined,
  //   doubleCounterWithGetStateOverride: (_counter: number) => undefined,
  // };

  // // Subscription handlers (no-op for now)
  // const handleSubscribe = async (_keys: string[]) => {};
  // const handleUnsubscribe = async (_keys: string[]) => {};

  return (
    <TauriApp
      windowInfo={{
        id: windowLabel,
        type: windowType,
        platform: 'tauri',
      }}
      windowTitle={`${windowType.charAt(0).toUpperCase() + windowType.slice(1)} Window`}
      appName={'Zubridge - Tauri Example'}
    />
  );
}

const container = document.getElementById('root');
const root = createRoot(container!);
root.render(
  <React.StrictMode>
    <AppWrapper />
  </React.StrictMode>,
);
